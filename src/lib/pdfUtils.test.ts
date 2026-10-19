import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { extractPdfPages, imagesToPdf, mergePdfs, UnreadablePdfError } from '@/lib/pdfUtils';

// pdf.js needs a browser, none of these tests use it
vi.mock('@/lib/pdfjs', () => ({ openPdf: vi.fn(), closePdf: vi.fn() }));

// a pdf with one page per size, so pages can be told apart by their size
async function makePdf(name: string, sizes: [number, number][]) {
  const doc = await PDFDocument.create();
  sizes.forEach((size) => doc.addPage(size));
  return new File([await doc.save()], name, { type: 'application/pdf' });
}

async function pageSizes(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const { width, height } = page.getSize();
    return [Math.round(width), Math.round(height)];
  });
}

describe('mergePdfs', () => {
  it('joins every page of every file, in the order given', async () => {
    const a = await makePdf('a.pdf', [[100, 100], [100, 200]]);
    const b = await makePdf('b.pdf', [[300, 300]]);
    const c = await makePdf('c.pdf', [[400, 100], [400, 200], [400, 300]]);

    const merged = await mergePdfs([b, a, c]);

    expect(await pageSizes(merged)).toEqual([[300, 300], [100, 100], [100, 200], [400, 100], [400, 200], [400, 300]]);
  });

  it('reports progress once per file', async () => {
    const files = await Promise.all(['a.pdf', 'b.pdf', 'c.pdf'].map((name) => makePdf(name, [[100, 100]])));
    const onProgress = vi.fn();

    await mergePdfs(files, onProgress);

    expect(onProgress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('names the file it could not read', async () => {
    const good = await makePdf('good.pdf', [[100, 100]]);
    const bad = new File(['not really a pdf'], 'notes.pdf', { type: 'application/pdf' });

    const error = await mergePdfs([good, bad]).catch((err) => err);

    expect(error).toBeInstanceOf(UnreadablePdfError);
    expect(error.fileName).toBe('notes.pdf');
  });

  it('refuses encrypted files instead of making a broken pdf', async () => {
    // pdf-lib can't encrypt, but an /Encrypt entry is what marks a file as encrypted
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: 'Standard', V: 2, R: 3 });
    const locked = new File([await doc.save()], 'locked.pdf', { type: 'application/pdf' });

    const error = await mergePdfs([locked]).catch((err) => err);

    expect(error).toBeInstanceOf(UnreadablePdfError);
    expect(error.fileName).toBe('locked.pdf');
  });
});

describe('extractPdfPages', () => {
  it('keeps only the chosen pages, at their original size', async () => {
    const file = await makePdf('report.pdf', [[100, 100], [200, 200], [300, 300], [400, 400]]);

    const bytes = await extractPdfPages(file, [1, 3]);

    expect(await pageSizes(bytes)).toEqual([[200, 200], [400, 400]]);
  });

  it('keeps the pages in the order given', async () => {
    const file = await makePdf('report.pdf', [[100, 100], [200, 200], [300, 300]]);

    const bytes = await extractPdfPages(file, [2, 0]);

    expect(await pageSizes(bytes)).toEqual([[300, 300], [100, 100]]);
  });
});

describe('imagesToPdf', () => {
  // node has no <img> or <canvas>, so these fakes stand in: an image "loads" at the size listed
  // for its url, and the canvas hands back a real 4x3 jpeg and remembers the size it was drawn at
  const JPEG = Uint8Array.from(
    atob(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAL/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCAAKlf/9k=',
    ),
    (c) => c.charCodeAt(0),
  );
  const imageSizes: Record<string, [number, number]> = {
    'blob:landscape': [4000, 3000],
    'blob:portrait': [3000, 4000],
    'blob:small': [800, 600],
    'blob:screenshot': [1000, 4000],
  };
  let drawnAt: [number, number][] = [];

  class FakeImage {
    width = 0;
    height = 0;
    crossOrigin = '';
    onload?: () => void;
    onerror?: (e: unknown) => void;
    set src(url: string) {
      setTimeout(() => {
        const size = imageSizes[url];
        if (!size) return this.onerror?.('broken image');
        [this.width, this.height] = size;
        this.onload?.();
      });
    }
  }

  const fakeDocument = {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} }),
        toBlob: (done: (blob: Blob) => void) => {
          drawnAt.push([canvas.width, canvas.height]);
          done(new Blob([JPEG], { type: 'image/jpeg' }));
        },
      };
      return canvas;
    },
  };

  const image = (url: string) => ({ id: url, url, name: url.replace('blob:', '') + '.jpg' });

  beforeEach(() => {
    drawnAt = [];
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', fakeDocument);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('makes one A4 page per image', async () => {
    const bytes = await imagesToPdf([image('blob:landscape'), image('blob:portrait'), image('blob:small')]);

    expect(await pageSizes(bytes)).toEqual([[595, 842], [595, 842], [595, 842]]);
  });

  it('fits each image on its page, centred and not stretched', async () => {
    const draw = vi.spyOn(PDFPage.prototype, 'drawImage');

    await imagesToPdf([image('blob:landscape'), image('blob:portrait'), image('blob:screenshot')]);

    const [landscape, portrait, screenshot] = draw.mock.calls.map(([, box]) => box!);
    // wide photo: full page width, 4:3, middle of the page
    expect(landscape.width).toBeCloseTo(595.28);
    expect(landscape.height).toBeCloseTo(595.28 * 0.75);
    expect(landscape.y).toBeCloseTo((841.89 - 595.28 * 0.75) / 2);
    // tall photo: page width still wins on a4, 3:4
    expect(portrait.width).toBeCloseTo(595.28);
    expect(portrait.height).toBeCloseTo(595.28 / 0.75);
    expect(portrait.x).toBeCloseTo(0);
    // long screenshot: full page height, 1:4, middle of the page
    expect(screenshot.height).toBeCloseTo(841.89);
    expect(screenshot.width).toBeCloseTo(841.89 / 4);
    expect(screenshot.x).toBeCloseTo((595.28 - 841.89 / 4) / 2);
  });

  it('shrinks big photos to the size the quality setting allows', async () => {
    await imagesToPdf([image('blob:landscape')], 0.5);
    await imagesToPdf([image('blob:landscape')], 0.85);
    await imagesToPdf([image('blob:landscape')], 1);
    await imagesToPdf([image('blob:small')], 1);

    expect(drawnAt).toEqual([
      [1200, 900],
      [1600, 1200],
      [2200, 1650],
      [800, 600], // already small, left alone
    ]);
  });

  it('skips an image it cannot load and keeps going', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const bytes = await imagesToPdf([image('blob:landscape'), image('blob:missing'), image('blob:small')]);

    expect(await pageSizes(bytes)).toHaveLength(2);
  });

  it('reports progress for each image', async () => {
    const onProgress = vi.fn();

    await imagesToPdf([image('blob:landscape'), image('blob:small')], 0.85, onProgress);

    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });
});
