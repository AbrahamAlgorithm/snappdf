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
// put into the document before layout and swapped out after: page numbers, and a table's repeating header rows
const PAGE = '\ue000';
const PAGES_TOTAL = '\ue001';
const HEADER_ROW = '\ue002';

const fieldMark = (instruction: string) => {
  const name = instruction.trim().split(/\s+/)[0]?.toUpperCase();
  return name === 'PAGE' ? PAGE : name === 'NUMPAGES' || name === 'SECTIONPAGES' ? PAGES_TOTAL : null;
};

// docx-preview skips fields, so page numbers would be missing or stuck on the number word last saved
export function markXml(xml: string) {
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
  return changed ? new XMLSerializer().serializeToString(dom) : xml;
}

async function prepare(file: File): Promise<Blob> {
  const zip = await JSZip.loadAsync(file);
  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = await zip.file(name)!.async('string');
    const marked = markXml(xml);
    if (marked !== xml) {
      zip.file(name, marked);
      changed = true;
    }
  }
  return changed ? zip.generateAsync({ type: 'blob' }) : file;
}

// after the pages are laid out: real page numbers, and repeating header rows found
function fillMarks(pages: HTMLElement[]) {
  pages.forEach((page, i) => {
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (/[\ue000\ue001]/.test(node.data)) node.data = node.data.replaceAll(PAGE, String(i + 1)).replaceAll(PAGES_TOTAL, String(pages.length));
    }
  });
}

function findHeaderRows(body: HTMLElement) {
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.data.includes(HEADER_ROW)) continue;
    node.data = node.data.replaceAll(HEADER_ROW, '');
    node.parentElement?.closest('tr')?.setAttribute('data-repeat', '');
  }
}

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
.w2p .docx-wrapper > section.docx { margin: 0 0 40px; box-shadow: none; }
.w2p * { hyphens: manual !important; font-kerning: none !important; font-variant-ligatures: none !important; }
.w2p .w2p-marked::before { content: none !important; }
`;

export async function wordToPdf(file: File, onProgress: (message: string) => void = () => {}): Promise<WordPdf> {
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
    const doc = await parseAsync(await prepare(file), options);
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

    findHeaderRows(body);
    materializeMarkers(body);
    // docx-preview measures tab stops half a second after drawing
    if (body.querySelector('.docx-tab-stop')) await sleep(650);
    paginate(body);
    const pageEls = [...body.querySelectorAll<HTMLElement>('section.docx')];
    fillMarks(pageEls);

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(doc.corePropsPart?.props?.title || file.name.replace(/\.docx$/i, ''));
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
    return { bytes: await pdf.save(), pages, missingText: painter.missing > 0, skipped: painter.skipped };
  } finally {
    host.remove();
    for (const face of faces) document.fonts.delete(face);
  }
}

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
// paragraph as text, sized to the hanging indent like word's tab after the number
function materializeMarkers(body: HTMLElement) {
  const counters = new Map<string, number>();
  const apply = (value: string, how: 'reset' | 'set' | 'increment') => {
    for (const [name, n] of readCounters(value)) {
      if (how === 'increment') counters.set(name, (counters.get(name) ?? 0) + (n ?? 1));
      else counters.set(name, n ?? 0);
    }
  };
  const wrapper = body.querySelector('.docx-wrapper');
  if (wrapper) apply(getComputedStyle(wrapper).counterReset, 'reset');

  for (const p of body.querySelectorAll<HTMLElement>('p')) {
    const own = getComputedStyle(p);
    apply(own.counterReset, 'reset');
    apply(own.counterIncrement, 'increment');
    apply(own.counterSet, 'set');
    const before = getComputedStyle(p, '::before');
    if (before.content === 'none' || before.content === 'normal') continue;
    apply(before.counterReset, 'reset');
    apply(before.counterIncrement, 'increment');
    apply(before.counterSet, 'set');

    const text = plainBullets(evaluateContent(before.content, counters)).replace(/[\t\n]/g, '');
    if (!text.trim()) continue;
    // numbers use the text's font unless the list sets one, like word. symbol bullets too, the stand-in has a real •
    const runText = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let run: HTMLElement | null = null;
    for (let node = runText.nextNode(); node && !run; node = runText.nextNode()) if (node.textContent?.trim()) run = node.parentElement;
    const base = run ? getComputedStyle(run) : own;
    const family = isSymbolFont(firstFamily(before.fontFamily)) || before.fontFamily === own.fontFamily ? base.fontFamily : before.fontFamily;
    const size = before.fontSize === own.fontSize ? base.fontSize : before.fontSize;

    const marker = document.createElement('span');
    marker.textContent = text;
    const indent = parseFloat(own.textIndent) || 0;
    // text-indent is inherited, and would push the number out of its own box
    marker.style.cssText = `display:inline-block;white-space:pre;text-indent:0;font-size:${size};font-weight:${before.fontWeight};font-style:${before.fontStyle};color:${before.color}`;
    marker.style.fontFamily = family;
    if (indent < 0) marker.style.minWidth = `${-indent}px`;
    else marker.textContent += '\u00a0';
    p.prepend(marker);
    p.classList.add('w2p-marked');
  }
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
  // the rest of a paragraph has no first-line indent, number or space above
  tail.style.textIndent = '0px';
  tail.style.marginTop = '0px';
  tail.classList.add('w2p-marked');
  p.after(tail);
  return tail;
}

function splitTable(table: HTMLTableElement, limit: number): HTMLElement {
  const rows = [...table.rows];
  const index = rows.findIndex((row) => row.getBoundingClientRect().bottom > limit + 0.5);
  // header rows marked to repeat start the table again on the next page
  const head: HTMLTableRowElement[] = [];
  for (const row of rows) {
    if (!row.hasAttribute('data-repeat')) break;
    head.push(row);
  }
  if (index <= head.length) return table;
  const tail = table.cloneNode(false) as HTMLTableElement;
  const cols = table.querySelector(':scope > colgroup');
  if (cols) tail.append(cols.cloneNode(true));
  for (const row of [...head.map((r) => r.cloneNode(true) as HTMLTableRowElement), ...rows.slice(index)]) {
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

function moveToNewPage(page: HTMLElement, from: HTMLElement) {
  const next = page.cloneNode(false) as HTMLElement;
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
  private fonts = new Map<string, Promise<PDFFont>>();
  private images = new Map<string, Promise<PDFImage | null>>();
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

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
        // shapes aren't drawn yet, and their insides aren't page text
        if (node instanceof SVGElement) {
          if (node.getBoundingClientRect().width > 0) this.skipped++;
          return NodeFilter.FILTER_REJECT;
        }
        const cs = getComputedStyle(node as Element);
        return cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    await this.element(el, el);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) await this.text(node as Text);
      else await this.element(node as HTMLElement, el);
    }
    this.links(el);
    return { width: box.width * PT, height: height * PT };
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
    const r = img.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || !img.src) return;
    let embedded = this.images.get(img.src);
    if (!embedded) {
      embedded = embedImage(this.pdf, img);
      this.images.set(img.src, embedded);
    }
    const image = await embedded;
    if (!image) {
      this.skipped++;
      return;
    }
    this.out.drawImage(image, { x: this.x(r.left), y: this.y(r.bottom), width: r.width * PT, height: r.height * PT });
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

// png and jpeg go in as they are, anything else the browser can show is redrawn as png
async function embedImage(pdf: PDFDocument, img: HTMLImageElement): Promise<PDFImage | null> {
  try {
    const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch {
    // falls through to redrawing it
  }
  try {
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
