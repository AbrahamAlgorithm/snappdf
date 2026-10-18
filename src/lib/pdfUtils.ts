import { PDFDocument } from 'pdf-lib';
import { getDocument } from '@/lib/pdfjs';

export interface PdfMetadata {
  pageCount: number;
  previews: string[];
}

export async function getPdfMetadata(file: File): Promise<PdfMetadata> {
  const arrayBuffer = await file.arrayBuffer();

  // page count from pdf-lib, still works if pdf.js fails
  let pageCount = 0;
  try {
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
  } catch (e) {
    console.error('pdf-lib metadata error', e);
  }

  // page previews from pdf.js
  const previews: string[] = [];
  try {
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    if (pageCount === 0) pageCount = pdf.numPages;

    // only preview the first 100 pages
    const pagesToPreview = Math.min(pageCount, 100);

    for (let i = 1; i <= pagesToPreview; i++) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.8 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          previews.push(canvas.toDataURL('image/jpeg', 0.6));
        }
      } catch (e) {
        console.warn(`Failed to render preview for page ${i}`, e);
        previews.push('');
      }
    }
  } catch (e) {
    console.error('PDF.js rendering error', e);
  }

  return { pageCount, previews };
}

export async function extractPdfPages(file: File, pageIndices: number[]): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuffer);
  const pdfDoc = await PDFDocument.create();

  const copiedPages = await pdfDoc.copyPages(srcDoc, pageIndices);
  copiedPages.forEach((page) => pdfDoc.addPage(page));

  return await pdfDoc.save();
}

export interface ImageItem {
  id: string;
  url: string;
  name: string;
  width?: number;
  height?: number;
}

export async function imagesToPdf(
  images: ImageItem[],
  quality: number = 0.85,
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // cap the image size by quality so big photos don't crash the tab
  const maxDim = quality > 0.9 ? 2200 : quality > 0.75 ? 1600 : 1200;

  for (let i = 0; i < images.length; i++) {
    if (onProgress) {
      onProgress(i + 1, images.length);
    }

    const imgItem = images[i];

    try {
      const { arrayBuffer, width, height } = await processImageForPdf(imgItem.url, quality, maxDim);
      const embeddedImage = await pdfDoc.embedJpg(arrayBuffer);

      // A4 in points
      const pageWidth = 595.28;
      const pageHeight = 841.89;

      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      const ratio = Math.min(pageWidth / width, pageHeight / height);
      const drawWidth = width * ratio;
      const drawHeight = height * ratio;
      const x = (pageWidth - drawWidth) / 2;
      const y = (pageHeight - drawHeight) / 2;

      page.drawImage(embeddedImage, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
      });
    } catch (err) {
      console.error(`Error processing image ${i + 1} (${imgItem.name}):`, err);
    }

    // give the browser a breather between images
    await new Promise((r) => setTimeout(r, 10));
  }

  return await pdfDoc.save();
}

async function processImageForPdf(
  src: string,
  quality: number,
  maxDim: number,
): Promise<{ arrayBuffer: ArrayBuffer; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not get canvas context'));

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        async (blob) => {
          // free the canvas memory right away
          canvas.width = 0;
          canvas.height = 0;

          if (!blob) return reject(new Error('Failed to create blob from canvas'));
          try {
            const arrayBuffer = await blob.arrayBuffer();
            resolve({ arrayBuffer, width: w, height: h });
          } catch (e) {
            reject(e);
          }
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}
