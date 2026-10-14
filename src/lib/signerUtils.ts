import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

export interface SignatureItem {
  id: string;
  url: string;
  name: string;
  pageIndex: number; // 0-indexed
  xPercent: number; // 0 to 100 (% of page width)
  yPercent: number; // 0 to 100 (% of page height from top)
  widthPercent: number; // % of page width
  heightPercent: number; // % of page height
  aspectRatio: number; // width / height
  rotation?: number; // rotation angle in degrees clockwise (0 to 360)
  removeWhiteBg?: boolean;
}

/**
 * Render a single PDF page at high quality to a data URL and returns dimensions
 */
export async function renderPdfPageHighRes(
  pdfData: ArrayBuffer | Uint8Array,
  pageIndex: number,
  scale: number = 1.6
): Promise<{ dataUrl: string; width: number; height: number }> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas context could not be created');
  }

  await page.render({
    canvasContext: context,
    viewport,
  } as any).promise;

  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    width: viewport.width,
    height: viewport.height,
  };
}

/**
 * Converts an image URL (dataURL or blob URL) into PNG bytes for pdf-lib embedding.
 * Also optionally removes white/off-white background.
 */
export async function processSignatureToPngBytes(
  imageUrl: string,
  removeWhiteBg: boolean = false
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not get canvas context'));

      ctx.drawImage(img, 0, 0);

      if (removeWhiteBg) {
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            // If the pixel is very bright / white, make it transparent
            if (r > 220 && g > 220 && b > 220) {
              d[i + 3] = 0; // alpha = 0
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (e) {
          console.warn('Could not filter white background', e);
        }
      }

      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Failed to generate PNG blob'));
        const arrayBuf = await blob.arrayBuffer();
        resolve(new Uint8Array(arrayBuf));
      }, 'image/png');
    };
    img.onerror = (e) => reject(new Error(`Failed to load signature image: ${e}`));
    img.src = imageUrl;
  });
}

/**
 * Embeds signatures / overlays into a PDF at exact scale and coordinates
 */
export async function embedSignaturesIntoPdf(
  sourcePdfBytes: ArrayBuffer | Uint8Array,
  signatures: SignatureItem[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });

  for (const sig of signatures) {
    if (sig.pageIndex < 0 || sig.pageIndex >= pdfDoc.getPageCount()) {
      continue;
    }

    try {
      const pngBytes = await processSignatureToPngBytes(sig.url, !!sig.removeWhiteBg);
      const embeddedPng = await pdfDoc.embedPng(pngBytes);

      const page = pdfDoc.getPage(sig.pageIndex);
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      // Convert percentages to PDF points
      const destWidth = (sig.widthPercent / 100) * pageWidth;
      const destHeight = (sig.heightPercent / 100) * pageHeight;
      const destX = (sig.xPercent / 100) * pageWidth;

      // In PDF, (0,0) is bottom-left, so we flip the Y axis from top-left
      const destY = pageHeight - ((sig.yPercent / 100) * pageHeight) - destHeight;

      const rotDeg = ((sig.rotation || 0) % 360 + 360) % 360;

      if (rotDeg === 0) {
        page.drawImage(embeddedPng, {
          x: destX,
          y: destY,
          width: destWidth,
          height: destHeight,
        });
      } else {
        // Calculate center of destination box in PDF coordinates
        const centerX = destX + destWidth / 2;
        const centerY = destY + destHeight / 2;

        // In PDF coordinates (+y is UP), clockwise rotation corresponds to -rotDeg
        const angleDeg = -rotDeg;
        const rad = (angleDeg * Math.PI) / 180;

        // Vector from image origin (bottom-left) to its center rotated by angleDeg
        const dx = (destWidth / 2) * Math.cos(rad) - (destHeight / 2) * Math.sin(rad);
        const dy = (destWidth / 2) * Math.sin(rad) + (destHeight / 2) * Math.cos(rad);

        // Position bottom-left so the rotated center aligns with (centerX, centerY)
        const drawX = centerX - dx;
        const drawY = centerY - dy;

        page.drawImage(embeddedPng, {
          x: drawX,
          y: drawY,
          width: destWidth,
          height: destHeight,
          rotate: degrees(angleDeg),
        });
      }
    } catch (err) {
      console.error(`Failed to embed signature ${sig.id}:`, err);
    }
  }

  return await pdfDoc.save();
}

/**
 * Generates an official sample NDA / Contract document for testing the signature tool
 */
export async function generateSampleContractPdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  // Standard A4
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const { width, height } = page.getSize();

  // Header banner
  page.drawRectangle({
    x: 40,
    y: height - 90,
    width: width - 80,
    height: 45,
    color: rgb(0.12, 0.12, 0.12),
  });

  page.drawText('STANDARD SERVICES & NON-DISCLOSURE AGREEMENT', {
    x: 55,
    y: height - 68,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Metadata
  page.drawText('DOCUMENT ID: DOC-2026-SP-9821', {
    x: 40,
    y: height - 110,
    size: 9,
    font: fontBold,
    color: rgb(0.55, 0.27, 0.07),
  });

  page.drawText(`DATE: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, {
    x: width - 180,
    y: height - 110,
    size: 9,
    font: fontBold,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Body content
  const paragraphs = [
    '1. PARTIES: This Agreement is entered into between SnapPDF Suite ("Disclosing Party") and the undersigned authorized representative ("Recipient"). Both parties covenant to act in good faith.',
    '2. CONFIDENTIALITY: Recipient agrees to preserve the absolute confidentiality of any proprietary diagrams, intellectual property, documentation, and source materials disclosed under this contract.',
    '3. PERMITTED USE: Information shall be handled exclusively for evaluating potential mutual collaboration and shall not be duplicated, reverse-engineered, or distributed without explicit prior written authorization.',
    '4. TERM & VALIDITY: The non-disclosure obligations shall endure for a period of three (3) years from execution. This instrument constitutes the entirety of the agreement between the parties.',
    '5. ACKNOWLEDGEMENT: By affixing an official digital signature below, both parties confirm their legal capacity and intention to be bound by all stipulations set forth herein.'
  ];

  let currentY = height - 145;
  for (const para of paragraphs) {
    page.drawText(para.slice(0, 30), {
      x: 40,
      y: currentY,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    
    // Draw wrapped lines
    const textRemainder = para.slice(30);
    const words = textRemainder.split(' ');
    let line = '';
    currentY -= 15;

    for (const w of words) {
      if ((line + w).length > 75) {
        page.drawText(line, { x: 40, y: currentY, size: 9.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        currentY -= 14;
        line = w + ' ';
      } else {
        line += w + ' ';
      }
    }
    if (line.length > 0) {
      page.drawText(line, { x: 40, y: currentY, size: 9.5, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
      currentY -= 24;
    }
  }

  // Signature Block
  const sigBoxY = 130;
  page.drawRectangle({
    x: 40,
    y: sigBoxY,
    width: width - 80,
    height: 120,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });

  page.drawText('EXECUTION & SIGNATURE BLOCK', {
    x: 55,
    y: sigBoxY + 95,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText('Place and resize your authorized signature in the area below:', {
    x: 55,
    y: sigBoxY + 80,
    size: 8.5,
    font: fontOblique,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Signature lines
  page.drawLine({
    start: { x: 55, y: sigBoxY + 30 },
    end: { x: 280, y: sigBoxY + 30 },
    thickness: 1.5,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText('Authorized Signatory Signature', {
    x: 55,
    y: sigBoxY + 16,
    size: 8,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawLine({
    start: { x: 330, y: sigBoxY + 30 },
    end: { x: 500, y: sigBoxY + 30 },
    thickness: 1.5,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText('Execution Date & Stamp', {
    x: 330,
    y: sigBoxY + 16,
    size: 8,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Footer note
  page.drawText('Generated securely with SnapPDF Document Suite • Client-Side Encryption', {
    x: 40,
    y: 40,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5),
  });

  return await pdfDoc.save();
}

/**
 * Converts an image file to a single-page PDF document
 */
export async function convertImageFileToPdfBytes(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.create();

  let embeddedImage;
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');

  if (isPng) {
    embeddedImage = await pdfDoc.embedPng(arrayBuffer);
  } else {
    // If not PNG, try JPG directly or convert via canvas
    try {
      embeddedImage = await pdfDoc.embedJpg(arrayBuffer);
    } catch {
      const pngBytes = await processSignatureToPngBytes(URL.createObjectURL(file), false);
      embeddedImage = await pdfDoc.embedPng(pngBytes);
    }
  }

  const { width, height } = embeddedImage;
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height,
  });

  return await pdfDoc.save();
}
