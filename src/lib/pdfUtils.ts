import { PDFDocument } from 'pdf-lib';
import { openPdf } from '@/lib/pdfjs';

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

  // page thumbnails from pdf.js, sized for the page grid on this screen
  const previews: string[] = [];
  const thumbWidth = 260 * Math.min(window.devicePixelRatio || 1, 2);
  try {
    const pdf = await openPdf(file);
    if (pageCount === 0) pageCount = pdf.numPages;

    // only preview the first 100 pages
    const pagesToPreview = Math.min(pageCount, 100);

    for (let i = 1; i <= pagesToPreview; i++) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: thumbWidth / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          previews.push(canvas.toDataURL('image/jpeg', 0.85));
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

// render a page as a sharp png that fills a width x height box (css px) on this screen
export async function renderPageImage(source: File | Uint8Array, index: number, width: number, height = Infinity) {
  const pdf = await openPdf(source);
  const page = await pdf.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const fit = Math.min(width / base.width, height / base.height) * Math.min(window.devicePixelRatio || 1, 3);
  // cap the long side so huge pages don't eat memory
  const viewport = page.getViewport({ scale: Math.min(fit, 3000 / Math.max(base.width, base.height)) });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');
  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('Could not render page');
  return { url: URL.createObjectURL(blob), width: viewport.width, height: viewport.height };
}

// what a merge card needs: page count, a small render of page 1, and whether it's locked
export async function getPdfCover(file: File): Promise<{ pageCount: number; cover: string; locked: boolean }> {
  const pdf = await openPdf(file);
  // only encrypted pdfs have permissions, and pdf-lib can't copy pages out of those
  const locked = (await pdf.getPermissions()) !== null;
  const page = await pdf.getPage(1);
  const width = 260 * Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  const cover = canvas.toDataURL('image/jpeg', 0.85);
  canvas.width = 0;
  canvas.height = 0;
  return { pageCount: pdf.numPages, cover, locked };
}

// says which file broke a merge
export class UnreadablePdfError extends Error {
  constructor(
    readonly fileName: string,
    cause: unknown,
  ) {
    super(`Could not read ${fileName}`, { cause });
  }
}

// joins whole files in the given order, every page copied as it is
export async function mergePdfs(files: File[], onProgress?: (current: number, total: number) => void): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i + 1, files.length);
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(await files[i].arrayBuffer());
    } catch (err) {
      throw new UnreadablePdfError(files[i].name, err);
    }
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
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
