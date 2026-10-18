import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { getDocument } from '@/lib/pdfjs';

export async function pdfToDocx(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;

  const sections = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    // top to bottom, then left to right (transform[4] is x, transform[5] is y)
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) < 5) {
        return a.transform[4] - b.transform[4];
      }
      return yDiff;
    });

    const pageChildren: Paragraph[] = [];

    // word uses twips, 1 pt = 20 twips
    const PT_TO_TWIP = 20;
    const LEFT_MARGIN_OFFSET = items.length > 0 ? Math.min(...items.map((it) => it.transform[4])) : 0;

    let lastY = -1;
    let currentLineItems: any[] = [];

    const processLine = (lineItems: any[]) => {
      if (lineItems.length === 0) return;

      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      const firstItem = lineItems[0];
      const indentation = Math.max(0, (firstItem.transform[4] - LEFT_MARGIN_OFFSET) * PT_TO_TWIP);
      const fontSize = Math.abs(firstItem.transform[0]);

      const children: TextRun[] = [];
      let lastX = firstItem.transform[4];

      for (const it of lineItems) {
        // fill big gaps with spaces
        const gap = it.transform[4] - lastX;
        if (gap > 4) {
          const charWidth = fontSize * 0.35;
          const spaceCount = Math.max(1, Math.floor(gap / charWidth));
          children.push(new TextRun({ text: ' '.repeat(spaceCount), size: fontSize * 2 }));
        }

        children.push(
          new TextRun({
            text: it.str,
            size: fontSize * 2,
          }),
        );

        lastX = it.transform[4] + (it.width || 0);
      }

      pageChildren.push(
        new Paragraph({
          children: children,
          indent: { left: indentation },
          spacing: {
            before: lastY !== -1 ? Math.max(0, (lastY - firstItem.transform[5] - fontSize * 1.2) * PT_TO_TWIP) : 0,
          },
        }),
      );
    };

    for (const item of items) {
      if (lastY === -1 || Math.abs(item.transform[5] - lastY) < 5) {
        currentLineItems.push(item);
      } else {
        processLine(currentLineItems);
        currentLineItems = [item];
      }
      lastY = item.transform[5];
    }
    processLine(currentLineItems);

    sections.push({
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 }, // 0.5 inch
        },
      },
      children: pageChildren,
    });
  }

  const doc = new Document({
    sections: sections,
  });

  return await Packer.toBlob(doc);
}

export async function csvToExcel(file: File): Promise<Blob> {
  const text = await file.text();
  const workbook = XLSX.read(text, { type: 'string' });
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function jsonToExcel(file: File): Promise<Blob> {
  const text = await file.text();
  const jsonData = JSON.parse(text);
  const worksheet = XLSX.utils.json_to_sheet(Array.isArray(jsonData) ? jsonData : [jsonData]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function jsonToCsv(file: File): Promise<Blob> {
  const text = await file.text();
  const jsonData = JSON.parse(text);
  const worksheet = XLSX.utils.json_to_sheet(Array.isArray(jsonData) ? jsonData : [jsonData]);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return new Blob([csv], { type: 'text/csv' });
}

// the pdf font (helvetica) only has latin characters, anything outside this set can't be drawn
const NOT_IN_FONT = /[^\n\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu;

// swap tabs, odd spaces and dashes for ones the font has, drop invisible ones
function tidyText(text: string) {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[ -   　]/g, ' ')
    .replace(/[‐-‒−]/g, '-')
    .replace(/[​-‍⁠﻿]/g, '');
}

export function hasUnsupportedText(text: string) {
  return tidyText(text).search(NOT_IN_FONT) !== -1;
}

// break each paragraph into lines that fit the page width
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.match(/\s*\S+/g) ?? []) {
      if (fits(line + word)) {
        line += word;
        continue;
      }
      if (line) lines.push(line);
      line = word.trimStart();
      // a word wider than the page (like a long link) gets cut where it fits
      while (!fits(line)) {
        let lo = 1;
        let hi = Math.min(line.length - 1, 400);
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (fits(line.slice(0, mid))) lo = mid;
          else hi = mid - 1;
        }
        lines.push(line.slice(0, lo));
        line = line.slice(lo);
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function textToPdf(text: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageSize: [number, number] = [595.28, 841.89]; // A4
  const fontSize = 12;
  const lineHeight = fontSize * 1.4;
  const margin = 56;
  const top = pageSize[1] - margin - fontSize;
  const lines = wrapText(tidyText(text).replace(NOT_IN_FONT, '').trimEnd(), font, fontSize, pageSize[0] - margin * 2);

  let page = pdfDoc.addPage(pageSize);
  let y = top;
  for (const line of lines) {
    if (y < margin) {
      page = pdfDoc.addPage(pageSize);
      y = top;
    }
    if (line) page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }

  return await pdfDoc.save();
}
