import * as pdfjsLib from 'pdfjs-dist';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Configure PDF.js worker using same version as main lib
const PDFJS_VERSION = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export async function pdfToDocx(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const sections = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];
    
    // Sort items by vertical position (top to bottom) then horizontal (left to right)
    // transform[5] is Y coordinate, transform[4] is X coordinate
    items.sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) < 5) { // Roughly same line
        return a.transform[4] - b.transform[4];
      }
      return yDiff;
    });

    const pageChildren: Paragraph[] = [];

    // Estimate points to twips conversion (Word uses twips: 1/1440 inch, PDF uses points: 1/72 inch)
    // 1 point = 20 twips
    const PT_TO_TWIP = 20;
    const LEFT_MARGIN_OFFSET = items.length > 0 ? Math.min(...items.map(it => it.transform[4])) : 0;

    let lastY = -1;
    let currentLineItems: any[] = [];

    const processLine = (lineItems: any[]) => {
      if (lineItems.length === 0) return;
      
      // Sort items in line by X
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
      
      const firstItem = lineItems[0];
      const indentation = Math.max(0, (firstItem.transform[4] - LEFT_MARGIN_OFFSET) * PT_TO_TWIP);
      const fontSize = Math.abs(firstItem.transform[0]);
      
      const children: TextRun[] = [];
      let lastX = firstItem.transform[4];
      
      for (const it of lineItems) {
        const gap = it.transform[4] - lastX;
        if (gap > 4) { // Meaningful horizontal gap
          const charWidth = fontSize * 0.35; // Heuristic
          const spaceCount = Math.max(1, Math.floor(gap / charWidth));
          children.push(new TextRun({ text: " ".repeat(spaceCount), size: fontSize * 2 }));
        }
        
        children.push(new TextRun({
          text: it.str,
          size: fontSize * 2,
        }));
        
        // Update lastX to the end of this item if width is available
        const itemWidth = it.width || 0;
        lastX = it.transform[4] + itemWidth;
      }
      
      pageChildren.push(new Paragraph({
        children: children,
        indent: { left: indentation },
        spacing: { 
          before: lastY !== -1 ? Math.max(0, (lastY - firstItem.transform[5] - fontSize * 1.2) * PT_TO_TWIP) : 0 
        },
      }));
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
          margin: { top: 720, right: 720, bottom: 720, left: 720 }, // 0.5 inch margins
        }
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
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
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
  const { width, height } = page.getSize();
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
