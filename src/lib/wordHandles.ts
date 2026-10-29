// pictures and tables on the pages being edited, like google docs. a tap on a picture selects it: the handles round it
// resize it, dragging it moves it to another spot in the text, and backspace or remove takes it out. a table's lines
// drag to change its column widths and row heights, and touch screens get knobs on them to hold

const EDITABLE = '[contenteditable="true"]';
const BLUE = '#1a73e8';
// the smallest a picture, column or row gets, in css px
const MIN = 16;

const coarse = () => window.matchMedia('(pointer: coarse)').matches;
// on screen: the dot people see, and the bigger area round it they can grab
const DOT = { touch: 16, mouse: 10 };
const GRAB = { touch: 30, mouse: 16 };
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
const elementOf = (node: Node) => (node instanceof Element ? node : node.parentElement);

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement) {
  const el = document.createElement(tag);
  el.className = className;
  parent?.append(el);
  return el;
}

// docx-preview puts word's pictures in a box of their own, which goes wherever the picture goes
function unitOf(img: HTMLElement) {
  const box = img.parentElement;
  return box?.tagName === 'DIV' && box.childElementCount === 1 && !box.textContent?.trim() && !box.matches(EDITABLE) ? box : img;
}

function sizeTo(img: HTMLElement, width: number, height: number) {
  Object.assign(img.style, { width: `${width}px`, height: `${height}px`, maxWidth: 'none', maxHeight: 'none' });
  const box = unitOf(img);
  // except the zero sized box docx-preview floats pictures out of
  if (box !== img && parseFloat(box.style.width) > 0) Object.assign(box.style, { width: `${width}px`, height: `${height}px` });
}

// the spot in the text under a point on screen
function caretAt(x: number, y: number) {
  if (typeof document.caretPositionFromPoint === 'function') {
    const spot = document.caretPositionFromPoint(x, y);
    if (!spot) return null;
    const range = document.createRange();
    range.setStart(spot.offsetNode, spot.offset);
    return range;
  }
  return document.caretRangeFromPoint(x, y);
}

// follows one pointer until it lets go, wherever it goes
function track(start: PointerEvent, move: (e: PointerEvent) => void, done: (cancelled: boolean) => void) {
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== start.pointerId) return;
    e.preventDefault();
    move(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== start.pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    done(e.type === 'pointercancel');
  };
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// a table's column edges on screen, from its cells. null when merged cells hide one of its columns
function edgesOf(table: HTMLTableElement) {
  const xs: number[] = [];
  for (const row of table.rows) {
    for (const cell of row.cells) {
      const r = cell.getBoundingClientRect();
      xs.push(r.left, r.right);
    }
  }
  xs.sort((a, b) => a - b);
  const edges: number[] = [];
  for (const x of xs) if (!edges.length || x - edges[edges.length - 1] > 2) edges.push(x);
  const columns = table.querySelector(':scope > colgroup')?.children.length;
  return edges.length > 1 && (!columns || columns === edges.length - 1) ? edges : null;
}

type Line = { table: HTMLTableElement; column: number } | { row: HTMLTableRowElement };

// everything here is drawn over the pages inside host, in its own unzoomed px, and changed hears about every edit
export function attachHandles(host: HTMLElement, changed: () => void) {
  const layer = make('div', 'w2p-handles absolute left-0 top-0 z-10', host);
  // the editor zooms the pages, so sizes meant for the screen are divided by this
  const scale = () => host.getBoundingClientRect().width / host.offsetWidth || 1;
  const local = (r: DOMRect, s = scale()) => {
    const h = host.getBoundingClientRect();
    return { left: (r.left - h.left) / s, top: (r.top - h.top) / s, width: r.width / s, height: r.height / s };
  };
  const scroller = () => host.parentElement?.closest<HTMLElement>('.overflow-auto') ?? null;

  // the selected picture: a frame to drag, handles to resize, and a button to take it out
  let picked: HTMLImageElement | null = null;
  // where the cursor waits while a picture is picked
  let waiting: { node: Node; offset: number } | null = null;
  const frame = make('div', 'absolute cursor-move touch-none');
  const grips = [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1, 0.5],
    [1, 1],
    [0.5, 1],
    [0, 1],
    [0, 0.5],
  ].map(([x, y]) => {
    const grip = make('div', 'absolute grid place-items-center touch-none', frame);
    const dot = make('div', 'rounded-full bg-white', grip);
    Object.assign(grip.style, {
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      transform: 'translate(-50%, -50%)',
      cursor: x === 0.5 ? 'ns-resize' : y === 0.5 ? 'ew-resize' : x === y ? 'nwse-resize' : 'nesw-resize',
    });
    grip.addEventListener('pointerdown', (e) => resize(e, x * 2 - 1, y * 2 - 1));
    return { grip, dot, side: x === 0.5 || y === 0.5 };
  });
  const bin = make('button', 'absolute left-1/2 cursor-pointer whitespace-nowrap rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-medium text-canvas shadow-lg', frame);
  bin.type = 'button';
  bin.textContent = 'Remove';
  bin.style.transformOrigin = 'bottom center';
  // keeps the cursor and the keyboard where they are
  bin.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  bin.addEventListener('click', () => remove());
  // where a dragged picture will land
  const line = make('div', 'pointer-events-none absolute');
  line.style.background = BLUE;

  const place = () => {
    if (!picked) return;
    if (!picked.isConnected || !host.contains(picked)) return unpick();
    const s = scale();
    const b = local(picked.getBoundingClientRect(), s);
    Object.assign(frame.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`, outline: `${2 / s}px solid ${BLUE}` });
    const kind = coarse() ? 'touch' : 'mouse';
    // a small picture keeps its corners, so there's still room to grab it and move it
    const small = Math.min(b.width, b.height) * s < GRAB[kind] * 3;
    for (const { grip, dot, side } of grips) {
      Object.assign(grip.style, { width: `${GRAB[kind] / s}px`, height: `${GRAB[kind] / s}px`, display: side && small ? 'none' : '' });
      Object.assign(dot.style, { width: `${DOT[kind] / s}px`, height: `${DOT[kind] / s}px`, border: `${2 / s}px solid ${BLUE}` });
    }
    Object.assign(bin.style, { bottom: `calc(100% + ${12 / s}px)`, transform: `translateX(-50%) scale(${1 / s})` });
  };

  const pick = (img: HTMLImageElement, focus: boolean) => {
    picked = img;
    layer.append(frame);
    place();
    // the cursor waits just after it, so the toolbar's alignment works on its line and typing goes after it.
    // selecting it like text would tint it blue
    if (focus) img.closest<HTMLElement>(EDITABLE)?.focus({ preventScroll: true });
    const after = document.createRange();
    after.setStartAfter(unitOf(img));
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(after);
    // as the browser keeps it, which can differ from what was asked for
    const kept = selection?.rangeCount ? selection.getRangeAt(0) : after;
    waiting = { node: kept.startContainer, offset: kept.startOffset };
  };

  const unpick = () => {
    picked = null;
    waiting = null;
    frame.remove();
  };

  const remove = () => {
    if (!picked) return;
    const unit = unitOf(picked);
    unpick();
    const range = document.createRange();
    range.selectNode(unit);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    // so undo brings it back
    document.execCommand('delete');
    if (unit.isConnected) {
      unit.remove();
      changed();
    }
  };

  // corners keep the picture's shape, sides stretch it
  const resize = (start: PointerEvent, dx: number, dy: number) => {
    const img = picked;
    if (!img) return;
    start.preventDefault();
    start.stopPropagation();
    const s = scale();
    const from = img.getBoundingClientRect();
    const w0 = from.width / s;
    const h0 = from.height / s;
    const maxW = Math.max(w0, img.closest('article')?.clientWidth ?? w0);
    const maxH = Math.max(h0, (img.closest('section.docx')?.clientHeight ?? h0) * 0.9);
    track(
      start,
      (e) => {
        const w = w0 + ((e.clientX - start.clientX) / s) * dx;
        const h = h0 + ((e.clientY - start.clientY) / s) * dy;
        if (dx && dy) {
          const k = clamp(Math.max(w / w0, h / h0), MIN / Math.min(w0, h0), Math.min(maxW / w0, maxH / h0));
          sizeTo(img, w0 * k, h0 * k);
        } else sizeTo(img, clamp(w, MIN, maxW), clamp(h, MIN, maxH));
        place();
      },
      () => changed(),
    );
  };

  // a spot in the editable text, outside the picture being moved
  const dropSpot = (x: number, y: number, img: HTMLImageElement) => {
    const spot = caretAt(x, y);
    const el = spot && elementOf(spot.startContainer);
    if (!spot || !el?.closest(EDITABLE) || !host.contains(el) || unitOf(img).contains(el) || el.closest('.w2p-marker')) return null;
    return spot;
  };

  const showLine = (spot: Range | null) => {
    if (!spot) return void (line.style.display = 'none');
    const r = spot.getClientRects()[0] ?? elementOf(spot.startContainer)!.getBoundingClientRect();
    const s = scale();
    const b = local(r, s);
    Object.assign(line.style, { display: '', left: `${b.left}px`, top: `${b.top}px`, width: `${2 / s}px`, height: `${Math.max(b.height, 14 / s)}px` });
  };

  // dragging near the top or bottom of the editor scrolls it, so a picture can go to another page
  const autoscroll = (y: number) => {
    const box = scroller();
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (y < r.top + 48) box.scrollTop -= 20;
    else if (y > r.bottom - 48) box.scrollTop += 20;
  };

  // pictures move within the text, like google docs puts a picture in line with it
  const move = (start: PointerEvent) => {
    const img = picked;
    if (!img) return;
    let moving = false;
    let spot: Range | null = null;
    const opacity = img.style.opacity;
    track(
      start,
      (e) => {
        if (!moving && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < 6) return;
        if (!moving) {
          moving = true;
          frame.style.display = 'none';
          img.style.opacity = '0.4';
          layer.append(line);
        }
        autoscroll(e.clientY);
        spot = dropSpot(e.clientX, e.clientY, img);
        showLine(spot);
      },
      (cancelled) => {
        line.remove();
        img.style.opacity = opacity;
        frame.style.display = '';
        if (moving && spot && !cancelled) {
          const unit = unitOf(img);
          spot.insertNode(img);
          if (unit !== img) unit.remove();
          // in the line with the text, where the page's own css would put it on a line of its own
          img.style.display = 'inline-block';
          pick(img, false);
          changed();
        }
        place();
      },
    );
  };

  frame.addEventListener('pointerdown', (e) => {
    if (e.target !== frame) return;
    e.preventDefault();
    move(e);
  });

  // table lines: under the mouse they change the cursor, on touch screens knobs show for the table the cursor is in
  let hover: Line | null = null;
  let knobTable: HTMLTableElement | null = null;
  const knobs = make('div', '', layer);

  const dragColumn = (start: PointerEvent, table: HTMLTableElement, column: number) => {
    const edges = edgesOf(table);
    if (!edges) return;
    const s = scale();
    const widths = edges.slice(1).map((x, i) => (x - edges[i]) / s);
    const total = widths.reduce((a, b) => a + b, 0);
    let group = table.querySelector<HTMLElement>(':scope > colgroup');
    if (!group) {
      group = document.createElement('colgroup');
      group.append(...widths.map(() => document.createElement('col')));
      table.prepend(group);
    }
    const cols = [...group.children] as HTMLElement[];
    // fixed widths from here on, so the columns stay where they're put
    const apply = (next: number[]) => {
      next.forEach((w, i) => (cols[i].style.width = `${w}px`));
      Object.assign(table.style, { width: `${next.reduce((a, b) => a + b, 0)}px`, tableLayout: 'fixed' });
    };
    apply(widths);
    const page = table.closest('section.docx');
    // the last line can go out as far as the page's edge
    const room = page ? (page.getBoundingClientRect().right - edges[0]) / s : Infinity;
    track(
      start,
      (e) => {
        const dx = (e.clientX - start.clientX) / s;
        const next = [...widths];
        if (column < widths.length) {
          const pair = widths[column - 1] + widths[column];
          next[column - 1] = clamp(widths[column - 1] + dx, MIN, pair - MIN);
          next[column] = pair - next[column - 1];
        } else next[column - 1] = clamp(widths[column - 1] + dx, MIN, Math.max(MIN, room - (total - widths[column - 1])));
        apply(next);
        placeKnobs();
      },
      () => changed(),
    );
  };

  // a row is never shorter than its text, so this only sets how tall it is at least
  const dragRow = (start: PointerEvent, row: HTMLTableRowElement) => {
    const s = scale();
    const h0 = row.getBoundingClientRect().height / s;
    track(
      start,
      (e) => {
        row.style.height = `${Math.max(MIN / 2, h0 + (e.clientY - start.clientY) / s)}px`;
        placeKnobs();
      },
      () => changed(),
    );
  };

  // the lines are cell edges, so a pointer just past a table's edge looks for the cell beside it
  const cellAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLTableCellElement>('td, th') ?? null;
  const lineAt = (e: PointerEvent): Line | null => {
    const cell = (e.target as Element).closest?.<HTMLTableCellElement>('td, th') ?? cellAt(e.clientX - 4, e.clientY) ?? cellAt(e.clientX, e.clientY - 4);
    if (!cell?.closest(EDITABLE) || !host.contains(cell)) return null;
    const table = cell.closest('table')!;
    const r = cell.getBoundingClientRect();
    if (Math.abs(e.clientX - r.right) <= 4 || Math.abs(e.clientX - r.left) <= 4) {
      const edges = edgesOf(table);
      const column = edges ? edges.findIndex((x, i) => i > 0 && Math.abs(e.clientX - x) <= 4) : -1;
      if (column > 0) return { table, column };
    }
    if (Math.abs(e.clientY - r.bottom) <= 4 || Math.abs(e.clientY - r.top) <= 4) {
      const row = [...table.rows].find((tr) => Math.abs(tr.getBoundingClientRect().bottom - e.clientY) <= 4);
      if (row) return { row };
    }
    return null;
  };

  const placeKnobs = () => {
    knobs.replaceChildren();
    const table = knobTable;
    if (!table?.isConnected || !coarse()) return;
    const s = scale();
    const grab = GRAB.touch / s;
    const size = DOT.touch / s;
    const t = local(table.getBoundingClientRect(), s);
    const knob = (x: number, y: number, label: string, onDown: (e: PointerEvent) => void) => {
      const el = make('div', 'absolute grid place-items-center touch-none', knobs);
      el.setAttribute('aria-label', label);
      Object.assign(el.style, { left: `${x - grab / 2}px`, top: `${y - grab / 2}px`, width: `${grab}px`, height: `${grab}px` });
      const dot = make('div', 'rounded-full bg-white', el);
      Object.assign(dot.style, { width: `${size}px`, height: `${size}px`, border: `${2 / s}px solid ${BLUE}`, boxShadow: `0 ${1 / s}px ${4 / s}px rgba(0,0,0,.25)` });
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown(e);
      });
    };
    edgesOf(table)?.forEach((x, column) => {
      if (column > 0) knob(local(new DOMRect(x, 0, 0, 0), s).left, t.top - size, 'Drag to change the column’s width', (e) => dragColumn(e, table, column));
    });
    for (const row of table.rows) {
      const r = local(row.getBoundingClientRect(), s);
      knob(t.left - size, r.top + r.height, 'Drag to change the row’s height', (e) => dragRow(e, row));
    }
  };

  const refresh = () => {
    place();
    placeKnobs();
  };

  const onDown = (e: PointerEvent) => {
    const target = e.target as Element;
    if (layer.contains(target)) return;
    const img = target.closest?.('img');
    if (img instanceof HTMLImageElement && img.closest(EDITABLE) && host.contains(img)) {
      // no cursor in the text and no browser drag, the picture is picked up instead, and pressing and dragging moves it
      e.preventDefault();
      pick(img, e.pointerType === 'mouse');
      return move(e);
    }
    if (picked) unpick();
    if (hover && e.pointerType === 'mouse') {
      e.preventDefault();
      if ('column' in hover) dragColumn(e, hover.table, hover.column);
      else dragRow(e, hover.row);
    }
  };

  const onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    hover = lineAt(e);
    host.classList.toggle('w2p-col-resize', !!hover && 'column' in hover);
    host.classList.toggle('w2p-row-resize', !!hover && 'row' in hover);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!picked) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      remove();
    } else if (e.key === 'Escape') {
      const after = document.createRange();
      after.setStartAfter(unitOf(picked));
      unpick();
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(after);
    }
  };

  const onSelection = () => {
    const selection = getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    // the cursor moved on from the picture
    if (picked && (!range || !range.collapsed || range.startContainer !== waiting?.node || range.startOffset !== waiting.offset)) unpick();
    const el = range && elementOf(range.startContainer);
    const table = el?.closest('td, th')?.closest('table') ?? null;
    knobTable = table?.closest(EDITABLE) && host.contains(table) ? table : null;
    placeKnobs();
  };

  host.addEventListener('pointerdown', onDown, true);
  host.addEventListener('pointermove', onHover);
  host.addEventListener('keydown', onKey);
  host.addEventListener('input', refresh);
  document.addEventListener('selectionchange', onSelection);
  window.addEventListener('resize', refresh);

  return {
    // after anything that moves the pages around without typing, like zooming
    refresh,
    detach() {
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('pointermove', onHover);
      host.removeEventListener('keydown', onKey);
      host.removeEventListener('input', refresh);
      document.removeEventListener('selectionchange', onSelection);
      window.removeEventListener('resize', refresh);
      host.classList.remove('w2p-col-resize', 'w2p-row-resize');
      layer.remove();
      picked = null;
    },
  };
}
