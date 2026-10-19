// pdf to word, all on the device. every page becomes two layers: the page drawn as a picture with its text taken
// out (so every image, colour, line and shape stays exactly as it was), and the text on top in frames placed where
// it was, in the same font, size and colour. it looks like the pdf, and every word can be edited
import {
  Document,
  FrameAnchorType,
  HeadingLevel,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  PageOrientation,
  Paragraph,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  type ISectionOptions,
} from 'docx';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { bodySize, headingSizes, inkColor, pageFrames, tidyColors, wordFont, type TextFrame, type TextPiece } from '@/lib/pdfLayout';
import { loadPdf } from '@/lib/pdfjs';

// pdf.js only passes on a font's name when asked, and for a font inside the pdf the name is the only way to tell it's bold
export const FONT_NAMES = { fontExtraProperties: true };

type Encoded = { data: Uint8Array; type: 'png' | 'jpg' };

// a page drawn twice at the same scale, with its text and without. the second is the background,
// and comparing the two gives each word's colour
export type Layers = { background: Encoded; scale: number; width: number; withText: Uint8ClampedArray; withoutText: Uint8ClampedArray };

// drawing needs a browser, so it's passed in and the tests can stand in for it
export type Helpers = { layers: (page: PDFPageProxy) => Promise<Layers> };

export type PageData = { width: number; height: number; pieces: TextPiece[]; background: Encoded; scan: boolean };

// level text goes into frames, turned text (a side label, a stamp) stays in the background picture
const isLevel = (m: number[]) => Math.abs(m[1]) <= Math.max(Math.abs(m[0]), Math.abs(m[3])) * 0.02;

// reads one page: its size, its background, and every visible piece of text with its place, font and colour
export async function readPage(page: PDFPageProxy, { layers }: Helpers): Promise<PageData> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // also loads the page's fonts, which know their names and whether they're bold or italic
  const operators = await page.getOperatorList();
  const drawn = await layers(page);

  const pieces: TextPiece[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = item.transform as number[];
    const [va, vb, vc, vd] = viewport.transform;
    if (!isLevel([va * a + vc * b, vb * a + vd * b, va * c + vc * d, vb * c + vd * d])) continue;
    const [x, y] = viewport.convertToViewportPoint(e, f);
    // the vertical scale is the font size, also right for stretched text
    const size = Math.hypot(c, d) || item.height || 11;
    const s = drawn.scale;
    const color = inkColor(drawn.withText, drawn.withoutText, drawn.width, { x0: x * s, y0: (y - size * 0.8) * s, x1: (x + item.width) * s, y1: (y + size * 0.2) * s });
    // nothing drawn there: invisible text, like the hidden words a scanner app lays over a scan
    if (!color) continue;
    let font: { name?: string; loadedName?: string; bold?: boolean; black?: boolean; italic?: boolean } = {};
    try {
      font = page.commonObjs.get(item.fontName);
    } catch {
      // font not loaded, the defaults below do
    }
    const name = font.name || font.loadedName || '';
    const family = content.styles[item.fontName]?.fontFamily ?? '';
    pieces.push({
      text: item.str,
      x,
      y,
      width: item.width,
      size,
      bold: !!(font.bold || font.black) || /bold|black|heavy|semibold|demi/i.test(name),
      italic: !!font.italic || /italic|oblique/i.test(name),
      font: wordFont(name, /mono/i.test(family) ? 'mono' : /serif/i.test(family) && !/sans/i.test(family) ? 'serif' : 'sans'),
      color,
    });
  }

  // no visible text but something drawn: a scan or a photo of a page, it stays a picture
  const scan = !pieces.length && operators.fnArray.length > 0;
  return { width: viewport.width, height: viewport.height, pieces, background: drawn.background, scan };
}

const PT = 20; // word measures pages in twips, 20 to a point
const PX = 96 / 72; // and pictures in pixels, 96 to the inch
// with exact line spacing, word puts the baseline about this far down each line
const BASELINE = 0.8;
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

// the section for a page keeps its size and which way round it is
function pageSize(page: { width: number; height: number }) {
  const landscape = page.width > page.height;
  return {
    width: Math.round(Math.min(page.width, page.height) * PT),
    height: Math.round(Math.max(page.width, page.height) * PT),
    orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
  };
}

// the page without its text, filling the page behind everything
const background = (page: PageData) =>
  new Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    children: [
      new ImageRun({
        type: page.background.type,
        data: page.background.data,
        transformation: { width: Math.round(page.width * PX), height: Math.round(page.height * PX) },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
          behindDocument: true,
          allowOverlap: true,
          lockAnchor: true,
          wrap: { type: TextWrappingType.NONE },
        },
      }),
    ],
  });

// a block of text in a frame at its place on the page. one paragraph per line keeps every line break and indent,
// and word puts paragraphs with the same frame together in one box
function frameParagraphs(frame: TextFrame, page: PageData) {
  const box = {
    type: 'absolute' as const,
    position: { x: Math.round(frame.x * PT), y: Math.round((frame.lines[0].y - frame.lineGap * BASELINE) * PT) },
    // a little wider than the text, word's copy of a font can run slightly wider than the pdf's
    width: Math.round(Math.min(frame.width * 1.15 + 6, page.width - frame.x) * PT),
    height: Math.round(frame.lineGap * frame.lines.length * PT),
    rule: HeightRule.ATLEAST,
    anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
  };
  return frame.lines.map(
    (line) =>
      new Paragraph({
        frame: box,
        heading: frame.heading ? HEADINGS[frame.heading - 1] : undefined,
        indent: { left: Math.round((line.x - frame.x) * PT) },
        spacing: { before: 0, after: 0, line: Math.round(frame.lineGap * PT), lineRule: LineRuleType.EXACT },
        children: line.runs.map(
          (run) =>
            new TextRun({ text: run.text, bold: run.bold, italics: run.italic, size: Math.max(2, Math.round(run.size * 2)), font: run.font, color: run.color }),
        ),
      }),
  );
}

export async function buildDocx(pages: PageData[]): Promise<Blob> {
  const colored = tidyColors(pages.map((p) => p.pieces));
  pages = pages.map((page, i) => ({ ...page, pieces: colored[i] }));
  const body = bodySize(pages.map((p) => p.pieces));
  const headings = headingSizes(
    pages.map((p) => p.pieces),
    body,
  );
  const sections: ISectionOptions[] = pages.map((page) => ({
    properties: { page: { size: pageSize(page), margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 } } },
    children: [background(page), ...(page.scan ? [] : pageFrames(page.pieces, page, body, headings).flatMap((frame) => frameParagraphs(frame, page)))],
  }));
  return Packer.toBlob(new Document({ sections }));
}

// reads every page, then writes the file. scanned: page numbers with no text to edit, kept as pictures
export async function convertPdf(pdf: PDFDocumentProxy, helpers: Helpers): Promise<{ blob: Blob; scanned: number[] }> {
  const pages: PageData[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    pages.push(await readPage(page, helpers));
    page.cleanup();
  }
  return { blob: await buildDocx(pages), scanned: pages.flatMap((page, i) => (page.scan ? [i + 1] : [])) };
}

// a drawing context that leaves out level text, so pdf.js draws the page with everything but its words
function withoutText(ctx: CanvasRenderingContext2D) {
  const skip =
    (draw: 'fillText' | 'strokeText') =>
    (text: string, x: number, y: number, maxWidth?: number) => {
      const m = ctx.getTransform();
      if (isLevel([m.a, m.b, m.c, m.d])) return;
      if (maxWidth === undefined) ctx[draw](text, x, y);
      else ctx[draw](text, x, y, maxWidth);
    };
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'fillText' || key === 'strokeText') return skip(key);
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value);
    },
  });
}

const inBrowser: Helpers = {
  async layers(page) {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2000 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const draw = async (keepText: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get canvas context');
      // no canvas given, so pdf.js draws through the context, the one that can leave text out
      await page.render({ canvas: null, canvasContext: keepText ? ctx : withoutText(ctx), viewport }).promise;
      return { canvas, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const withText = await draw(true);
    const plain = await draw(false);
    const blob = await new Promise<Blob | null>((resolve) => plain.canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const width = plain.canvas.width;
    withText.canvas.width = 0;
    plain.canvas.width = 0;
    if (!blob) throw new Error('Could not draw the page');
    return { background: { data: new Uint8Array(await blob.arrayBuffer()), type: 'jpg' }, scale, width, withText: withText.pixels, withoutText: plain.pixels };
  },
};

export async function pdfToWord(file: File) {
  const task = await loadPdf(file, FONT_NAMES);
  try {
    return await convertPdf(await task.promise, inBrowser);
  } finally {
    await task.destroy();
  }
}
