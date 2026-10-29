import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Check,
  ChevronDown,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Plus,
  RemoveFormatting,
  Strikethrough,
  Underline,
  UnfoldVertical,
} from 'lucide-react';
import { Button } from '@/components/toolkit';
import { cn } from '@/lib/utils';
import {
  align,
  BLOCKS,
  clearFormatting,
  formattingAt,
  indent,
  insertImage,
  lineSpacing,
  pagesSelection,
  removeLink,
  setBlock,
  setLink,
  styleText,
  toggle,
  toggleList,
  type Align,
  type Formatting,
} from '@/lib/wordEditing';
import type { WordLayout } from '@/lib/wordToPdf';

type Menu = 'block' | 'font' | 'color' | 'highlight' | 'align' | 'spacing' | 'link';

const COLORS = ['#000000', '#434343', '#777777', '#b7b7b7', '#e53935', '#fb8c00', '#f9a825', '#43a047', '#00897b', '#1e88e5', '#185abd', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41', '#ffffff'];
const HIGHLIGHTS = ['#fff59d', '#ffe0b2', '#ffcdd2', '#f8bbd0', '#e1bee7', '#c5cae9', '#bbdefb', '#b2ebf2', '#c8e6c9', '#f0f4c3'];
const ALIGNS: { id: Align; label: string; icon: typeof AlignLeft }[] = [
  { id: 'left', label: 'Align left', icon: AlignLeft },
  { id: 'center', label: 'Align centre', icon: AlignCenter },
  { id: 'right', label: 'Align right', icon: AlignRight },
  { id: 'justify', label: 'Justify', icon: AlignJustify },
];
const SPACINGS = [
  { value: 1, label: 'Single' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: 'Double' },
];

// tapping a tool mustn't take the cursor out of the text, or phones close the keyboard
const keepCursor = (e: React.PointerEvent) => e.preventDefault();

function Tool({ label, active, menu, onClick, children, className }: { label: string; active?: boolean; menu?: boolean; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // a menu's own button opens and closes it, a tap anywhere else just closes it
      data-menu={menu ? '' : undefined}
      onPointerDown={keepCursor}
      onClick={onClick}
      className={cn(
        'flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-[10px] px-1.5 text-[14px] text-ink/75 transition-colors hover:bg-subtle hover:text-ink',
        active && 'bg-ink/[0.08] text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />;

// the formatting bar above the pages, like google docs. tools act on the selection, or the word the cursor is in
export default function WordToolbar({ layout, onTip }: { layout: WordLayout; onTip: (message: string) => void }) {
  const [state, setState] = useState<Formatting | null>(null);
  const [menu, setMenu] = useState<{ kind: Menu; left: number; top: number } | null>(null);
  const [size, setSize] = useState('');
  const [link, setLinkText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // keeps the buttons showing what's at the cursor
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const range = pagesSelection(layout);
        if (range) setState(formattingAt(range));
      });
    };
    document.addEventListener('selectionchange', update);
    document.addEventListener('input', update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('input', update);
    };
  }, [layout]);

  useEffect(() => setSize(state ? String(state.size) : ''), [state?.size]);

  // a tap outside a menu closes it
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-menu]') && setMenu(null);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu]);

  // runs on the selection, or where the cursor last was in the pages
  const run = (command: (range: Range) => void) => {
    const range = pagesSelection(layout) ?? layout.restoreCaret();
    if (!range) return onTip('Tap in the text first, then choose a format.');
    command(range);
    layout.touched();
    const after = pagesSelection(layout);
    if (after) setState(formattingAt(after));
  };

  const open = (kind: Menu, e: React.MouseEvent<HTMLButtonElement>) => {
    if (menu?.kind === kind) return setMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const width = kind === 'link' ? 300 : kind === 'font' || kind === 'block' ? 220 : 200;
    setMenu({ kind, left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), top: rect.bottom + 6 });
    if (kind === 'link') setLinkText(state?.link ?? '');
  };
  const choose = (command: (range: Range) => void) => {
    run(command);
    setMenu(null);
  };

  const applySize = (value: number) => {
    if (!Number.isFinite(value) || value < 1) return setSize(state ? String(state.size) : '');
    run((range) => styleText(range, { 'font-size': `${Math.min(400, value)}pt` }));
  };

  const addImage = async (file?: File) => {
    if (!file) return;
    const range = pagesSelection(layout) ?? layout.restoreCaret();
    if (!range) return onTip('Tap in the text where the picture should go, then try again.');
    await insertImage(range, file);
    layout.touched();
  };

  const current: Formatting = state ?? { block: 'normal', font: '', size: 11, bold: false, italic: false, underline: false, strike: false, align: 'left', list: null, spacing: 1.15, link: null };
  const AlignIcon = ALIGNS.find((a) => a.id === current.align)?.icon ?? AlignLeft;

  return (
    <>
      <div role="toolbar" aria-label="Formatting" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-canvas px-2 py-1.5 [scrollbar-width:none] lg:justify-center">
        <Tool label="Text style" menu onClick={(e) => open('block', e)} className="w-[118px] justify-between px-2.5" active={menu?.kind === 'block'}>
          <span className="truncate">{BLOCKS.find((b) => b.id === current.block)?.label}</span>
          <ChevronDown size={14} />
        </Tool>
        <Divider />
        <Tool label="Font" menu onClick={(e) => open('font', e)} className="w-[132px] justify-between px-2.5" active={menu?.kind === 'font'}>
          <span className="truncate" style={{ fontFamily: current.font || undefined }}>
            {current.font || 'Font'}
          </span>
          <ChevronDown size={14} />
        </Tool>
        <Divider />
        <Tool label="Smaller text" onClick={() => run((range) => styleText(range, { 'font-size': `${Math.max(1, current.size - 1)}pt` }))}>
          <Minus size={16} />
        </Tool>
        <input
          aria-label="Text size"
          inputMode="decimal"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            applySize(parseFloat(size));
          }}
          onBlur={() => parseFloat(size) !== current.size && applySize(parseFloat(size))}
          className="h-8 w-11 shrink-0 rounded-[8px] border border-line bg-canvas text-center text-[14px] tabular-nums outline-none focus:border-ink"
        />
        <Tool label="Bigger text" onClick={() => run((range) => styleText(range, { 'font-size': `${current.size + 1}pt` }))}>
          <Plus size={16} />
        </Tool>
        <Divider />
        <Tool label="Bold" active={current.bold} onClick={() => run(() => toggle('bold'))}>
          <Bold size={17} />
        </Tool>
        <Tool label="Italic" active={current.italic} onClick={() => run(() => toggle('italic'))}>
          <Italic size={17} />
        </Tool>
        <Tool label="Underline" active={current.underline} onClick={() => run(() => toggle('underline'))}>
          <Underline size={17} />
        </Tool>
        <Tool label="Strikethrough" active={current.strike} onClick={() => run(() => toggle('strikeThrough'))}>
          <Strikethrough size={17} />
        </Tool>
        <Tool label="Text colour" active={menu?.kind === 'color'} menu onClick={(e) => open('color', e)}>
          <Baseline size={18} />
        </Tool>
        <Tool label="Highlight" active={menu?.kind === 'highlight'} menu onClick={(e) => open('highlight', e)}>
          <Highlighter size={17} />
        </Tool>
        <Divider />
        <Tool label="Link" active={!!current.link || menu?.kind === 'link'} menu onClick={(e) => open('link', e)}>
          <Link size={17} />
        </Tool>
        <Tool label="Add a picture" onClick={() => picker.current?.click()}>
          <ImagePlus size={17} />
        </Tool>
        <Divider />
        <Tool label="Alignment" active={menu?.kind === 'align'} menu onClick={(e) => open('align', e)}>
          <AlignIcon size={17} />
          <ChevronDown size={12} />
        </Tool>
        <Tool label="Line spacing" active={menu?.kind === 'spacing'} menu onClick={(e) => open('spacing', e)}>
          <UnfoldVertical size={17} />
        </Tool>
        <Tool label="Bulleted list" active={current.list === 'bullet'} onClick={() => run((range) => toggleList(range, 'bullet'))}>
          <List size={18} />
        </Tool>
        <Tool label="Numbered list" active={current.list === 'number'} onClick={() => run((range) => toggleList(range, 'number'))}>
          <ListOrdered size={18} />
        </Tool>
        <Tool label="Decrease indent" onClick={() => run((range) => indent(range, -1))}>
          <IndentDecrease size={17} />
        </Tool>
        <Tool label="Increase indent" onClick={() => run((range) => indent(range, 1))}>
          <IndentIncrease size={17} />
        </Tool>
        <Divider />
        <Tool label="Clear formatting" onClick={() => run(() => clearFormatting())}>
          <RemoveFormatting size={17} />
        </Tool>
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          addImage(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          style={{ left: menu.left, top: menu.top }}
          className="fixed z-[130] max-h-[60vh] overflow-y-auto rounded-[14px] border border-line bg-card p-1.5 text-ink shadow-[0_18px_44px_-14px_rgba(0,0,0,0.28)]"
        >
          {menu.kind === 'block' &&
            BLOCKS.map((b) => (
              <MenuItem key={b.id} checked={current.block === b.id} onClick={() => choose((range) => setBlock(range, b.id, layout.normalSize))}>
                <span style={{ fontSize: b.size ? Math.min(20, 10 + b.size / 2.4) : 14, fontWeight: b.bold || b.id === 'title' ? 600 : 400 }}>{b.label}</span>
              </MenuItem>
            ))}
          {menu.kind === 'font' &&
            layout.fonts.map((font) => (
              <MenuItem key={font} checked={current.font === font} onClick={() => choose((range) => styleText(range, { 'font-family': `"${font}"` }))}>
                <span style={{ fontFamily: `"${font}"` }}>{font}</span>
              </MenuItem>
            ))}
          {(menu.kind === 'color' || menu.kind === 'highlight') && (
            <div className="w-[188px]">
              <div className="grid grid-cols-5 gap-1.5 p-1">
                {(menu.kind === 'color' ? COLORS : HIGHLIGHTS).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onPointerDown={keepCursor}
                    onClick={() => choose((range) => styleText(range, { [menu.kind === 'color' ? 'color' : 'background-color']: color }))}
                    className="size-8 rounded-full border border-black/10 transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              {menu.kind === 'highlight' && (
                <MenuItem onClick={() => choose((range) => styleText(range, { 'background-color': 'transparent' }))}>No highlight</MenuItem>
              )}
            </div>
          )}
          {menu.kind === 'align' && (
            <div className="flex gap-0.5">
              {ALIGNS.map(({ id, label, icon: Icon }) => (
                <Tool key={id} label={label} active={current.align === id} onClick={() => choose((range) => align(range, id))}>
                  <Icon size={18} />
                </Tool>
              ))}
            </div>
          )}
          {menu.kind === 'spacing' &&
            SPACINGS.map(({ value, label }) => (
              <MenuItem key={value} checked={Math.abs(current.spacing - value) < 0.08} onClick={() => choose((range) => lineSpacing(range, value))}>
                {label}
              </MenuItem>
            ))}
          {menu.kind === 'link' && (
            <form
              className="w-[284px] p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (link.trim()) choose((range) => setLink(range, link));
              }}
            >
              <label className="text-[13px] font-medium" htmlFor="word-link">
                Link to
              </label>
              <input
                id="word-link"
                autoFocus
                value={link}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="website or email"
                inputMode="url"
                className="mt-1.5 h-10 w-full rounded-[10px] border border-line bg-canvas px-3 text-[14px] outline-none focus:border-ink"
              />
              <div className="mt-2.5 flex justify-end gap-1.5">
                {current.link && (
                  <Button variant="ghost" size="sm" onClick={() => choose((range) => removeLink(range))}>
                    Remove link
                  </Button>
                )}
                <Button variant="primary" size="sm" type="submit" disabled={!link.trim()}>
                  Apply
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}

function MenuItem({ checked, onClick, children }: { checked?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onPointerDown={keepCursor}
      onClick={onClick}
      className="flex w-full min-w-[180px] items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] hover:bg-subtle"
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checked && <Check size={15} className="shrink-0" />}
    </button>
  );
}
