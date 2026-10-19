import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  beginText,
  endText,
  moveText,
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  PDFString,
  setFontAndSize,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { inkColor, tidyColors, wordFont, type TextPiece } from '@/lib/pdfLayout';
import { convertPdf, FONT_NAMES, type Helpers } from '@/lib/pdfToWord';

// the browser build of pdf.js isn't needed here, the tests read pdfs with its node build
vi.mock('@/lib/pdfjs', () => ({ loadPdf: vi.fn() }));
const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

// a tiny png encoder for the test pictures
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function png(width: number, height: number, rgba: (x: number, y: number) => number[]) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows.set(rgba(x, y), y * (width * 4 + 1) + 1 + x * 4);
  const chunk = (type: string, data: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', new Uint8Array())]));
}

// stands in for the browser drawing the page twice: every piece of text becomes a solid block in the "with text"
// copy, red for text that says so, and nothing at all for hidden text, like the words over a scan
const RED = [200, 30, 30];
const helpers: Helpers = {
  async layers(page: PDFPageProxy) {
    const viewport = page.getViewport({ scale: 1 });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    const withText = new Uint8ClampedArray(width * height * 4).fill(255);
    const withoutText = new Uint8ClampedArray(width * height * 4).fill(255);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim() || item.str.startsWith('hidden')) continue;
      const [, , , d, e, f] = item.transform as number[];
      const [x, y] = viewport.convertToViewportPoint(e, f);
      const ink = /red/.test(item.str) ? RED : [0, 0, 0];
      for (let py = Math.round(y - d * 0.7); py < Math.round(y); py++)
        for (let px = Math.round(x); px < Math.round(x + item.width); px++) withText.set([...ink, 255], (py * width + px) * 4);
    }
    return { background: { type: 'png', data: png(4, 4, () => [240, 240, 240, 255]) }, scale: 1, width, withText, withoutText };
  },
};

function line(page: PDFPage, x: number, y: number, size: number, parts: [string, PDFFont][]) {
  for (const [text, font] of parts) {
    page.drawText(text, { x, y, size, font });
    x += font.widthOfTextAtSize(text, size);
  }
}

// a font carried inside the pdf, the way most real pdfs have theirs. pdf.js can't tell it's bold from the font
// itself, only from its name, so this catches the name not getting through
function embedTrueType(doc: PDFDocument, file: string, name: string): PDFRef {
  const bytes = readFileSync(require.resolve(`pdfjs-dist/standard_fonts/${file}`));
  const program = doc.context.register(doc.context.flateStream(bytes, { Length1: bytes.length }));
  const descriptor = doc.context.register(
    doc.context.obj({ Type: 'FontDescriptor', FontName: name, Flags: 32, FontBBox: [-550, -300, 1300, 1000], ItalicAngle: 0, Ascent: 900, Descent: -210, CapHeight: 700, StemV: 80, FontFile2: program }),
  );
  return doc.context.register(
    doc.context.obj({ Type: 'Font', Subtype: 'TrueType', BaseFont: name, FirstChar: 32, LastChar: 126, Widths: Array(95).fill(600), Encoding: 'WinAnsiEncoding', FontDescriptor: descriptor }),
  );
}

function embeddedLine(page: PDFPage, font: PDFRef, x: number, y: number, size: number, text: string) {
  const key = page.node.newFontDictionary('Embedded', font);
  page.pushOperators(beginText(), setFontAndSize(key, size), moveText(x, y), PDFOperator.of(PDFOperatorNames.ShowText, [PDFString.of(text)]), endText());
}

async function makeFixture() {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const times = await doc.embedFont(StandardFonts.TimesRoman);

  // 1. a page with a heading, a paragraph, styles, colour and a serif font
  const p1 = doc.addPage([595, 842]);
  line(p1, 72, 770, 24, [['Quarterly report', bold]]);
  line(p1, 72, 730, 11, [['Sales grew in every region this quarter, with strong demand and contin-', regular]]);
  line(p1, 72, 716, 11, [['ued growth from new customers joining each month while costs held', regular]]);
  line(p1, 72, 702, 11, [['steady, and that was the quarter.', regular]]);
  line(p1, 72, 674, 11, [
    ['Revenue was ', regular],
    ['up 24 percent', bold],
    [' on last year, an ', regular],
    ['excellent', italic],
    [' result.', regular],
  ]);
  line(p1, 72, 640, 16, [['Highlights', bold]]);
  line(p1, 90, 616, 11, [['• First point', regular]]);
  line(p1, 72, 590, 11, [['A red warning line', regular]]);
  line(p1, 72, 560, 12, [['Set in a serif font', times]]);

  // 2. two columns side by side, both starting a new paragraph at the same height
  const p2 = doc.addPage([595, 842]);
  for (let i = 0; i < 8; i++) {
    const y = 760 - i * 14 - (i >= 4 ? 24 : 0);
    line(p2, 72, y, 11, [[`Left column line ${i + 1}`, regular]]);
    line(p2, 320, y, 11, [[`Right column line ${i + 1}`, regular]]);
  }

  // 3. landscape
  doc.addPage([842, 595]).drawText('Landscape page', { x: 72, y: 500, size: 12, font: regular });

  // 4. a scan: a picture of a page and no text
  const scan = await doc.embedPng(png(60, 80, (x, y) => [(x * 4) % 255, (y * 3) % 255, 120, 255]));
  doc.addPage([595, 842]).drawImage(scan, { x: 0, y: 0, width: 595, height: 842 });

  // 5. a scan with hidden words over it, the way scanner apps make pdfs searchable
  const p5 = doc.addPage([595, 842]);
  p5.drawImage(scan, { x: 0, y: 0, width: 595, height: 842 });
  line(p5, 72, 700, 11, [['hidden words over a scan', regular]]);

  // 6. text in fonts embedded in the pdf
  const p6 = doc.addPage([595, 842]);
  embeddedLine(p6, embedTrueType(doc, 'LiberationSans-Bold.ttf', 'ABCDEF+Arial-BoldMT'), 72, 770, 24, 'Embedded bold title');
  embeddedLine(p6, embedTrueType(doc, 'LiberationSans-Italic.ttf', 'GHIJKL+Arial-ItalicMT'), 72, 700, 11, 'Embedded italic words');

  // and one column that turns into two further down, short ones
  line(p6, 72, 650, 11, [['A line that runs right across the middle of the page, above where the columns start', regular]]);
  for (let i = 0; i < 3; i++) {
    line(p6, 72, 600 - i * 14, 11, [[`Short left ${i + 1}`, regular]]);
    line(p6, 320, 600 - i * 14, 11, [[`Short right ${i + 1}`, regular]]);
  }

  return doc.save();
}

const paragraphs = (xml: string) => [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => m[0]);
const textOf = (p: string) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
const frameOf = (p: string) => p.match(/<w:framePr [^>]*\/>/)?.[0] ?? null;
const attr = (tag: string, name: string) => Number(tag.match(new RegExp(`${name}="(-?\\d+)"`))?.[1]);

let xml = '';
let scanned: number[] = [];

beforeAll(async () => {
  // opened the way the app opens it
  const pdf = await pdfjs.getDocument({ ...FONT_NAMES, data: await makeFixture(), verbosity: 0 }).promise;
  const result = await convertPdf(pdf as unknown as PDFDocumentProxy, helpers);
  scanned = result.scanned;
  xml = await (await JSZip.loadAsync(await result.blob.arrayBuffer())).file('word/document.xml')!.async('string');
});

describe('pdf to word', () => {
  it('puts the page, without its text, behind every page', () => {
    const anchors = [...xml.matchAll(/<wp:anchor [^>]*>/g)].map((m) => m[0]);
    expect(anchors).toHaveLength(6);
    for (const anchor of anchors) expect(anchor).toContain('behindDoc="1"');
    expect([...xml.matchAll(/<w:pgMar [^>]*\/>/g)].every((m) => /w:top="0"/.test(m[0]) && /w:left="0"/.test(m[0]))).toBe(true);
  });

  it('places the text where it was on the page, as text word can edit', () => {
    const title = paragraphs(xml).find((p) => textOf(p) === 'Quarterly report')!;
    const frame = frameOf(title)!;
    expect(frame).toContain('w:hAnchor="page"');
    expect(frame).toContain('w:vAnchor="page"');
    expect(attr(frame, 'w:x')).toBe(72 * 20);
    // its baseline sits where it was, 842 - 770 = 72pt down the page
    expect(Math.abs(attr(frame, 'w:y') + 24 * 1.2 * 0.8 * 20 - 72 * 20)).toBeLessThan(20);
  });

  it('keeps a paragraph together in one box, line for line', () => {
    const lines = paragraphs(xml).filter((p) => /^(Sales grew|ued growth|steady, and)/.test(textOf(p)));
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map(frameOf)).size).toBe(1);
    expect(textOf(lines[0])).toMatch(/contin-$/);
  });

  it('keeps bold, italic, fonts and colours', () => {
    const runs = (start: string) => [...paragraphs(xml).find((p) => textOf(p).startsWith(start))!.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]);
    const revenue = runs('Revenue was');
    expect(revenue.find((r) => r.includes('up 24 percent'))).toContain('<w:b/>');
    expect(revenue.find((r) => r.includes('excellent'))).toContain('<w:i/>');
    expect(revenue[0]).toContain('w:ascii="Arial"');
    expect(revenue[0]).toContain('<w:color w:val="000000"/>');
    expect(runs('A red warning')[0]).toContain('<w:color w:val="c81e1e"/>');
    expect(runs('Set in a serif')[0]).toContain('w:ascii="Times New Roman"');
  });

  it('knows bold and italic in fonts embedded in the pdf', () => {
    const run = (text: string) => paragraphs(xml).find((p) => textOf(p) === text)!;
    expect(run('Embedded bold title')).toContain('<w:b/>');
    expect(run('Embedded bold title')).toContain('w:ascii="Arial"');
    expect(run('Embedded italic words')).toContain('<w:i/>');
    expect(run('Embedded italic words')).not.toContain('<w:b/>');
  });

  it('marks bigger text as Word headings, so the navigation pane works', () => {
    expect(paragraphs(xml).find((p) => textOf(p) === 'Quarterly report')).toContain('<w:pStyle w:val="Heading1"/>');
    expect(paragraphs(xml).find((p) => textOf(p) === 'Highlights')).toContain('<w:pStyle w:val="Heading2"/>');
  });

  it('reads a two column page left column first', () => {
    const order = paragraphs(xml).map(textOf).join('|');
    expect(order.indexOf('Left column line 8')).toBeLessThan(order.indexOf('Right column line 1'));
  });

  it('finds columns that only start part way down a page', () => {
    const order = paragraphs(xml).map(textOf).join('|');
    expect(order.indexOf('Short left 3')).toBeLessThan(order.indexOf('Short right 1'));
    const left = paragraphs(xml).filter((p) => textOf(p).startsWith('Short left'));
    expect(new Set(left.map(frameOf)).size).toBe(1);
  });

  it('keeps each page its own size, so landscape stays landscape', () => {
    const sizes = [...xml.matchAll(/<w:pgSz ([^>]*)\/>/g)].map((m) => m[1]);
    expect(sizes[0]).toContain('w:orient="portrait"');
    expect(sizes[2]).toContain('w:orient="landscape"');
    expect(sizes[2]).toContain('w:w="16840"');
  });

  it('keeps scans as pictures, even with hidden words over them', () => {
    expect(scanned).toEqual([4, 5]);
    expect(xml).not.toContain('hidden words');
  });
});

describe('inkColor', () => {
  const page = (fill: (x: number, y: number) => number[]) => {
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) data.set([...fill(x, y), 255], (y * 20 + x) * 4);
    return data;
  };
  const box = { x0: 0, y0: 0, x1: 20, y1: 20 };

  it('finds the colour text was drawn in', () => {
    const plain = page(() => [255, 255, 255]);
    const inked = page((x) => (x > 5 && x < 12 ? [20, 60, 200] : [255, 255, 255]));
    expect(inkColor(inked, plain, 20, box)).toBe('143cc8');
  });

  it('reads white text on a dark background too', () => {
    const plain = page(() => [10, 10, 10]);
    const inked = page((x) => (x > 5 && x < 12 ? [255, 255, 255] : [10, 10, 10]));
    expect(inkColor(inked, plain, 20, box)).toBe('ffffff');
  });

  it('reads the solid middle of the letters, not their soft edges', () => {
    const plain = page(() => [255, 255, 255]);
    // a dark blue stroke with half-blended pixels either side, the way text is drawn smooth
    const inked = page((x) => (x === 8 || x === 9 ? [30, 41, 59] : x === 7 || x === 10 ? [142, 148, 157] : [255, 255, 255]));
    expect(inkColor(inked, plain, 20, box)).toBe('1e293b');
  });

  it('says nothing was drawn for invisible text', () => {
    const plain = page(() => [255, 255, 255]);
    expect(inkColor(plain, plain, 20, box)).toBeNull();
  });
});

describe('tidyColors', () => {
  const piece = (text: string, color: string): TextPiece => ({ text, color, x: 0, y: 0, width: 10, size: 11, bold: false, italic: false, font: 'Arial' });

  it('turns nearly the same colours into the one used most', () => {
    const [first, second] = tidyColors([[piece('a long line of body text', '1f2937'), piece('word', '212a38')], [piece('more body', '1e2836'), piece('red', 'b91c1c')]]);
    expect([...first, ...second].map((p) => p.color)).toEqual(['1f2937', '1f2937', '1f2937', 'b91c1c']);
  });
});

describe('wordFont', () => {
  it.each([
    ['ABCDEF+Arial-BoldMT', 'sans', 'Arial'],
    ['TimesNewRomanPSMT', 'serif', 'Times New Roman'],
    ['TimesNewRomanPS-BoldMT', 'serif', 'Times New Roman'],
    ['Helvetica', 'sans', 'Arial'],
    ['Calibri-Bold', 'sans', 'Calibri'],
    ['QWERTY+Georgia-Italic', 'serif', 'Georgia'],
    ['XYZABC+SomeHouseFont', 'sans', 'Arial'],
    ['XYZABC+SomeHouseFont', 'serif', 'Times New Roman'],
  ] as const)('maps %s to %s', (name, generic, expected) => {
    expect(wordFont(name, generic)).toBe(expected);
  });
});
