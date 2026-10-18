import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Configure PDF.js worker using a reliable CDN path matching the package version
// unpkg is a direct mirror of npm and usually has the latest versions available immediately
const PDFJS_VERSION = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export interface PdfMetadata {
  pageCount: number;
  previews: string[];
}

export async function getPdfMetadata(file: File): Promise<PdfMetadata> {
  const arrayBuffer = await file.arrayBuffer();
  
  // 1. Get accurate page count using pdf-lib (more reliable for metadata and works without worker)
  let pageCount = 0;
  try {
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    pageCount = pdfDoc.getPageCount();
  } catch (e) {
    console.error("pdf-lib metadata error", e);
  }

  // 2. Load with PDF.js for rendering
  const previews: string[] = [];
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    // Use PDFJS page count if pdf-lib failed
    if (pageCount === 0) pageCount = pdf.numPages;

    // Render initial batch of previews (up to 100 for balance)
    const pagesToPreview = Math.min(pageCount, 100); 

    for (let i = 1; i <= pagesToPreview; i++) {
      try {
        const page = await pdf.getPage(i);
        const scale = 0.8;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ 
            canvasContext: context, 
            viewport 
          } as any).promise;
          previews.push(canvas.toDataURL('image/jpeg', 0.6));
        }
      } catch (e) {
        console.warn(`Failed to render preview for page ${i}`, e);
        previews.push('');
      }
    }
  } catch (e) {
    console.error("PDF.js rendering error", e);
    // If PDF.js fails completely, we still have the pageCount from step 1
  }

  // Final fallback
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
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Smart max dimension cap based on quality setting to prevent browser OOM crashes
  // 1600px max dimension provides 200+ DPI on A4 and uses ~10x-20x less RAM per image
  const maxDim = quality > 0.9 ? 2200 : quality > 0.75 ? 1600 : 1200;

  for (let i = 0; i < images.length; i++) {
    if (onProgress) {
      onProgress(i + 1, images.length);
    }

    const imgItem = images[i];

    try {
      const { arrayBuffer, width, height } = await processImageForPdf(imgItem.url, quality, maxDim);
      const embeddedImage = await pdfDoc.embedJpg(arrayBuffer);

      // Standard A4 dimensions in points: 595.28 x 841.89
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

    // Yield control back to browser main loop to keep UI smooth and allow Garbage Collection
    await new Promise((r) => setTimeout(r, 10));
  }

  return await pdfDoc.save();
}

async function processImageForPdf(
  src: string,
  quality: number,
  maxDim: number
): Promise<{ arrayBuffer: ArrayBuffer; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not get canvas context"));

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        async (blob) => {
          // Immediately wipe canvas backing store to free GPU/RAM
          canvas.width = 0;
          canvas.height = 0;

          if (!blob) return reject(new Error("Failed to create blob from canvas"));
          try {
            const arrayBuffer = await blob.arrayBuffer();
            resolve({ arrayBuffer, width: w, height: h });
          } catch (e) {
            reject(e);
          }
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}
