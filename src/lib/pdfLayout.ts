// works out where a pdf page's text sits and how it groups: lines, blocks of text, columns and reading order.
// plain maths on positions, nothing from pdf.js or the browser, so it's tested on its own

// a piece of text as pdf.js found it. x, y is the left end of its baseline, in points from the page's top left
export type TextPiece = {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  bold: boolean;
  italic: boolean;
  font: string; // the font word should use, e.g. "Arial"
  color: string; // hex, e.g. "1a1a1a"
};

export type Run = { text: string; bold: boolean; italic: boolean; size: number; font: string; color: string };

// one line of a block, starting at its own x, so indents and hanging bullets stay put
export type FrameLine = { runs: Run[]; x: number; y: number; size: number };

// a block of text that sits together on the page (a paragraph, a heading, an address, a table cell)
export type TextFrame = { x: number; top: number; width: number; lineGap: number; heading: 0 | 1 | 2 | 3; lines: FrameLine[] };

type Line = { pieces: TextPiece[]; x0: number; x1: number; y: number; size: number };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

// the text size most of the document is written in, headings are measured against it
export function bodySize(pages: TextPiece[][]) {
  const weighted: number[] = [];
  for (const piece of pages.flat()) for (let i = 0; i < Math.min(piece.text.trim().length, 200); i++) weighted.push(Math.round(piece.size * 2) / 2);
  return median(weighted) || 11;
}

// heading levels: the biggest heading size is level 1, the next level 2, anything smaller level 3
export function headingSizes(pages: TextPiece[][], body: number) {
  const sizes = [...new Set(pages.flat().filter((p) => p.text.trim() && p.size >= body * 1.3).map((p) => Math.round(p.size)))];
  return sizes.sort((a, b) => b - a);
}

// pieces on the same baseline become a line, and a line splits where there's a wide gap (columns, table cells)
export function toLines(pieces: TextPiece[]): Line[] {
  const sorted = pieces.filter((p) => p.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextPiece[][] = [];
  for (const piece of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - piece.y) <= Math.max(row[0].size, piece.size) * 0.35) row.push(piece);
    else rows.push([piece]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let current: TextPiece[] = [];
    const flush = () => {
      if (!current.length) return;
      lines.push({
        pieces: current,
        x0: current[0].x,
        x1: Math.max(...current.map((p) => p.x + p.width)),
        y: current[0].y,
        size: Math.max(...current.map((p) => p.size)),
      });
      current = [];
    };
    for (const piece of row) {
      const last = current.at(-1);
      if (last && piece.x - (last.x + last.width) > Math.max(last.size, piece.size) * 2.5) flush();
      current.push(piece);
    }
    flush();
  }
  return lines;
}

// a vertical gap no line crosses, with plenty of text on both sides, means two columns
export function findGutter(lines: Line[], pageWidth: number): number | null {
  if (lines.length < 6) return null;
  let best: { x: number; crossing: number } | null = null;
  for (let x = pageWidth * 0.3; x <= pageWidth * 0.7; x += 2) {
    const crossing = lines.filter((l) => l.x0 < x - 3 && l.x1 > x + 3).length;
    const left = lines.filter((l) => l.x1 <= x);
    const right = lines.filter((l) => l.x0 >= x);
    if (left.length < lines.length * 0.25 || right.length < lines.length * 0.25 || crossing > lines.length * 0.1) continue;
    // both sides have to run down the page together, at least three lines, not a few labels off to the right
    const top = Math.max(Math.min(...left.map((l) => l.y)), Math.min(...right.map((l) => l.y)));
    const bottom = Math.min(Math.max(...left.map((l) => l.y)), Math.max(...right.map((l) => l.y)));
    if (bottom - top < 2 * median(lines.map((l) => l.size))) continue;
    if (!best || crossing < best.crossing || (crossing === best.crossing && Math.abs(x - pageWidth / 2) < Math.abs(best.x - pageWidth / 2))) best = { x, crossing };
  }
  return best?.x ?? null;
}

// text on both sides of a gutter and nothing across it
const splitsAt = (lines: Line[], gutter: number) =>
  lines.some((l) => l.x1 <= gutter + 3) && lines.some((l) => l.x0 >= gutter - 3) && !lines.some((l) => l.x0 < gutter - 3 && l.x1 > gutter + 3);

/**
 * The page in stretches, split where an empty band runs right across it, each with its own columns or none,
 * so a page can be one column at the top and two further down. A stretch that fits the columns above
 * carries them on, so two columns that both start a new paragraph at the same height stay one.
 */
export function stretches(lines: Line[], pageWidth: number): { lines: Line[]; gutter: number | null }[] {
  const blocks: Line[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y)) {
    const block = blocks.at(-1);
    const last = block?.at(-1);
    if (block && last && line.y - last.y <= Math.max(line.size, last.size) * 2) block.push(line);
    else blocks.push([line]);
  }
  const out: { lines: Line[]; gutter: number | null }[] = [];
  for (const block of blocks) {
    const previous = out.at(-1);
    if (previous && previous.gutter !== null && splitsAt(block, previous.gutter)) previous.lines.push(...block);
    else out.push({ lines: block, gutter: findGutter(block, pageWidth) });
  }
  return out;
}

// reading order: top to bottom, and inside each stretch of two columns the left one, then the right
export function readingOrder(lines: Line[], gutter: number | null): Line[][] {
  const byTop = [...lines].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  if (gutter === null) return [byTop];
  const flows: Line[][] = [];
  let left: Line[] = [];
  let right: Line[] = [];
  const flush = () => {
    if (left.length) flows.push(left);
    if (right.length) flows.push(right);
    left = [];
    right = [];
  };
  for (const line of byTop) {
    if (line.x1 <= gutter + 3) left.push(line);
    else if (line.x0 >= gutter - 3) right.push(line);
    else {
      // spans both columns, like a title above them
      flush();
      flows.push([line]);
    }
  }
  flush();
  return flows;
}

// a line's text as runs of the same style, with spaces put back where pdf.js left gaps
export function runsOf(pieces: TextPiece[]): Run[] {
  const runs: Run[] = [];
  let previous: TextPiece | null = null;
  for (const piece of pieces) {
    let text = piece.text;
    if (previous && piece.x - (previous.x + previous.width) > piece.size * 0.15 && !/\s$/.test(previous.text) && !/^\s/.test(text)) text = ` ${text}`;
    const run = runs.at(-1);
    const same = run && run.bold === piece.bold && run.italic === piece.italic && Math.abs(run.size - piece.size) < 0.6 && run.font === piece.font && run.color === piece.color;
    if (run && same) run.text += text;
    else runs.push({ text, bold: piece.bold, italic: piece.italic, size: piece.size, font: piece.font, color: piece.color });
    previous = piece;
  }
  return runs;
}

/**
 * Groups a page's lines into blocks that sit together, in reading order. Each keeps its lines exactly
 * where they were, so word can put the block back in the same place on the page.
 * body: the document's main text size. headings: heading sizes, biggest first.
 */
export function pageFrames(pieces: TextPiece[], page: { width: number }, body: number, headings: number[]): TextFrame[] {
  const flows = stretches(toLines(pieces), page.width).flatMap((stretch) => readingOrder(stretch.lines, stretch.gutter));
  const frames: TextFrame[] = [];

  for (const flow of flows) {
    let group: Line[] = [];
    const flush = () => {
      if (!group.length) return;
      const size = Math.max(...group.map((l) => l.size));
      const gaps = group.slice(1).map((l, i) => l.y - group[i].y);
      const x = Math.min(...group.map((l) => l.x0));
      frames.push({
        x,
        top: group[0].y - size,
        width: Math.max(...group.map((l) => l.x1)) - x,
        lineGap: gaps.length ? median(gaps) : size * 1.2,
        heading: size >= body * 1.3 ? ((Math.min(headings.indexOf(Math.round(size)), 2) + 1) as 1 | 2 | 3) : 0,
        lines: group.map((l) => ({ runs: runsOf(l.pieces), x: l.x0, y: l.y, size: l.size })),
      });
      group = [];
    };
    for (const line of flow) {
      const last = group.at(-1);
      const left = group.length ? Math.min(...group.map((l) => l.x0)) : 0;
      // lines belong together when they're the same size, close below each other, and start near the same place
      const together =
        last &&
        Math.abs(line.size - last.size) <= Math.max(0.6, last.size * 0.12) &&
        line.y - last.y > 0 &&
        line.y - last.y <= Math.max(line.size, last.size) * 1.9 &&
        Math.abs(line.x0 - left) <= line.size * 4;
      if (!together) flush();
      group.push(line);
    }
    flush();
  }
  return frames;
}

/**
 * The colour a piece of text was drawn in, from the page drawn with its text and without it.
 * Pixels that changed are the text. Only the most changed ones count, the solid middle of the letters,
 * since their soft edges are part background.
 * Null when nothing changed: the text is invisible, like the hidden words a scanner app puts over a scan.
 */
export function inkColor(
  withText: Uint8ClampedArray,
  withoutText: Uint8ClampedArray,
  width: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): string | null {
  const changed: { i: number; diff: number }[] = [];
  let checked = 0;
  let most = 0;
  for (let y = Math.max(0, Math.floor(box.y0)); y < Math.ceil(box.y1); y++)
    for (let x = Math.max(0, Math.floor(box.x0)); x < Math.min(width, Math.ceil(box.x1)); x++) {
      const i = (y * width + x) * 4;
      if (i + 3 >= withText.length) continue;
      checked++;
      const diff = Math.abs(withText[i] - withoutText[i]) + Math.abs(withText[i + 1] - withoutText[i + 1]) + Math.abs(withText[i + 2] - withoutText[i + 2]);
      if (diff < 60) continue;
      changed.push({ i, diff });
      most = Math.max(most, diff);
    }
  if (!checked || changed.length < Math.max(2, checked * 0.01)) return null;
  const core = changed.filter((c) => c.diff >= most * 0.85);
  const hex = (channel: number) =>
    Math.round(core.reduce((sum, c) => sum + withText[c.i + channel], 0) / core.length)
      .toString(16)
      .padStart(2, '0');
  return `${hex(0)}${hex(1)}${hex(2)}`;
}

const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a: string, b: string) => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) <= 24;
};

// colours read off the page wobble a little from word to word, so ones that are nearly the same
// all become the one used most, and a paragraph doesn't end up in five shades of grey
export function tidyColors(pages: TextPiece[][]): TextPiece[][] {
  const uses = new Map<string, number>();
  for (const piece of pages.flat()) uses.set(piece.color, (uses.get(piece.color) ?? 0) + piece.text.length);
  const palette: string[] = [];
  for (const color of [...uses.keys()].sort((a, b) => uses.get(b)! - uses.get(a)!)) if (!palette.some((p) => near(p, color))) palette.push(color);
  return pages.map((pieces) => pieces.map((piece) => ({ ...piece, color: palette.find((p) => near(p, piece.color))! })));
}

// the font word should use for a pdf font: its family without the subset prefix and style, or a close standard one
const FAMILIES = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Calibri',
  'Cambria',
  'Candara',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Garamond',
  'Palatino Linotype',
  'Book Antiqua',
  'Century Gothic',
  'Segoe UI',
  'Consolas',
  'Lucida Console',
  'Helvetica Neue',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Noto Sans',
  'Noto Serif',
  'Source Sans Pro',
];
const ALIASES: Record<string, string> = {
  helvetica: 'Arial',
  arialmt: 'Arial',
  liberationsans: 'Arial',
  times: 'Times New Roman',
  timesroman: 'Times New Roman',
  timesnewromanps: 'Times New Roman',
  liberationserif: 'Times New Roman',
  courier: 'Courier New',
  liberationmono: 'Courier New',
  palatino: 'Palatino Linotype',
};
export function wordFont(name: string, generic: 'sans' | 'serif' | 'mono'): string {
  // "ABCDEF+Arial-BoldMT" -> "Arial"
  const family = name
    .replace(/^[A-Z]{6}\+/, '')
    .split(/[-,]/)[0]
    .replace(/(PS)?MT$/, '');
  // the whole name first, then without a style stuck on the end ("CalibriBold")
  for (const candidate of [family, family.replace(/(Bold|Italic|Oblique|Regular|Medium|Light|Semibold|Black)+$/i, '')]) {
    const key = candidate.toLowerCase().replace(/[\s_]/g, '');
    if (ALIASES[key]) return ALIASES[key];
    const known = FAMILIES.find((f) => f.toLowerCase().replace(/\s/g, '') === key);
    if (known) return known;
  }
  return generic === 'mono' ? 'Courier New' : generic === 'serif' ? 'Times New Roman' : 'Arial';
}
