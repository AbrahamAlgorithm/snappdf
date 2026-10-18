import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

export async function textToPdf(file: File): Promise<Uint8Array> {
  const text = await file.text();
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const lines = text.split('\n');
  let page = pdfDoc.addPage();
  const { height } = page.getSize();
  const fontSize = 12;
  const margin = 50;
  let y = height - margin;

  for (const line of lines) {
    if (y < margin + fontSize) {
      page = pdfDoc.addPage();
      y = height - margin;
    }
    page.drawText(line, {
      x: margin,
      y: y,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0),
    });
    y -= fontSize * 1.2;
  }

  return await pdfDoc.save();
}
