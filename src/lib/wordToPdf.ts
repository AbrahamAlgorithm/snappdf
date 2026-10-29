import fontkit from '@pdf-lib/fontkit';
import { parseAsync, renderDocument } from 'docx-preview';
import JSZip from 'jszip';
import {
  beginText,
  endText,
  PDFDocument,
  PDFString,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setFillingColor,
  setFontAndSize,
  setLineWidth,
  setStrokingColor,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  TextRenderingMode,
  type PDFFont,
  type PDFImage,
  type PDFName,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

// word to pdf, all on the device. docx-preview lays the document out as html pages, then each page is drawn into
// the pdf from that layout: real text in the same font and place, plus the boxes, lines, pictures and links

// css px to pdf points
const PT = 0.75;
// how far browsers slant a font that has no italic of its own
const FAKE_ITALIC = 0.25;

export type Family = 'SansC' | 'Caladea' | 'Arimo' | 'Tinos' | 'Cousine';
type Style = 'Regular' | 'Bold' | 'Italic';
type Face = { family: Family; style: Style; skew: number; fakeBold: boolean };

// stand-ins for word's fonts with the same letter widths, so lines and pages break where they do in word
export const FACES: Record<Family, Style[]> = {
  SansC: ['Regular', 'Bold', 'Italic'],
  Arimo: ['Regular', 'Bold', 'Italic'],
  Tinos: ['Regular', 'Bold', 'Italic'],
  Caladea: ['Regular', 'Bold'],
  Cousine: ['Regular', 'Bold'],
};
const FALLBACKS: Family[] = ['Arimo', 'Tinos', 'SansC', 'Cousine'];
const FONT_FILES = import.meta.glob<string>('../assets/fonts/word/*.ttf', { query: '?url', import: 'default', eager: true });
export const fileOf = (family: Family, style: Style) => FONT_FILES[`../assets/fonts/word/${family === 'SansC' ? 'SnappdfSansC' : family}-${style}.ttf`];

// fonts every word document can lean on, even when its font table leaves them out
const WORD_DEFAULTS = ['Calibri', 'Calibri Light', 'Cambria', 'Arial', 'Times New Roman', 'Courier New', 'Aptos'];
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'inherit', 'initial']);

export function isSymbolFont(name: string) {
  return /symbol|wingdings|webdings|dingbat/i.test(name);
}

// which bundled font stands in for one named in the document, kind is the font table's roman/swiss/modern
export function standIn(name: string, kind = ''): Family {
  const n = name.toLowerCase();
  if (/calibri|carlito|aptos|candara|corbel/.test(n)) return 'SansC';
  if (/cambria|caladea/.test(n)) return 'Caladea';
  if (/courier|consolas|cousine|mono|menlo|monaco|lucida console|typewriter/.test(n)) return 'Cousine';
  if (/serif|times|tinos|georgia|garamond|antiqua|palatino|baskerville|bookman|schoolbook|constantia|merriweather|playfair|lora/.test(n) && !/sans/.test(n))
    return 'Tinos';
  if (kind === 'modern') return 'Cousine';
  if (kind === 'roman') return 'Tinos';
  return 'Arimo';
}

export function firstFamily(list: string) {
  return (list.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
}

// what browsers draw for a weight and style, so the pdf uses the same face and fakes the same way
export function faceFor(family: Family, bold: boolean, italic: boolean): Face {
  if (italic && FACES[family].includes('Italic')) return { family, style: 'Italic', skew: 0, fakeBold: bold };
  return { family, style: bold ? 'Bold' : 'Regular', skew: italic ? FAKE_ITALIC : 0, fakeBold: false };
}

// list numbers, the way word writes them: a b c … z aa bb, i ii iii, 01 02
export function formatCounter(n: number, style: string) {
  const letters = () => String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
  switch (style) {
    case 'lower-alpha':
    case 'lower-latin':
      return n > 0 ? letters() : String(n);
    case 'upper-alpha':
    case 'upper-latin':
      return n > 0 ? letters().toUpperCase() : String(n);
    case 'lower-roman':
      return roman(n).toLowerCase();
    case 'upper-roman':
      return roman(n);
    case 'decimal-leading-zero':
      return n >= 0 && n < 10 ? `0${n}` : String(n);
    case 'disc':
      return '•';
    case 'circle':
      return '◦';
    case 'square':
      return '▪';
    case 'none':
      return '';
    default:
      return String(n);
  }
}

function roman(n: number) {
  if (n <= 0 || n >= 4000) return String(n);
  const marks: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [value, mark] of marks) while (n >= value) (out += mark), (n -= value);
  return out;
}

// "docx-num-1-0 1 docx-num-1-1 0" from a computed counter-reset, counter-set or counter-increment
export function readCounters(value: string): [string, number | null][] {
  if (!value || value === 'none') return [];
  const parts = value.trim().split(/\s+/);
  const out: [string, number | null][] = [];
  for (let i = 0; i < parts.length; i++) {
    const next = parts[i + 1];
    if (next !== undefined && /^-?\d+$/.test(next)) out.push([parts[i], Number(next)]), i++;
    else out.push([parts[i], null]);
  }
  return out;
}

// the text a computed ::before content draws, like `counter(docx-num-1-0, lower-roman) ".\9"`
export function evaluateContent(content: string, counters: Map<string, number>) {
  let out = '';
  let i = 0;
  while (i < content.length) {
    const c = content[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < content.length && content[i] !== c) {
        if (content[i] !== '\\') {
          out += content[i++];
          continue;
        }
        i++;
        const hex = /^[0-9a-fA-F]{1,6}/.exec(content.slice(i));
        if (hex) {
          const code = parseInt(hex[0], 16);
          out += code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
          i += hex[0].length;
          if (/\s/.test(content[i] ?? '')) i++;
        } else if (content[i] !== '\n') {
          out += content[i++] ?? '';
        } else {
          i++;
        }
      }
      i++;
    } else if (content.startsWith('counter(', i)) {
      const end = content.indexOf(')', i);
      const [name, style = 'decimal'] = content.slice(i + 8, end).split(',').map((s) => s.trim());
      out += formatCounter(counters.get(name) ?? 0, style);
      i = end + 1;
    } else {
      i++;
    }
  }
  return out;
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
// marks put into the document before layout: page numbers, repeating header rows, and where word's own pages started
const PAGE = '\ue000';
const PAGES_TOTAL = '\ue001';
const HEADER_ROW = '\ue002';
const SOFT_PAGE = '\ue003';
const SOFT_SPLIT = '\ue004';

const fieldMark = (instruction: string) => {
  const name = instruction.trim().split(/\s+/)[0]?.toUpperCase();
  return name === 'PAGE' ? PAGE : name === 'NUMPAGES' || name === 'SECTIONPAGES' ? PAGES_TOTAL : null;
};

const V = 'urn:schemas-microsoft-com:vml';
const W10 = 'urn:schemas-microsoft-com:office:word';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const DRAWING = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const isOff = (value: string | null | undefined) => !!value && /^(f|false|0|off)$/i.test(value.trim());

// a vml colour like "#1f4e79", "black" or "windowText [64]" as a css colour
const vmlColor = (value: string | null, fallback: string) => {
  const color = value?.trim().split(/\s+/)[0] ?? '';
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) || (/^[a-z]+$/i.test(color) && CSS.supports('color', color)) ? color : fallback;
};

const POINTS: Record<string, number> = { pt: 1, in: 72, mm: 72 / 25.4, cm: 72 / 2.54, px: 0.75, pc: 12 };

// a text box's inset like "0,0,0,0" or "5.76pt,2.88pt" as left, top, right and bottom in points. a side that's
// left out keeps word's default of 0.1in across and 0.05in down, and a bare number is in emu
export function textInset(value: string | null) {
  const sides = (value ?? '').split(',');
  return [7.2, 3.6, 7.2, 3.6].map((fallback, i) => {
    const m = /^\s*(-?\d*\.?\d+)\s*(pt|in|mm|cm|px|pc)?\s*$/i.exec(sides[i] ?? '');
    return m ? parseFloat(m[1]) * (m[2] ? POINTS[m[2].toLowerCase()] : 1 / 12700) : fallback;
  });
}

// docx-preview reads a shape's outline only from a <v:stroke> inside it, leaves a shape with no fill colour black,
// can't show words inside a box or an oval, and drops rounded rectangles. word writes fills and outlines as
// attributes with defaults from the shape's type, so this rewrites shapes the way docx-preview reads them
function vmlShapes(dom: Document) {
  const vml = (tag: string) => [...dom.getElementsByTagNameNS(V, tag)];
  const child = (el: Element, tag: string) => [...el.children].find((c) => c.localName === tag && c.namespaceURI === V);
  const rename = (el: Element, tag: string) => {
    const next = dom.createElementNS(V, `v:${tag}`);
    for (const a of [...el.attributes]) next.setAttributeNS(a.namespaceURI, a.name, a.value);
    next.append(...el.childNodes);
    el.replaceWith(next);
    return next;
  };
  const types = new Map(vml('shapetype').map((t) => [t.getAttribute('id'), t]));
  const shapes = ['shape', 'rect', 'roundrect', 'oval', 'line'].flatMap(vml);
  for (const shape of shapes) {
    const type = types.get(shape.getAttribute('type')?.replace(/^#/, '') ?? '');
    const pick = (name: string) => shape.getAttribute(name) ?? type?.getAttribute(name) ?? null;
    const picture = shape.getElementsByTagNameNS(V, 'imagedata').length > 0;
    // word moves the text out of the way of a shape it wraps around. docx-preview can't, so the text goes over it
    const wrap = [...shape.children].find((c) => c.localName === 'wrap' && c.namespaceURI === W10)?.getAttribute('type');
    const style = shape.getAttribute('style') ?? '';
    if (wrap && wrap !== 'none' && !/z-index:\s*-/i.test(style)) shape.setAttribute('style', `${style.replace(/z-index:[^;]*/gi, '')};z-index:-1`);
    let stroke = child(shape, 'stroke');
    // pictures and equations have no outline unless one's asked for
    if (isOff(pick('stroked')) || isOff(stroke?.getAttribute('on')) || (picture && !shape.hasAttribute('stroked') && !shape.hasAttribute('strokecolor'))) {
      stroke?.remove();
      stroke = undefined;
    } else {
      stroke ??= shape.insertBefore(dom.createElementNS(V, 'v:stroke'), shape.firstChild);
      stroke.setAttribute('color', vmlColor(stroke.getAttribute('color') || pick('strokecolor'), '#000000'));
      stroke.setAttribute('weight', stroke.getAttribute('weight') || pick('strokeweight') || '0.75pt');
    }
    if (picture || shape.localName === 'line') continue;
    const fill = isOff(pick('filled')) || isOff(child(shape, 'fill')?.getAttribute('on')) ? 'none' : vmlColor(pick('fillcolor'), '#ffffff');

    const box = child(shape, 'textbox');
    if (!box) {
      shape.setAttribute('fillcolor', fill);
      if (shape.localName === 'roundrect') rename(shape, 'rect');
      continue;
    }
    // svg can't put words inside a box or an oval, so the box goes under the words inside a plain shape
    const outline = dom.createElementNS(V, shape.localName === 'oval' ? 'v:oval' : 'v:rect');
    outline.setAttribute('fillcolor', fill);
    if (stroke) outline.append(stroke);
    const outer = shape.localName === 'shape' ? shape : rename(shape, 'shape');
    outer.removeAttribute('fillcolor');
    if (fill !== 'none' || stroke) outer.prepend(outline);
    // word keeps the words a little in from the edges, fitShapes moves them in
    outer.setAttribute('style', `${outer.getAttribute('style') ?? ''};--w2p-inset:${textInset(box.getAttribute('inset')).join(' ')}`);
  }
  return shapes.length > 0;
}

// what docx-preview can't draw at all: charts, smartart, grouped shapes, and shapes saved without the older copy
function countUnsupported(dom: Document, found: Unsupported) {
  const inChoice = (el: Element) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (p.localName === 'Choice' && p.namespaceURI === MC) return true;
    return false;
  };
  for (const data of dom.getElementsByTagNameNS(DRAWING, 'graphicData')) {
    if (inChoice(data)) continue;
    const uri = data.getAttribute('uri') ?? '';
    if (/\/(chart|diagram)$|chartex/i.test(uri)) found.charts++;
    else if (/wordprocessing(Shape|Group|Canvas)/i.test(uri)) found.shapes++;
  }
  found.shapes += dom.getElementsByTagNameNS(V, 'group').length;
}

export type Unsupported = { charts: number; shapes: number };

// docx-preview skips fields, so page numbers would be missing or stuck on the number word last saved
export function markXml(xml: string, found: Unsupported = { charts: 0, shapes: 0 }) {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  const el = (parent: Element | Document, tag: string) => parent.getElementsByTagNameNS(W, tag);
  const markRun = (before: Element, mark: string, style?: Element) => {
    const run = dom.createElementNS(W, 'w:r');
    if (style) run.append(style.cloneNode(true));
    const text = dom.createElementNS(W, 'w:t');
    text.textContent = mark;
    run.append(text);
    before.before(run);
  };
  let changed = false;

  // docx-preview drops a whole run that holds a field, text and all, so give each piece of those runs its own run.
  // word does this already, other apps often don't
  for (const run of [...el(dom, 'r')]) {
    const parts = [...run.children].filter((c) => c.localName !== 'rPr');
    if (parts.length < 2 || !parts.some((c) => c.localName === 'fldChar' || c.localName === 'instrText')) continue;
    const style = [...run.children].find((c) => c.localName === 'rPr');
    for (const part of parts) {
      const piece = dom.createElementNS(W, 'w:r');
      if (style) piece.append(style.cloneNode(true));
      piece.append(part);
      run.before(piece);
    }
    run.remove();
    changed = true;
  }

  for (const field of [...el(dom, 'fldSimple')]) {
    const mark = fieldMark(field.getAttributeNS(W, 'instr') ?? '');
    if (!mark) continue;
    markRun(field, mark, el(field, 'rPr')[0]);
    field.remove();
    changed = true;
  }

  // a complex field is runs in a row: begin, the instruction, separate, the last saved result, end
  for (const p of [...el(dom, 'p')]) {
    let runs: Element[] = [];
    let instruction = '';
    let depth = 0;
    for (const run of [...el(p, 'r')]) {
      if (!run.isConnected) continue;
      const type = el(run, 'fldChar')[0]?.getAttributeNS(W, 'fldCharType');
      if (type === 'begin' && ++depth === 1) {
        runs = [run];
        instruction = '';
        continue;
      }
      if (!depth) continue;
      runs.push(run);
      if (depth === 1) instruction += el(run, 'instrText')[0]?.textContent ?? '';
      if (type === 'end' && --depth === 0) {
        const mark = fieldMark(instruction);
        if (mark) {
          const style = runs.map((r) => el(r, 'rPr')[0]).find(Boolean);
          markRun(runs[0], mark, style);
          runs.forEach((r) => r.remove());
          changed = true;
        }
      }
    }
  }

  for (const row of [...el(dom, 'tr')]) {
    const head = el(row, 'tblHeader')[0];
    if (!head || ['false', '0', 'off'].includes(head.getAttributeNS(W, 'val') ?? '')) continue;
    const text = el(row, 't')[0];
    if (!text) continue;
    text.textContent = HEADER_ROW + (text.textContent ?? '');
    changed = true;
  }

  // where word's pages fell when it last saved. those breaks are soft, after an edit text flows across them again
  for (const mark of [...el(dom, 'lastRenderedPageBreak')]) {
    let p = mark.parentElement;
    while (p && p.localName !== 'p') p = p.parentElement;
    if (!p) continue;
    const texts = [...el(p, 't')];
    const after = texts.find((t) => mark.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!after) continue;
    const midway = texts.some((t) => t.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING && t.textContent?.trim());
    after.textContent = (midway ? SOFT_SPLIT : SOFT_PAGE) + (after.textContent ?? '');
    changed = true;
  }

  if (vmlShapes(dom)) changed = true;
  countUnsupported(dom, found);
  return changed ? new XMLSerializer().serializeToString(dom) : xml;
}

async function prepare(file: File) {
  const zip = await JSZip.loadAsync(file);
  const found: Unsupported = { charts: 0, shapes: 0 };
  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = await zip.file(name)!.async('string');
    const marked = markXml(xml, found);
    if (marked !== xml) {
      zip.file(name, marked);
      changed = true;
    }
  }
  return { blob: changed ? await zip.generateAsync({ type: 'blob' }) : file, found };
}

// docx-preview draws word's shapes as svg and sizes them a frame later, so that's done here before the pages are
// measured. a text box's words also move in from its edges by the inset vmlShapes noted
function fitShapes(body: HTMLElement) {
  for (const svg of body.querySelectorAll<SVGSVGElement>('svg')) {
    const shape = svg.firstElementChild as SVGGraphicsElement | null;
    if (!shape) continue;
    if (!svg.getAttribute('width')) {
      const box = shape.getBBox();
      svg.setAttribute('width', `${Math.ceil(box.x + box.width)}`);
      svg.setAttribute('height', `${Math.ceil(box.y + box.height)}`);
    }
    const inset = svg.style.getPropertyValue('--w2p-inset').trim().split(/\s+/).map((pt) => (parseFloat(pt) * 4) / 3);
    if (inset.length !== 4 || inset.some(isNaN)) continue;
    const [left, top, right, bottom] = inset;
    const { width, height } = svg.getBoundingClientRect();
    for (const words of [...shape.children].filter((c) => c.localName === 'foreignObject')) {
      words.setAttribute('x', `${left}`);
      words.setAttribute('y', `${top}`);
      words.setAttribute('width', `${Math.max(0, width - left - right)}`);
      words.setAttribute('height', `${Math.max(0, height - top - bottom)}`);
    }
  }
}

// emf and wmf, word's old windows picture formats that browsers can't show
export function isOldWindowsPicture(bytes: Uint8Array) {
  const emf = bytes.length > 44 && bytes[0] === 1 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 && bytes[40] === 0x20 && bytes[41] === 0x45 && bytes[42] === 0x4d && bytes[43] === 0x46;
  const placeable = bytes[0] === 0xd7 && bytes[1] === 0xcd && bytes[2] === 0xc6 && bytes[3] === 0x9a;
  const wmf = (bytes[0] === 1 || bytes[0] === 2) && bytes[1] === 0 && bytes[2] === 9 && bytes[3] === 0;
  return emf || placeable || wmf;
}

const textNodes = (root: Node, test: RegExp) => {
  const found: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) if (test.test(node.data)) found.push(node);
  return found;
};

// page number fields become spans the first time, so every later layout can renumber them
function numberPages(pages: HTMLElement[]) {
  for (const node of textNodes(pages[0]?.parentElement ?? document.createElement('div'), /[\ue000\ue001]/)) {
    node.replaceWith(
      ...node.data.split(/([\ue000\ue001])/).filter(Boolean).map((part) => {
        if (part !== PAGE && part !== PAGES_TOTAL) return part;
        const span = document.createElement('span');
        span.dataset.mark = part === PAGE ? 'page' : 'total';
        return span;
      }),
    );
  }
  pages.forEach((page, i) => {
    for (const span of page.querySelectorAll<HTMLElement>('[data-mark]')) span.textContent = String(span.dataset.mark === 'page' ? i + 1 : pages.length);
  });
}

// the first text on a page, where a page break mark would be if word started the page there
function firstText(page: HTMLElement) {
  for (const article of page.querySelectorAll(':scope > article')) {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.trim()) return node;
  }
  return null;
}

// after layout: repeating header rows, and pages word started by itself, which take text back after an edit
function findMarks(body: HTMLElement) {
  for (const node of textNodes(body, /[\ue002-\ue004]/)) {
    if (node.data.includes(HEADER_ROW)) node.parentElement?.closest('tr')?.setAttribute('data-repeat', '');
    const page = node.parentElement?.closest<HTMLElement>('section.docx');
    // a mark anywhere else is a break docx-preview didn't follow, like one inside a table
    if (page && /[\ue003\ue004]/.test(node.data) && firstText(page) === node) {
      page.setAttribute('data-flow', '');
      const p = node.parentElement?.closest<HTMLElement>('p');
      // the rest of a paragraph carries on with no first line indent or space above, like in word
      if (p && node.data.includes(SOFT_SPLIT)) markTail(p);
    }
    node.data = node.data.replace(/[\ue002-\ue004]/g, '');
  }
}

const markTail = (p: HTMLElement) => {
  p.setAttribute('data-tail', '');
  p.style.textIndent = '0px';
  p.style.marginTop = '0px';
  p.classList.add('w2p-marked');
};

// bullets from word's symbol fonts sit in private use codes, these are the real characters
const SYMBOL_BULLETS: Record<string, string> = {
  '\uf0b7': '•', '\uf0a7': '▪', '\uf0d8': '►', '\uf076': '◆', '\uf0fc': '✓', '\uf06e': '■', '\uf06f': '□', '\uf071': '□', '\uf0a8': '◦',
};
export const plainBullets = (text: string) => text.replace(/[\uf000-\uf0ff]/g, (c) => SYMBOL_BULLETS[c] ?? '•');

export type WordPdf = {
  bytes: Uint8Array;
  pages: { width: number; height: number }[];
  // characters no bundled font has, like emoji or other alphabets, left out of the pdf
  missingText: boolean;
  // pictures or shapes that couldn't go in
  skipped: number;
  // emf and wmf pictures, which browsers can't show
  oldPictures: number;
  // charts and smartart, which docx-preview doesn't draw
  charts: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// font files are fetched once and kept for the next document
const fontData = new Map<string, Promise<Uint8Array>>();
const loadFont = (url: string) => {
  let data = fontData.get(url);
  if (!data) {
    data = fetch(url).then(async (res) => new Uint8Array(await res.arrayBuffer()));
    fontData.set(url, data);
  }
  return data;
};
const fontkits = new Map<string, Promise<ReturnType<typeof fontkit.create>>>();
const metricsOf = (face: Face) => {
  const url = fileOf(face.family, face.style);
  let font = fontkits.get(url);
  if (!font) {
    font = loadFont(url).then((bytes) => fontkit.create(bytes));
    fontkits.set(url, font);
  }
  return font;
};

const HOST_CSS = `
.w2p { position: fixed; left: -100000px; top: 0; pointer-events: none; font-family: Calibri; }
.w2p .docx-wrapper { display: block; padding: 0; background: none; }
.w2p .docx-wrapper > section.docx { margin: 0 0 40px; box-shadow: none; isolation: isolate; }
.w2p svg, .w2p foreignObject { overflow: visible; }
.w2p * { hyphens: manual !important; font-kerning: none !important; font-variant-ligatures: none !important; }
.w2p .w2p-marked::before { position: absolute !important; visibility: hidden !important; }
.w2p.w2p-editing { position: relative; left: auto; pointer-events: auto; }
.w2p-editing .docx-wrapper > section.docx { margin: 0 0 24px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 2px 12px rgba(0,0,0,.08); }
.w2p-editing section.docx > article { outline: none; }
.w2p-editing section.docx.w2p-over::after {
  content: 'Below this line moves to the next page'; position: absolute; left: 0; right: 0; top: var(--w2p-limit); z-index: 2147483647;
  border-top: 2px dashed #e5484d; padding: 2px 8px 0; text-align: right; font: 600 12px/1.4 system-ui, sans-serif; color: #e5484d; pointer-events: none;
}
`;

// a word document laid out as pages, kept open so it can be edited and made into a pdf again
export class WordLayout {
  private editing = false;
  private dirty = false;
  private snapshot: HTMLElement | null = null;
  private onEdit: (() => void) | null = null;
  private lastCaret: Range | null = null;
  private timer = 0;

  private constructor(
    private host: HTMLElement,
    private body: HTMLElement,
    private faces: FontFace[],
    private title: string,
    private docFonts: string[],
    // the size most of the text is, in points
    readonly normalSize: number,
    private unsupported: Unsupported,
  ) {}

  static async open(file: File, onProgress: (message: string) => void = () => {}) {
    const host = document.createElement('div');
    host.className = 'w2p';
    host.setAttribute('aria-hidden', 'true');
    const css = document.createElement('style');
    css.textContent = HOST_CSS;
    const styles = document.createElement('div');
    const body = document.createElement('div');
    host.append(css, styles, body);
    const faces: FontFace[] = [];

    try {
      onProgress('Reading your document…');
      const options = {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        // word saves where its pages broke, so pages break in the same places
        ignoreLastRenderedPageBreak: false,
        // lays out tab stops, which cvs lean on for dates
        experimental: true,
        ignoreFonts: true,
        useBase64URL: true,
        renderChanges: false,
        renderComments: false,
      };
      const { blob, found } = await prepare(file);
      const doc = await parseAsync(blob, options);
      const fontTable: { name: string; family?: string }[] = doc.fontTablePart?.fonts ?? [];
      const named = new Set<string>();
      await addFonts([...WORD_DEFAULTS.map((name) => ({ name })), ...fontTable], named, faces);

      onProgress('Laying out the pages…');
      document.body.append(host);
      const nodes = await renderDocument(doc, options);
      for (const node of nodes) (node.nodeName === 'STYLE' || node.nodeName === '#comment' ? styles : body).append(node);

      // fonts named in styles but missing from the font table
      const extra = new Set<string>();
      for (const el of body.querySelectorAll('*')) {
        const name = firstFamily(getComputedStyle(el).fontFamily);
        if (name && !named.has(name) && !GENERIC.has(name) && !isSymbolFont(name)) extra.add(name);
      }
      await addFonts([...extra].map((name) => ({ name })), named, faces);

      fitShapes(body);
      findMarks(body);
      syncMarkers(body);
      // docx-preview measures tab stops half a second after drawing
      if (body.querySelector('.docx-tab-stop')) await sleep(650);
      paginate(body);
      const title = doc.corePropsPart?.props?.title || file.name.replace(/\.docx$/i, '');
      const docFonts = [...fontTable.map((f) => f.name), ...extra].filter((name) => name && !isSymbolFont(name));
      return new WordLayout(host, body, faces, title, docFonts, commonSize(body), found);
    } catch (err) {
      host.remove();
      for (const face of faces) document.fonts.delete(face);
      throw err;
    }
  }

  get pages() {
    return [...this.body.querySelectorAll<HTMLElement>('section.docx')];
  }

  // the widest page, in css px
  get width() {
    return Math.max(...this.pages.map((page) => page.offsetWidth));
  }

  async toPdf(onProgress: (message: string) => void = () => {}): Promise<WordPdf> {
    const pageEls = this.pages;
    numberPages(pageEls);
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(this.title);
    pdf.setCreator('snappdf');
    pdf.setProducer('snappdf');

    const painter = new Painter(pdf);
    const pages: WordPdf['pages'] = [];
    for (const [i, el] of pageEls.entries()) {
      onProgress(`Making page ${i + 1} of ${pageEls.length}…`);
      pages.push(await painter.page(el));
      // let the page breathe between pages, so the progress shows
      await sleep(0);
    }

    onProgress('Saving your PDF…');
    return {
      bytes: await pdf.save(),
      pages,
      missingText: painter.missing > 0,
      skipped: painter.skipped + this.unsupported.shapes,
      oldPictures: painter.old,
      charts: this.unsupported.charts,
    };
  }

  // edits happen on the laid out pages themselves, moved into view inside mount. onEdit hears about every change
  startEditing(mount: HTMLElement, onEdit: () => void) {
    if (this.editing) return;
    this.editing = true;
    this.dirty = false;
    this.onEdit = onEdit;
    this.snapshot = this.body.cloneNode(true) as HTMLElement;
    // where each page's text has to stop, measured while still full size off screen
    for (const page of this.pages) page.style.setProperty('--w2p-limit', `${contentBottom(page) - page.getBoundingClientRect().top}px`);
    for (const article of this.body.querySelectorAll<HTMLElement>('section.docx > article')) {
      article.contentEditable = 'true';
      article.spellcheck = false;
    }
    for (const marker of this.body.querySelectorAll<HTMLElement>('.w2p-marker')) marker.contentEditable = 'false';
    // enter makes a new paragraph like word, not a line break
    document.execCommand('defaultParagraphSeparator', false, 'p');
    this.host.classList.add('w2p-editing');
    this.host.removeAttribute('aria-hidden');
    this.host.addEventListener('input', this.changed);
    document.addEventListener('selectionchange', this.rememberCaret);
    mount.append(this.host);
    this.checkOverflow();
  }

  // keeps the edits and flows the text across pages again. says whether anything changed
  finishEditing() {
    if (!this.editing) return false;
    this.stopEditing();
    if (this.dirty) {
      syncMarkers(this.body);
      unflow(this.body);
      paginate(this.body);
    }
    return this.dirty;
  }

  cancelEditing() {
    if (!this.editing) return;
    this.stopEditing();
    if (this.snapshot) {
      this.body.replaceWith(this.snapshot);
      this.body = this.snapshot;
    }
  }

  // fonts the editor offers: the document's own, and word's usual ones. all have stand-ins the pdf can embed
  get fonts() {
    return [...new Set([...this.docFonts, 'Arial', 'Calibri', 'Cambria', 'Courier New', 'Times New Roman'])].sort((a, b) => a.localeCompare(b));
  }

  contains(node: Node | null) {
    return !!node && this.host.contains(node);
  }

  // the toolbar's own inputs take the cursor away, this puts it back where it was in the pages
  restoreCaret() {
    if (!this.lastCaret) return null;
    const range = this.lastCaret.cloneRange();
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    return range;
  }

  // the toolbar changed the pages without typing
  touched() {
    this.changed();
  }

  // starts a new page at the cursor: the rest of that paragraph, or that table row, and everything after it
  newPageAtCaret() {
    const caret = this.caret();
    if (!caret) return false;
    const start = caret.startContainer;
    const article = (start instanceof Element ? start : start.parentElement)?.closest<HTMLElement>('section.docx > article');
    if (!article || !this.host.contains(article)) return false;
    let block: Node = start;
    while (block.parentNode && block.parentNode !== article) block = block.parentNode;
    if (!(block instanceof HTMLElement)) return false;

    let rest: HTMLElement | null = block;
    if (block.tagName === 'TABLE') {
      const row = (start instanceof Element ? start : start.parentElement)?.closest('tr');
      const index = row ? [...(block as HTMLTableElement).rows].indexOf(row as HTMLTableRowElement) : 0;
      rest = index > 0 ? splitTableAt(block as HTMLTableElement, index) : block;
    } else {
      const before = document.createRange();
      before.setStart(block, 0);
      before.setEnd(caret.startContainer, caret.startOffset);
      const after = document.createRange();
      after.setStart(caret.startContainer, caret.startOffset);
      after.setEnd(block, block.childNodes.length);
      if (!before.toString().trim()) rest = block;
      else if (!after.toString().trim()) rest = (block.nextElementSibling as HTMLElement | null) ?? addEmptyAfter(block);
      else {
        const tail = block.cloneNode(false) as HTMLElement;
        tail.append(after.extractContents());
        tail.style.textIndent = '0px';
        tail.style.marginTop = '0px';
        tail.classList.add('w2p-marked');
        block.after(tail);
        rest = tail;
      }
    }
    moveToNewPage(article.parentElement as HTMLElement, rest, false);

    const cursor = document.createRange();
    cursor.setStart(rest, 0);
    cursor.collapse(true);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(cursor);
    rest.scrollIntoView({ block: 'center' });
    this.changed();
    return true;
  }

  close() {
    this.cancelEditing();
    this.host.remove();
    for (const face of this.faces) document.fonts.delete(face);
  }

  private stopEditing() {
    this.editing = false;
    this.host.removeEventListener('input', this.changed);
    document.removeEventListener('selectionchange', this.rememberCaret);
    clearTimeout(this.timer);
    for (const el of this.body.querySelectorAll('[contenteditable]')) el.removeAttribute('contenteditable');
    for (const page of this.pages) {
      page.classList.remove('w2p-over');
      page.style.removeProperty('--w2p-limit');
    }
    this.host.classList.remove('w2p-editing');
    this.host.setAttribute('aria-hidden', 'true');
    getSelection()?.removeAllRanges();
    document.body.append(this.host);
    this.onEdit = null;
    this.lastCaret = null;
  }

  private changed = () => {
    this.dirty = true;
    clearTimeout(this.timer);
    // renumber lists and show pages that ran over once typing pauses
    this.timer = window.setTimeout(() => {
      syncMarkers(this.body, true);
      this.checkOverflow();
    }, 200);
    this.onEdit?.();
  };

  // a page that's grown past its end shows the line its text has to fit above
  private checkOverflow() {
    for (const page of this.pages) page.classList.toggle('w2p-over', page.offsetHeight > pageHeight(page) + 1);
  }

  // tapping a button can drop the selection on phones, so the last place the cursor was in the pages is kept
  private rememberCaret = () => {
    const selection = getSelection();
    if (selection?.rangeCount && this.host.contains(selection.anchorNode)) this.lastCaret = selection.getRangeAt(0).cloneRange();
  };

  private caret() {
    const selection = getSelection();
    if (selection?.rangeCount && this.host.contains(selection.anchorNode)) return selection.getRangeAt(0);
    return this.lastCaret;
  }
}

const addEmptyAfter = (block: HTMLElement) => {
  const empty = block.cloneNode(false) as HTMLElement;
  empty.append(document.createElement('br'));
  block.after(empty);
  return empty;
};

// registers the stand-in faces under the names the document uses, so its css picks them up as is
async function addFonts(fonts: { name: string; family?: string }[], named: Set<string>, faces: FontFace[]) {
  const added: FontFace[] = [];
  for (const { name, family: kind } of fonts) {
    if (!name || named.has(name) || isSymbolFont(name)) continue;
    named.add(name);
    const family = standIn(name, kind);
    for (const style of FACES[family]) {
      const bytes = await loadFont(fileOf(family, style));
      const face = new FontFace(name, bytes, { weight: style === 'Bold' ? '700' : '400', style: style === 'Italic' ? 'italic' : 'normal' });
      document.fonts.add(face);
      added.push(face);
    }
  }
  faces.push(...added);
  await Promise.all(added.map((face) => face.load()));
}

// list numbers and bullets are css counters in ::before, which isn't real text. work them out and put them in the
// paragraph as text, sized to the hanging indent like word's tab after the number. runs again after edits to renumber
function syncMarkers(body: HTMLElement, editing = false) {
  const counters = new Map<string, number>();
  const apply = (value: string, how: 'reset' | 'set' | 'increment') => {
    for (const [name, n] of readCounters(value)) {
      if (how === 'increment') counters.set(name, (counters.get(name) ?? 0) + (n ?? 1));
      else counters.set(name, n ?? 0);
    }
  };
  const wrapper = body.querySelector('.docx-wrapper');
  if (wrapper) apply(getComputedStyle(wrapper).counterReset, 'reset');
  // lists made in the editor, each numbered in its own order
  const made = new Map<string, number>();

  for (const p of body.querySelectorAll<HTMLElement>('p')) {
    const existing = p.firstElementChild?.classList.contains('w2p-marker') ? (p.firstElementChild as HTMLElement) : null;
    const own = getComputedStyle(p);
    let text = '';
    let before: CSSStyleDeclaration | null = null;
    // the rest of a paragraph word carried onto the next page has no number of its own
    if (p.dataset.list && !p.hasAttribute('data-tail')) {
      const n = (made.get(p.dataset.listId ?? '') ?? 0) + 1;
      made.set(p.dataset.listId ?? '', n);
      text = p.dataset.list === 'number' ? `${n}.` : '•';
    } else if (!p.hasAttribute('data-tail')) {
      apply(own.counterReset, 'reset');
      apply(own.counterIncrement, 'increment');
      apply(own.counterSet, 'set');
      const pseudo = getComputedStyle(p, '::before');
      if (pseudo.content !== 'none' && pseudo.content !== 'normal') {
        apply(pseudo.counterReset, 'reset');
        apply(pseudo.counterIncrement, 'increment');
        apply(pseudo.counterSet, 'set');
        text = plainBullets(evaluateContent(pseudo.content, counters)).replace(/[\t\n]/g, '');
        before = pseudo;
      }
    }
    if (!text.trim()) {
      existing?.remove();
      continue;
    }

    // numbers use the text's font unless the list sets one, like word. symbol bullets too, the stand-in has a real •
    let run: HTMLElement | null = null;
    for (const node of textNodes(p, /\S/)) if (!run && !node.parentElement?.closest('.w2p-marker')) run = node.parentElement;
    const base = run ? getComputedStyle(run) : own;
    const family = !before || isSymbolFont(firstFamily(before.fontFamily)) || before.fontFamily === own.fontFamily ? base.fontFamily : before.fontFamily;
    const size = !before || before.fontSize === own.fontSize ? base.fontSize : before.fontSize;
    const indent = parseFloat(own.textIndent) || 0;
    // text-indent is inherited, and would push the number out of its own box
    const css = `display:inline-block;white-space:pre;text-indent:0;font-size:${size};font-weight:${before?.fontWeight ?? '400'};font-style:${before?.fontStyle ?? 'normal'};color:${before?.color ?? base.color};${indent < 0 ? `min-width:${-indent}px;` : ''}`;
    const shown = indent < 0 ? text : `${text}\u00a0`;
    p.classList.add('w2p-marked');
    // left alone when nothing changed, so renumbering while someone types doesn't move their cursor
    if (existing?.textContent === shown && existing.dataset.look === css + family) continue;

    const marker = existing ?? document.createElement('span');
    marker.className = 'w2p-marker';
    marker.textContent = shown;
    marker.style.cssText = css;
    marker.style.fontFamily = family;
    marker.dataset.look = css + family;
    if (editing) marker.contentEditable = 'false';
    if (existing) continue;
    // enter in a list leaves the cursor at the very start of the new item, it belongs after the number
    const selection = getSelection();
    const atStart = selection?.isCollapsed && selection.anchorNode === p && selection.anchorOffset === 0;
    p.prepend(marker);
    if (atStart) selection.collapse(p, 1);
  }
}

// the size most of the text is, what normal text goes back to
function commonSize(body: HTMLElement) {
  const amounts = new Map<number, number>();
  for (const node of textNodes(body, /\S/)) {
    const pt = Math.round(parseFloat(getComputedStyle(node.parentElement!).fontSize) * PT * 2) / 2;
    amounts.set(pt, (amounts.get(pt) ?? 0) + node.data.trim().length);
  }
  return [...amounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
}

const pageHeight = (page: HTMLElement) => parseFloat(getComputedStyle(page).minHeight) || page.offsetHeight;

// the lowest the body text can reach on a page, above any footnotes and the footer
function contentBottom(page: HTMLElement) {
  const articles = [...page.children].filter((c) => c.tagName === 'ARTICLE');
  let tail = 0;
  for (let el = articles.at(-1)?.nextElementSibling; el; el = el.nextElementSibling) {
    const s = getComputedStyle(el);
    tail += (el as HTMLElement).offsetHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom);
  }
  return page.getBoundingClientRect().top + pageHeight(page) - parseFloat(getComputedStyle(page).paddingBottom) - tail;
}

// pages without word's own break marks (or whose text ran a little longer here) overflow, move what doesn't fit onto
// a new page, splitting paragraphs between lines and tables between rows
function paginate(body: HTMLElement) {
  let page = body.querySelector<HTMLElement>('section.docx');
  for (let guard = 0; page && guard < 3000; guard++) {
    if (page.offsetHeight > pageHeight(page) + 1) {
      const limit = contentBottom(page);
      const blocks = [...page.children].filter((c) => c.tagName === 'ARTICLE').flatMap((a) => [...a.children]) as HTMLElement[];
      const index = blocks.findIndex((b) => b.getBoundingClientRect().bottom > limit + 0.5);
      if (index !== -1) {
        const block = blocks[index];
        const rest = block.getBoundingClientRect().top >= limit - 0.5 ? block : splitBlock(block, limit);
        // a first block too tall for any page stays, it can't go anywhere better
        if (rest && !(rest === block && index === 0)) moveToNewPage(page, rest);
      }
    }
    page = page.nextElementSibling as HTMLElement | null;
    while (page && !page.matches('section.docx')) page = page.nextElementSibling as HTMLElement | null;
  }
}

// returns the part of the block that belongs on the next page
function splitBlock(block: HTMLElement, limit: number): HTMLElement {
  if (block.tagName === 'P') return splitParagraph(block, limit);
  if (block.tagName === 'TABLE') return splitTable(block as HTMLTableElement, limit);
  return block;
}

// where each line of a paragraph starts, a character below the line so far starts the next one
function lineStarts(p: HTMLElement) {
  const lines: { node: Text; offset: number; bottom: number }[] = [];
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let i = 0; i < node.length; i++) {
      const code = node.data.charCodeAt(i);
      if (code >= 0xdc00 && code <= 0xdfff) continue;
      range.setStart(node, i);
      range.setEnd(node, Math.min(node.length, code >= 0xd800 && code <= 0xdbff ? i + 2 : i + 1));
      // collapsed spaces have no box
      const rect = range.getClientRects()[0];
      if (!rect || !rect.height) continue;
      const line = lines.at(-1);
      if (!line || rect.top >= line.bottom - 1) lines.push({ node, offset: i, bottom: rect.bottom });
      else line.bottom = Math.max(line.bottom, rect.bottom);
    }
  }
  return lines;
}

function splitParagraph(p: HTMLElement, limit: number): HTMLElement {
  const lines = lineStarts(p);
  let k = lines.findIndex((line) => line.bottom > limit);
  // like word's widow and orphan control, a split never leaves one line on its own
  if (k <= 1) return p;
  if (lines.length - k === 1) {
    if (k < 3) return p;
    k--;
  }
  const cut = lines[k];

  const range = document.createRange();
  range.setStart(cut.node, cut.offset);
  range.setEnd(p, p.childNodes.length);
  const tail = p.cloneNode(false) as HTMLElement;
  tail.append(range.extractContents());
  markTail(tail);
  p.after(tail);
  return tail;
}

function splitTable(table: HTMLTableElement, limit: number): HTMLElement {
  return splitTableAt(table, [...table.rows].findIndex((row) => row.getBoundingClientRect().bottom > limit + 0.5), true);
}

// rows from index on become a table of their own. a soft split joins back up once text flows again
function splitTableAt(table: HTMLTableElement, index: number, soft = false): HTMLElement {
  const rows = [...table.rows];
  // header rows marked to repeat start the table again on the next page
  const head: HTMLTableRowElement[] = [];
  for (const row of rows) {
    if (!row.hasAttribute('data-repeat')) break;
    head.push(row);
  }
  if (index <= head.length) return table;
  const tail = table.cloneNode(false) as HTMLTableElement;
  if (soft) tail.setAttribute('data-tail', '');
  const cols = table.querySelector(':scope > colgroup');
  if (cols) tail.append(cols.cloneNode(true));
  const copies = head.map((r) => {
    const copy = r.cloneNode(true) as HTMLTableRowElement;
    copy.setAttribute('data-clone', '');
    return copy;
  });
  for (const row of [...copies, ...rows.slice(index)]) {
    const parent = (row.isConnected ? row : head[0]).parentElement!;
    if (parent === table) {
      tail.append(row);
      continue;
    }
    let box = tail.lastElementChild;
    if (!box || box.tagName !== parent.tagName) tail.append((box = parent.cloneNode(false) as HTMLElement));
    box.append(row);
  }
  table.after(tail);
  return tail;
}

// a soft new page carries on from this one, and gives its text back when text flows again
function moveToNewPage(page: HTMLElement, from: HTMLElement, soft = true) {
  const next = page.cloneNode(false) as HTMLElement;
  next.toggleAttribute('data-flow', soft);
  const footer = [...page.children].find((c) => c.tagName === 'FOOTER');
  for (const header of [...page.children].filter((c) => c.tagName === 'HEADER')) next.append(header.cloneNode(true));

  const article = from.parentElement!;
  const moved = article.cloneNode(false) as HTMLElement;
  for (let el: Element | null = from; el; ) {
    const after: Element | null = el.nextElementSibling;
    moved.append(el);
    el = after;
  }
  next.append(moved);
  // later sections of the same page follow on
  for (let el = article.nextElementSibling; el && el.tagName === 'ARTICLE'; ) {
    const after: Element | null = el.nextElementSibling;
    next.append(el);
    el = after;
  }
  if (footer) next.append(footer.cloneNode(true));
  page.after(next);
}

// undoes soft page breaks so edited text can flow again, split paragraphs and tables join up, real breaks stay
function unflow(body: HTMLElement) {
  for (const page of body.querySelectorAll<HTMLElement>('section.docx[data-flow]')) {
    let prev = page.previousElementSibling;
    while (prev && !prev.matches('section.docx')) prev = prev.previousElementSibling;
    if (!prev) continue;
    const end = [...prev.children].find((c) => c.tagName === 'FOOTER') ?? null;
    const target = [...prev.children].filter((c) => c.tagName === 'ARTICLE').at(-1);
    const first = [...page.children].find((c) => c.tagName === 'ARTICLE');
    for (const child of [...page.children]) {
      if (child.tagName === 'HEADER' || child.tagName === 'FOOTER') continue;
      if (child === first && target) {
        const head = target.lastElementChild;
        const tail = child.firstElementChild;
        if (head && tail?.hasAttribute('data-tail') && head.tagName === tail.tagName) join(head as HTMLElement, tail as HTMLElement);
        target.append(...child.childNodes);
      } else {
        // later sections and footnotes go along as they are
        prev.insertBefore(child, end);
      }
    }
    page.remove();
  }
}

function join(head: HTMLElement, tail: HTMLElement) {
  if (tail instanceof HTMLTableElement && head instanceof HTMLTableElement) {
    const box = head.rows[head.rows.length - 1]?.parentElement ?? head;
    box.append(...[...tail.rows].filter((row) => !row.hasAttribute('data-clone')));
  } else {
    head.append(...tail.childNodes);
    head.normalize();
  }
  tail.remove();
}

type Color = { color: RGB; alpha: number };
function parseColor(value: string): Color | null {
  const m = /rgba?\(([^)]+)\)/.exec(value);
  if (!m) return null;
  const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
  return { color: rgb(+r / 255, +g / 255, +b / 255), alpha: parseFloat(a) };
}

const isBlock = (cs: CSSStyleDeclaration) => !cs.display.startsWith('inline') || cs.display === 'inline-block';

class Painter {
  missing = 0;
  skipped = 0;
  old = 0;
  private fonts = new Map<string, Promise<PDFFont>>();
  private images = new Map<string, Promise<Embedded>>();
  private fontKeys = new Map<PDFFont, PDFName>();
  private out!: PDFPage;
  private left = 0;
  private bottom = 0;

  constructor(private pdf: PDFDocument) {}

  private x = (px: number) => (px - this.left) * PT;
  private y = (px: number) => (this.bottom - px) * PT;

  async page(el: HTMLElement) {
    const box = el.getBoundingClientRect();
    const height = pageHeight(el);
    this.out = this.pdf.addPage([box.width * PT, height * PT]);
    this.fontKeys = new Map();
    this.left = box.left;
    this.bottom = box.top + height;

    // like on screen, shapes word puts behind the text go under it and the ones floating in front go over it
    const depth = (svg: Element) => parseInt(getComputedStyle(svg).zIndex) || 0;
    const floating = [...el.querySelectorAll('svg')].filter((svg) => getComputedStyle(svg).position !== 'static').sort((a, b) => depth(a) - depth(b));
    const apart = new Set<Element>(floating);
    await this.element(el, el);
    for (const svg of floating.filter((s) => depth(s) < 0)) await this.walk(svg, el, apart);
    await this.walk(el, el, apart);
    for (const svg of floating.filter((s) => depth(s) >= 0)) await this.walk(svg, el, apart);
    this.links(el);
    return { width: box.width * PT, height: height * PT };
  }

  // draws what's inside root in order, leaving out what's hidden and the shapes in apart, which are drawn on their own
  private async walk(root: Element, page: HTMLElement, apart: Set<Element>) {
    const hidden = (el: Element) => {
      const cs = getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0';
    };
    if (root !== page && (hidden(root) || !root.getClientRects().length)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.nodeType === Node.ELEMENT_NODE && (apart.has(node as Element) || hidden(node as Element)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    if (root instanceof SVGElement) await this.shape(root);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) await this.text(node as Text);
      // a text box's words are html inside the svg, the walk reaches them like any other text
      else if (node instanceof SVGElement) await this.shape(node);
      else await this.element(node as HTMLElement, page);
    }
  }

  private async element(el: HTMLElement, page: HTMLElement | null) {
    const cs = getComputedStyle(el);
    const bg = parseColor(cs.backgroundColor);
    const inline = !isBlock(cs);
    const rects = inline ? [...el.getClientRects()] : [el.getBoundingClientRect()];
    const white = bg && bg.color.red === 1 && bg.color.green === 1 && bg.color.blue === 1;
    if (bg && bg.alpha > 0 && !(el === page && white)) {
      for (const r of rects) {
        if (r.width <= 0 || r.height <= 0) continue;
        this.out.drawRectangle({ x: this.x(r.left), y: this.y(r.bottom), width: r.width * PT, height: r.height * PT, color: bg.color, opacity: bg.alpha });
      }
    }
    if (!inline) this.borders(el, cs);
    if (el instanceof HTMLImageElement) await this.image(el);
  }

  // word's shapes, drawn as svg by docx-preview: boxes, ovals, lines and pictures. a text box is a group holding its
  // box and its words, and the walk reaches the words like any other text
  private async shape(el: SVGElement) {
    const tag = el.tagName.toLowerCase();
    const r = el.getBoundingClientRect();
    if (tag === 'image') {
      const href = (el as SVGImageElement).href.baseVal || el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      return href ? this.picture(href, r) : undefined;
    }
    if (tag === 'g') {
      // a shape word draws from its own outline, which docx-preview leaves out. a text box's group has no fill or outline
      const fill = el.getAttribute('fill');
      if ((fill && fill !== 'none') || el.hasAttribute('stroke')) this.skipped++;
      return;
    }
    if (!['rect', 'ellipse', 'circle', 'line'].includes(tag)) return;
    const cs = getComputedStyle(el);
    const fill = parseColor(cs.fill);
    const stroke = parseColor(cs.stroke);
    const width = parseFloat(cs.strokeWidth) || 0;
    const filled = !!fill && fill.alpha > 0 && parseFloat(cs.fillOpacity || '1') > 0;
    const stroked = !!stroke && stroke.alpha > 0 && width > 0;
    if ((!filled && !stroked) || (r.width <= 0 && r.height <= 0)) return;

    const outline = stroked ? { borderColor: stroke!.color, borderWidth: width * PT, borderOpacity: stroke!.alpha } : {};
    const paint = filled ? { color: fill!.color, opacity: fill!.alpha } : {};
    if (tag === 'line') {
      const line = el as SVGLineElement;
      const ctm = line.getScreenCTM();
      if (!ctm || !stroked) return;
      const a = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(ctm);
      const b = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(ctm);
      this.out.drawLine({ start: { x: this.x(a.x), y: this.y(a.y) }, end: { x: this.x(b.x), y: this.y(b.y) }, thickness: width * PT, color: stroke!.color, opacity: stroke!.alpha });
    } else if (tag === 'rect') {
      this.out.drawRectangle({ x: this.x(r.left), y: this.y(r.bottom), width: r.width * PT, height: r.height * PT, ...paint, ...outline });
    } else {
      this.out.drawEllipse({ x: this.x(r.left + r.width / 2), y: this.y(r.top + r.height / 2), xScale: (r.width / 2) * PT, yScale: (r.height / 2) * PT, ...paint, ...outline });
    }
  }

  private borders(el: HTMLElement, cs: CSSStyleDeclaration) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    // collapsed table borders sit on the cell edge, the rest inside the box
    const collapsed = /^(TD|TH|TABLE)$/.test(el.tagName) && cs.borderCollapse === 'collapse';
    for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
      const width = parseFloat(cs[`border${side}Width`]);
      const style = cs[`border${side}Style`];
      const color = parseColor(cs[`border${side}Color`]);
      if (!width || style === 'none' || style === 'hidden' || !color || color.alpha === 0) continue;
      const inset = collapsed ? 0 : width / 2;
      const [x1, y1, x2, y2] =
        side === 'Top' ? [r.left, r.top + inset, r.right, r.top + inset]
        : side === 'Bottom' ? [r.left, r.bottom - inset, r.right, r.bottom - inset]
        : side === 'Left' ? [r.left + inset, r.top, r.left + inset, r.bottom]
        : [r.right - inset, r.top, r.right - inset, r.bottom];
      const dash = style === 'dashed' ? [width * 3 * PT, width * 2 * PT] : style === 'dotted' ? [width * PT, width * PT] : undefined;
      this.out.drawLine({
        start: { x: this.x(x1), y: this.y(y1) },
        end: { x: this.x(x2), y: this.y(y2) },
        thickness: width * PT,
        color: color.color,
        opacity: color.alpha,
        dashArray: dash,
      });
    }
  }

  private async image(img: HTMLImageElement) {
    if (img.src) await this.picture(img.src, img.getBoundingClientRect());
  }

  private async picture(src: string, r: DOMRect) {
    if (r.width <= 0 || r.height <= 0) return;
    let embedded = this.images.get(src);
    if (!embedded) {
      embedded = embedImage(this.pdf, src);
      this.images.set(src, embedded);
    }
    const image = await embedded;
    if (image === 'old') this.old++;
    else if (!image) this.skipped++;
    else this.out.drawImage(image, { x: this.x(r.left), y: this.y(r.bottom), width: r.width * PT, height: r.height * PT });
  }

  private async text(node: Text) {
    const el = node.parentElement;
    if (!el || !node.data.trim()) return this.decorations(node);
    const cs = getComputedStyle(el);
    const color = parseColor(cs.color);
    const size = parseFloat(cs.fontSize);
    if (!color || color.alpha === 0 || !size) return;
    const primary = faceFor(standIn(firstFamily(cs.fontFamily)), (parseInt(cs.fontWeight) || 400) >= 600, cs.fontStyle !== 'normal');

    for (const word of node.data.matchAll(/\S+/g)) {
      for (const run of await this.coverage(word[0], primary)) {
        const start = word.index + run.start;
        const end = word.index + run.end;
        if (!run.face) {
          this.missing += run.end - run.start;
          continue;
        }
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const rects = range.getClientRects();
        // a word broken across lines goes character by character
        if (rects.length > 1) {
          for (let i = start; i < end; i++) await this.glyphs(node, i, i + 1, run.face, size, color.color);
        } else if (rects.length === 1) {
          await this.draw(node.data.slice(start, end), rects[0], run.face, size, color.color);
        }
      }
    }
    await this.decorations(node);
  }

  private async glyphs(node: Text, start: number, end: number, face: Face, size: number, color: RGB) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const rect = range.getClientRects()[0];
    if (rect) await this.draw(node.data.slice(start, end), rect, face, size, color);
  }

  // splits a word into stretches one face can draw, trying the other stand-ins for characters the first lacks
  private async coverage(word: string, primary: Face) {
    const runs: { start: number; end: number; face: Face | null }[] = [];
    let i = 0;
    for (const ch of word) {
      const code = ch.codePointAt(0)!;
      let face: Face | null = null;
      for (const family of [primary.family, ...FALLBACKS.filter((f) => f !== primary.family)]) {
        const candidate = family === primary.family ? primary : faceFor(family, primary.style === 'Bold' || primary.fakeBold, primary.style === 'Italic' || primary.skew > 0);
        if ((await metricsOf(candidate)).hasGlyphForCodePoint(code)) {
          face = candidate;
          break;
        }
      }
      // characters drawn with the same face stay one run
      const last = runs.at(-1);
      if (last && (last.face === face || (last.face && face && sameFace(last.face, face)))) last.end = i + ch.length;
      else runs.push({ start: i, end: i + ch.length, face });
      i += ch.length;
    }
    return runs;
  }

  private async draw(text: string, rect: DOMRect, face: Face, size: number, color: RGB) {
    if (rect.top >= this.bottom || rect.width <= 0) return;
    const metrics = await metricsOf(face);
    const font = await this.font(face);
    const baseline = rect.top + (rect.height * metrics.ascent) / (metrics.ascent - metrics.descent);
    const pt = size * PT;
    const drawn = font.widthOfTextAtSize(text, pt);
    const count = [...text].length;
    // letter spacing, or a hair of difference in how the browser rounded the widths
    const spacing = count > 0 ? Math.max(-pt / 2, Math.min(pt / 2, (rect.width * PT - drawn) / count)) : 0;

    let key = this.fontKeys.get(font);
    if (!key) {
      key = this.out.node.newFontDictionary(font.name, font.ref);
      this.fontKeys.set(font, key);
    }
    const ops = [pushGraphicsState(), beginText(), setFillingColor(color), setFontAndSize(key, pt), setCharacterSpacing(spacing)];
    // browsers thicken a font that has no bold of its own, an outline of the same colour does the same
    if (face.fakeBold) ops.push(setTextRenderingMode(TextRenderingMode.FillAndOutline), setStrokingColor(color), setLineWidth(pt / 30));
    ops.push(setTextMatrix(1, 0, face.skew, 1, this.x(rect.left), this.y(baseline)), showText(font.encodeText(text)), endText(), popGraphicsState());
    this.out.pushOperators(...ops);
  }

  // underline and strikethrough come from the text's own element or an inline parent
  private async decorations(node: Text) {
    const lines: { line: string; color: Color | null; style: string; el: Element }[] = [];
    for (let el = node.parentElement; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (s.textDecorationLine && s.textDecorationLine !== 'none')
        lines.push({ line: s.textDecorationLine, color: parseColor(s.textDecorationColor) ?? parseColor(s.color), style: s.textDecorationStyle, el });
      if (isBlock(s)) break;
    }
    if (!lines.length || !node.parentElement) return;
    const cs = getComputedStyle(node.parentElement);
    const size = parseFloat(cs.fontSize);
    const face = faceFor(standIn(firstFamily(cs.fontFamily)), (parseInt(cs.fontWeight) || 400) >= 600, cs.fontStyle !== 'normal');
    const metrics = await metricsOf(face);
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.top >= this.bottom) continue;
      const baseline = rect.top + (rect.height * metrics.ascent) / (metrics.ascent - metrics.descent);
      const thickness = Math.max(0.5, ((metrics.underlineThickness || 50) / metrics.unitsPerEm) * size);
      for (const { line, color, style } of lines) {
        if (!color || color.alpha === 0) continue;
        const ys: number[] = [];
        if (line.includes('underline')) ys.push(baseline - ((metrics.underlinePosition || -100) / metrics.unitsPerEm) * size);
        if (line.includes('line-through')) ys.push(baseline - ((metrics.xHeight || metrics.unitsPerEm / 2) / metrics.unitsPerEm / 2) * size);
        for (const y of ys) {
          this.out.drawLine({
            start: { x: this.x(rect.left), y: this.y(y) },
            end: { x: this.x(rect.right), y: this.y(y) },
            thickness: thickness * PT,
            color: color.color,
            dashArray: style === 'dotted' ? [thickness * PT, thickness * 2 * PT] : style === 'dashed' ? [thickness * 4 * PT, thickness * 2 * PT] : undefined,
          });
        }
      }
    }
  }

  // web and email links stay clickable
  private links(page: HTMLElement) {
    for (const a of page.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') ?? '';
      if (!/^(https?:|mailto:)/i.test(href)) continue;
      for (const r of a.getClientRects()) {
        if (r.width <= 0 || r.top >= this.bottom) continue;
        const annot = this.pdf.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [this.x(r.left), this.y(r.bottom), this.x(r.right), this.y(r.top)],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(href) },
        });
        this.out.node.addAnnot(this.pdf.context.register(annot));
      }
    }
  }

  private font(face: Face) {
    const url = fileOf(face.family, face.style);
    let font = this.fonts.get(url);
    if (!font) {
      font = loadFont(url).then((bytes) => this.pdf.embedFont(bytes, { subset: true }));
      this.fonts.set(url, font);
    }
    return font;
  }
}

const sameFace = (a: Face, b: Face) => a.family === b.family && a.style === b.style && a.skew === b.skew && a.fakeBold === b.fakeBold;

// a picture in the pdf, 'old' for emf and wmf pictures, or null when it can't go in
type Embedded = PDFImage | 'old' | null;

// png and jpeg go in as they are, anything else the browser can show is redrawn as png
async function embedImage(pdf: PDFDocument, src: string): Promise<Embedded> {
  try {
    const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
    if (isOldWindowsPicture(bytes)) return 'old';
  } catch {
    // falls through to redrawing it
  }
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? await pdf.embedPng(new Uint8Array(await blob.arrayBuffer())) : null;
  } catch {
    // emf and wmf pictures from old word versions, browsers can't show them
    return null;
  }
}
