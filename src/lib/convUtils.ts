import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

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
