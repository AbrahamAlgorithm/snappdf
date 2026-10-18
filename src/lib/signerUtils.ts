import { PDFDocument, degrees } from 'pdf-lib';
import { getDocument } from '@/lib/pdfjs';

export interface SignatureItem {
  id: string;
  url: string;
  name: string;
  pageIndex: number; // 0-based
  xPercent: number; // % of page width
  yPercent: number; // % of page height, from the top
  widthPercent: number; // % of page width
  heightPercent: number; // % of page height
  aspectRatio: number; // width / height
  rotation?: number; // degrees clockwise
  removeWhiteBg?: boolean;
}

// render one page to a png data url
export async function renderPdfPageHighRes(
  pdfData: ArrayBuffer | Uint8Array,
  pageIndex: number,
  scale: number = 1.6,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const pdf = await getDocument({ data: pdfData.slice(0) }).promise;
  const page = await pdf.getPage(pageIndex + 1);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas context could not be created');
  }

  await page.render({ canvas, canvasContext: context, viewport }).promise;

  const dataUrl = canvas.toDataURL('image/png');
  return {
    dataUrl,
    width: viewport.width,
    height: viewport.height,
  };
}

// image url to png bytes for pdf-lib, can also drop a white background
export async function processSignatureToPngBytes(
  imageUrl: string,
  removeWhiteBg: boolean = false,
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
            // near-white pixels go transparent
            if (r > 220 && g > 220 && b > 220) {
              d[i + 3] = 0;
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

// stamp the signatures onto the pdf
export async function embedSignaturesIntoPdf(
  sourcePdfBytes: ArrayBuffer | Uint8Array,
  signatures: SignatureItem[],
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

      // percentages to pdf points
      const destWidth = (sig.widthPercent / 100) * pageWidth;
      const destHeight = (sig.heightPercent / 100) * pageHeight;
      const destX = (sig.xPercent / 100) * pageWidth;

      // pdf y starts at the bottom, so flip it
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
        const centerX = destX + destWidth / 2;
        const centerY = destY + destHeight / 2;

        // pdf y points up, so clockwise is negative
        const angleDeg = -rotDeg;
        const rad = (angleDeg * Math.PI) / 180;

        // pdf-lib rotates around the bottom-left corner, so shift it to keep the center in place
        const dx = (destWidth / 2) * Math.cos(rad) - (destHeight / 2) * Math.sin(rad);
        const dy = (destWidth / 2) * Math.sin(rad) + (destHeight / 2) * Math.cos(rad);
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

// one image as a one-page pdf
export async function convertImageFileToPdfBytes(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.create();

  let embeddedImage;
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');

  if (isPng) {
    embeddedImage = await pdfDoc.embedPng(arrayBuffer);
  } else {
    // try it as a jpg, otherwise go through a canvas
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
