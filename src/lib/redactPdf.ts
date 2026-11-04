import { PDFDocument, rgb } from 'pdf-lib';
import { openPdf } from '@/lib/pdfjs';

// a marked area on a page, as fractions of the page's width and height from its top left, so it fits at any zoom
export type Mark = { id: string; page: number; x: number; y: number; w: number; h: number };

let marks = 0;
export const newMarkId = () => `mark-${++marks}`;

export const PATTERNS = [
  { id: 'email', label: 'Emails', test: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { id: 'phone', label: 'Phone numbers', test: /[+(]?\d[\d\s().-]{7,}\d/g },
  { id: 'number', label: 'Long numbers', test: /\b\d{9,}\b/g },
] as const;

// a phrase to find as typed: any case, and any run of spaces matches
export function textMatcher(query: string) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'gi');
}

// a piece of text on a page, in the page's own units from its top left: where it starts, where it ends along the
// line, and the way up from the start for its height
export type TextRun = {
  str: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  ux: number;
  uy: number;
  // how far along the piece of text its first n characters reach, from 0 to 1. letters aren't all as wide, so this
  // is measured when it can be, and the characters are counted as equal when not
  reach?: (n: number) => number;
};

// the boxes round every match of a pattern. a match can run over several pieces of text, and starts and ends part of
// the way through them
export function matchBoxes(runs: TextRun[], pattern: RegExp, pageWidth: number, pageHeight: number) {
  let text = '';
  const spans: { run: TextRun; start: number; end: number }[] = [];
  for (const run of runs) {
    // pieces of text that meet without a space still read as two words
    if (text && !/\s$/.test(text) && !/^\s/.test(run.str)) text += ' ';
    spans.push({ run, start: text.length, end: text.length + run.str.length });
    text += run.str;
  }

  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  for (const match of text.matchAll(pattern)) {
    if (!match[0].trim()) continue;
    const from = match.index;
    const to = from + match[0].length;
    for (const { run, start, end } of spans) {
      if (end <= from || start >= to || end === start) continue;
      const at = (n: number) => (run.reach ? run.reach(n) : n / run.str.length);
      const f0 = at(Math.max(from, start) - start);
      const f1 = at(Math.min(to, end) - start);
      // a little below the line too, for letters like g and y
      const down = 0.22;
      const corners = [f0, f1].flatMap((f) => {
        const x = run.ax + (run.bx - run.ax) * f;
        const y = run.ay + (run.by - run.ay) * f;
        return [
          [x - run.ux * down, y - run.uy * down],
          [x + run.ux * 1.05, y + run.uy * 1.05],
        ];
      });
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      // a little extra along the line, because the measuring is close but not exact, and no edge of a letter can be left
      // showing. only where the match starts or ends inside the text, so a whole piece isn't widened
      const side = Math.max(1.5, run.str.length ? Math.hypot(run.bx - run.ax, run.by - run.ay) / run.str.length / 3 : 0);
      const left = Math.max(0, Math.min(...xs) - (f0 > 0 ? side : 0.5));
      const top = Math.max(0, Math.min(...ys) - 0.5);
      const right = Math.min(pageWidth, Math.max(...xs) + (f1 < 1 ? side : 0.5));
      const bottom = Math.min(pageHeight, Math.max(...ys) + 0.5);
      if (right <= left || bottom <= top) continue;
      boxes.push({ x: left / pageWidth, y: top / pageHeight, w: (right - left) / pageWidth, h: (bottom - top) / pageHeight });
    }
  }
  return boxes;
}

let ruler: CanvasRenderingContext2D | null | undefined;

// how far along some text its first n characters reach, using the text's own font where the browser has it
function reachOf(str: string, family: string | undefined, size: number) {
  if (ruler === undefined) ruler = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ruler || !family) return undefined;
  ruler.font = `${Math.max(1, size)}px ${family}`;
  const whole = ruler.measureText(str).width;
  if (!whole) return undefined;
  // measured now, as the canvas's font changes with the next piece of text
  const edges = Array.from({ length: str.length + 1 }, (_, n) => ruler!.measureText(str.slice(0, n)).width / whole);
  return (n: number) => edges[Math.min(Math.max(n, 0), str.length)];
}

// every match on every page, as marks. pages with no text, like scans, have nothing to find
export async function findText(file: File, pattern: RegExp, onPage?: (done: number, total: number) => void) {
  const pdf = await openPdf(file);
  const found: Mark[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const view = page.getViewport({ scale: 1 });
    const { items, styles } = await page.getTextContent();
    const runs: TextRun[] = [];
    for (const item of items) {
      if (!('str' in item) || !item.str) continue;
      const [a, b, c, d, e, f] = item.transform;
      const along = Math.hypot(a, b) || 1;
      const up = Math.hypot(c, d) || item.height;
      // along the text, and up from it, in the page's units
      const [ax, ay] = view.convertToViewportPoint(e, f);
      const [bx, by] = view.convertToViewportPoint(e + (a / along) * item.width, f + (b / along) * item.width);
      const [tx, ty] = view.convertToViewportPoint(e + (c / up) * (item.height || up), f + (d / up) * (item.height || up));
      runs.push({ str: item.str, ax, ay, bx, by, ux: tx - ax, uy: ty - ay, reach: reachOf(item.str, styles[item.fontName]?.fontFamily, item.height || up) });
    }
    for (const box of matchBoxes(runs, new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`), view.width, view.height)) {
      found.push({ id: newMarkId(), page: i - 1, ...box });
    }
    onPage?.(i, pdf.numPages);
  }
  return found;
}

// a mark that sits inside one that's there already adds nothing
export const covered = (mark: Mark, others: Mark[]) =>
  others.some((o) => o.page === mark.page && mark.x >= o.x - 0.004 && mark.y >= o.y - 0.004 && mark.x + mark.w <= o.x + o.w + 0.004 && mark.y + mark.h <= o.y + o.h + 0.004);

// 150 dpi, which keeps small print readable, and no side longer than this many pixels
const DPI_SCALE = 150 / 72;
const MAX_SIDE = 3200;

// the pdf with the marked areas and whole pages blacked out for good. a page with anything marked is drawn again as a
// picture with the black burned in, so the words under it aren't in the file at all. other pages are copied as they
// are, and nothing from the original's document info, bookmarks or attachments comes along
export async function redactPdf(file: File, boxes: Mark[], whole: number[], onProgress?: (done: number, total: number) => void) {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const pdf = await openPdf(file);
  const out = await PDFDocument.create();
  out.setProducer('snappdf');
  out.setCreator('snappdf');
  let redacted = 0;

  for (let i = 0; i < source.getPageCount(); i++) {
    const own = boxes.filter((m) => m.page === i);
    if (!own.length && !whole.includes(i)) {
      const [copy] = await out.copyPages(source, [i]);
      out.addPage(copy);
    } else {
      redacted++;
      const page = await pdf.getPage(i + 1);
      const view = page.getViewport({ scale: 1 });
      const sheet = out.addPage([view.width, view.height]);
      if (whole.includes(i)) {
        sheet.drawRectangle({ x: 0, y: 0, width: view.width, height: view.height, color: rgb(0, 0, 0) });
      } else {
        const scale = Math.min(DPI_SCALE, MAX_SIDE / Math.max(view.width, view.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(view.width * scale);
        canvas.height = Math.ceil(view.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get canvas context');
        await page.render({ canvas, canvasContext: context, viewport: page.getViewport({ scale }) }).promise;
        context.fillStyle = '#000';
        for (const m of own) context.fillRect(Math.floor(m.x * canvas.width), Math.floor(m.y * canvas.height), Math.ceil(m.w * canvas.width) + 1, Math.ceil(m.h * canvas.height) + 1);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw new Error('Could not draw the page');
        const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        sheet.drawImage(image, { x: 0, y: 0, width: view.width, height: view.height });
      }
    }
    onProgress?.(i + 1, source.getPageCount());
  }
  return { bytes: await out.save({ useObjectStreams: true }), redacted };
}
