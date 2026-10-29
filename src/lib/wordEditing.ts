// only the type, the layout engine itself stays in its own lazily loaded chunk
import type { WordLayout } from '@/lib/wordToPdf';

// the word to pdf editor's formatting, applied to whatever is selected in the pages

const firstFamily = (list: string) => (list.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');

// the keys word and google docs use for a new page
export const NEW_PAGE_KEYS = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘+Enter' : 'Ctrl+Enter';
export const hasKeyboard = () => window.matchMedia('(pointer: fine)').matches;

export type Align = 'left' | 'center' | 'right' | 'justify';
export type ListKind = 'bullet' | 'number';
export type Block = 'normal' | 'title' | 'h1' | 'h2' | 'h3';

export const BLOCKS: { id: Block; label: string; size?: number; bold?: boolean }[] = [
  { id: 'normal', label: 'Normal text' },
  { id: 'title', label: 'Title', size: 26 },
  { id: 'h1', label: 'Heading 1', size: 20, bold: true },
  { id: 'h2', label: 'Heading 2', size: 16, bold: true },
  { id: 'h3', label: 'Heading 3', size: 14, bold: true },
];

export type Formatting = {
  block: Block;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  align: Align;
  list: ListKind | null;
  spacing: number;
  link: string | null;
};

const elementOf = (node: Node) => (node instanceof Element ? node : node.parentElement)!;
const editable = (node: Node) => !!elementOf(node)?.closest('[contenteditable="true"]');

// the selection, when it's in the text being edited
export function pagesSelection(layout: WordLayout): Range | null {
  const selection = getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return layout.contains(range.commonAncestorContainer) && editable(range.startContainer) ? range : null;
}

function select(start: Node, startOffset: number, end = start, endOffset = startOffset) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}

// paragraphs the selection touches
export function selectedParagraphs(range: Range): HTMLElement[] {
  const root = elementOf(range.commonAncestorContainer);
  const own = root.closest<HTMLElement>('p');
  if (own) return editable(own) ? [own] : [];
  return [...root.querySelectorAll<HTMLElement>('p')].filter((p) => range.intersectsNode(p) && editable(p));
}

function wordAt(range: Range) {
  const node = range.startContainer;
  if (!(node instanceof Text)) return null;
  let start = range.startOffset;
  let end = start;
  while (start > 0 && /\S/.test(node.data[start - 1])) start--;
  while (end < node.length && /\S/.test(node.data[end])) end++;
  if (start === end) return null;
  const word = document.createRange();
  word.setStart(node, start);
  word.setEnd(node, end);
  return word;
}

// the selected stretch of each text node, list numbers left out
function textsIn(range: Range) {
  const root = range.commonAncestorContainer;
  const found: { node: Text; start: number; end: number }[] = [];
  const consider = (node: Text) => {
    if (!range.intersectsNode(node) || !editable(node) || node.parentElement?.closest('.w2p-marker')) return;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end > start) found.push({ node, start, end });
  };
  if (root instanceof Text) consider(root);
  else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) consider(node as Text);
  }
  return found;
}

// gives the selected text an inline style. a cursor in a word styles that word, in an empty paragraph the paragraph
export function styleText(range: Range, css: Record<string, string>) {
  let target = range;
  let caret: number | null = null;
  if (range.collapsed) {
    const word = wordAt(range);
    if (!word) {
      const p = elementOf(range.startContainer).closest<HTMLElement>('p');
      if (p && editable(p)) for (const [name, value] of Object.entries(css)) p.style.setProperty(name, value);
      return;
    }
    caret = range.startOffset - word.startOffset;
    target = word;
  }
  const styled: Text[] = [];
  for (const { node, start, end } of textsIn(target)) {
    let text = node;
    if (end < text.length) text.splitText(end);
    if (start > 0) text = text.splitText(start);
    const parent = text.parentElement!;
    // a span holding just this text takes the style itself, so spans don't pile up
    let box = parent;
    if (parent.tagName !== 'SPAN' || parent.childNodes.length > 1 || parent.classList.contains('w2p-marker')) {
      box = document.createElement('span');
      text.replaceWith(box);
      box.append(text);
    }
    for (const [name, value] of Object.entries(css)) box.style.setProperty(name, value);
    styled.push(text);
  }
  if (!styled.length) return;
  const last = styled[styled.length - 1];
  if (caret !== null) select(styled[0], Math.min(caret, styled[0].length));
  else select(styled[0], 0, last, last.length);
}

export function toggle(command: 'bold' | 'italic' | 'underline' | 'strikeThrough') {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(command);
}

export function clearFormatting() {
  document.execCommand('removeFormat');
}

export function align(range: Range, value: Align) {
  for (const p of selectedParagraphs(range)) p.style.textAlign = value;
}

export function lineSpacing(range: Range, value: number) {
  for (const p of selectedParagraphs(range)) p.style.lineHeight = String(value);
}

export function indent(range: Range, step: 1 | -1) {
  for (const p of selectedParagraphs(range)) {
    const now = parseFloat(getComputedStyle(p).marginLeft) || 0;
    p.style.marginLeft = `${Math.max(0, now + step * 48)}px`;
  }
}

const wordList = (p: HTMLElement) => [...p.classList].some((c) => c.startsWith('docx-num-'));

export function listOf(p: HTMLElement | null): ListKind | null {
  if (!p) return null;
  if (p.dataset.list) return p.dataset.list as ListKind;
  if (!wordList(p)) return null;
  const marker = p.querySelector(':scope > .w2p-marker')?.textContent?.trim() ?? '';
  return /\d/.test(marker) || /^[a-z]{1,4}[.)]$/i.test(marker) ? 'number' : 'bullet';
}

let lists = 0;

// turns the paragraphs into a list, or back into plain paragraphs if they already are that kind of list
export function toggleList(range: Range, kind: ListKind) {
  const paragraphs = selectedParagraphs(range);
  if (!paragraphs.length) return;
  const off = paragraphs.every((p) => listOf(p) === kind);
  // straight after an item of the same list, the numbers carry on
  const prev = paragraphs[0].previousElementSibling as HTMLElement | null;
  const id = prev?.dataset.list === kind && prev.dataset.listId ? prev.dataset.listId : `list-${Date.now()}-${lists++}`;
  for (const p of paragraphs) {
    for (const c of [...p.classList]) if (c.startsWith('docx-num-')) p.classList.remove(c);
    if (off) {
      delete p.dataset.list;
      delete p.dataset.listId;
      p.style.marginLeft = '';
      p.style.textIndent = '';
    } else {
      p.dataset.list = kind;
      p.dataset.listId = id;
      p.style.marginLeft = '48px';
      p.style.textIndent = '-24px';
    }
  }
}

const blockOf = (p: HTMLElement | null): Block => {
  if (p?.dataset.block) return p.dataset.block as Block;
  const word = p?.className.match(/docx_(title|heading([1-3]))\b/);
  return word ? (word[2] ? (`h${word[2]}` as Block) : 'title') : 'normal';
};

export function setBlock(range: Range, block: Block, normalSize: number) {
  const style = BLOCKS.find((b) => b.id === block)!;
  const css = { 'font-size': `${style.size ?? normalSize}pt`, 'font-weight': style.bold ? '700' : '400' };
  const paragraphs = selectedParagraphs(range);
  for (const p of paragraphs) {
    const all = document.createRange();
    all.selectNodeContents(p);
    styleText(all, css);
    // the paragraph too, so it holds when it's empty
    p.style.fontSize = css['font-size'];
    if (block === 'normal') delete p.dataset.block;
    else p.dataset.block = block;
  }
  if (paragraphs.length) {
    const last = paragraphs[paragraphs.length - 1];
    select(last, last.childNodes.length);
  }
}

// a bare address gets https:// or mailto:
export const normaliseLink = (url: string) =>
  /^(https?:|mailto:)/i.test(url) ? url : /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(url) ? `mailto:${url}` : `https://${url}`;

export function setLink(range: Range, url: string) {
  const href = normaliseLink(url.trim());
  const existing = elementOf(range.startContainer).closest('a');
  if (existing) {
    existing.setAttribute('href', href);
    return;
  }
  let target = range.collapsed ? wordAt(range) : range;
  if (!target) {
    // nothing to link, so the address goes in as the link's text
    const text = document.createTextNode(url.trim());
    range.insertNode(text);
    target = document.createRange();
    target.selectNode(text);
  }
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(target);
  document.execCommand('createLink', false, href);
  // links look like links, the document's css would otherwise hide that
  for (const a of elementOf(target.commonAncestorContainer).closest('p')?.querySelectorAll<HTMLAnchorElement>(`a[href="${CSS.escape(href)}"]`) ?? []) {
    a.style.color = '#1155cc';
    a.style.textDecoration = 'underline';
  }
}

export function removeLink(range: Range) {
  const link = elementOf(range.startContainer).closest('a');
  if (link) link.replaceWith(...link.childNodes);
}

// a picture at the cursor, no wider than the text and short enough to fit a page
export async function insertImage(range: Range, file: File) {
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  // in the line with the text like google docs, not on a line of its own as the page's css would have it
  img.style.cssText = 'display:inline-block;max-width:100%;max-height:640px;width:auto;height:auto;vertical-align:bottom';
  range.deleteContents();
  range.insertNode(img);
  const after = document.createRange();
  after.setStartAfter(img);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(after);
}

export function formattingAt(range: Range): Formatting {
  const el = elementOf(range.startContainer);
  const cs = getComputedStyle(el);
  const p = el.closest<HTMLElement>('p');
  const ps = p ? getComputedStyle(p) : cs;
  const textAlign = ps.textAlign;
  const lineHeight = parseFloat(ps.lineHeight);
  return {
    block: blockOf(p),
    font: firstFamily(cs.fontFamily),
    size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2,
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strike: document.queryCommandState('strikeThrough'),
    align: textAlign === 'center' ? 'center' : textAlign === 'right' || textAlign === 'end' ? 'right' : textAlign === 'justify' ? 'justify' : 'left',
    list: listOf(p),
    spacing: Number.isNaN(lineHeight) ? 1.15 : Math.round((lineHeight / parseFloat(ps.fontSize)) * 100) / 100,
    link: el.closest('a[href]')?.getAttribute('href') ?? null,
  };
}
