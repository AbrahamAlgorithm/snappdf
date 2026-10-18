import libheif from 'libheif-js';

export function isHeicFile(file: File): boolean {
  if (!file || !file.name) return false;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type.includes('heic') ||
    type.includes('heif')
  );
}

// photo.heic -> photo.jpg
function toJpgFile(blob: Blob, original: File): File {
  const name = original.name.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([blob], name.endsWith('.jpg') ? name : `${name}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

// safari can decode heic by itself
async function tryNativeImageDecode(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          return resolve(null);
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob ? toJpgFile(blob, file) : null);
        }, 'image/jpeg', 0.92);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

// libheif wasm decoder for chrome, firefox and edge
async function decodeWithLibheif(file: File): Promise<File | null> {
  return new Promise(async (resolve) => {
    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      const lib = (libheif as any)?.default ? (libheif as any).default : libheif;
      if (!lib || !lib.HeifDecoder) {
        console.error('libheif.HeifDecoder not available');
        return resolve(null);
      }

      const decoder = new lib.HeifDecoder();
      const images = decoder.decode(uint8);

      if (!images || images.length === 0) {
        console.error('libheif found no images in file');
        return resolve(null);
      }

      const image = images[0];
      const width = image.get_width();
      const height = image.get_height();

      if (!width || !height) {
        console.error('Invalid dimensions from libheif');
        return resolve(null);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return resolve(null);
      }

      const imageData = ctx.createImageData(width, height);

      image.display(imageData, (decodedData: ImageData | null) => {
        if (!decodedData) {
          console.error('libheif display returned null');
          return resolve(null);
        }

        ctx.putImageData(decodedData, 0, 0);

        canvas.toBlob((blob) => {
          resolve(blob ? toJpgFile(blob, file) : null);
        }, 'image/jpeg', 0.92);
      });
    } catch (err) {
      console.error('decodeWithLibheif error:', err);
      resolve(null);
    }
  });
}

export async function processFileForImageUpload(file: File): Promise<File> {
  if (!isHeicFile(file)) {
    return file;
  }

  // try the browser first (safari)
  const nativeResult = await tryNativeImageDecode(file);
  if (nativeResult) {
    return nativeResult;
  }

  // then libheif
  const libheifResult = await decodeWithLibheif(file);
  if (libheifResult) {
    return libheifResult;
  }

  // last resort, heic2any
  try {
    const heic2anyMod = await import('heic2any');
    const fn = (heic2anyMod as any)?.default || heic2anyMod;
    if (typeof fn === 'function') {
      const result = await fn({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      const resultBlob = Array.isArray(result) ? result[0] : result;
      if (resultBlob && resultBlob instanceof Blob) {
        return toJpgFile(resultBlob, file);
      }
    }
  } catch (heic2anyErr) {
    console.error('heic2any fallback also failed:', heic2anyErr);
  }

  return file;
}
