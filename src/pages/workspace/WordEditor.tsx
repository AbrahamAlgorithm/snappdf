import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, FilePlus2, Minus, Plus, X } from 'lucide-react';
import { Button, Dialog, IconButton, Spinner } from '@/components/toolkit';
import { hasKeyboard, NEW_PAGE_KEYS } from '@/lib/wordEditing';
import type { WordLayout } from '@/lib/wordToPdf';
import WordToolbar from '@/pages/workspace/WordToolbar';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;

// every page one under another like word on a phone, with the text editable right on the page
export default function WordEditor({
  layout,
  start,
  onSave,
  onClose,
  leave,
  hint,
  onEdit,
  onDropFile,
}: {
  layout: WordLayout;
  start: number;
  // after done, with whether anything changed
  onSave: (changed: boolean) => Promise<void>;
  onClose: () => void;
  // a link out in place of cancel, for when the editor is the whole tool
  leave?: string;
  // shown above the pages until the first change
  hint?: ReactNode;
  onEdit?: () => void;
  // a file dropped on the pages, which the browser would otherwise open in place of the app
  onDropFile?: (file: File) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(start);
  const [count, setCount] = useState(layout.pages.length);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [tip, setTip] = useState<string | null>(null);

  const edited = useRef(onEdit);
  edited.current = onEdit;

  // the pages move in here while editing, fitted to the screen's width. hiding the tool only puts them away, edits and all
  useLayoutEffect(() => {
    const box = mount.current!;
    layout.startEditing(box, () => {
      setDirty(true);
      setCount(layout.pages.length);
      edited.current?.();
    });
    const scroll = scroller.current!;
    const pad = getComputedStyle(scroll);
    setWidth(layout.width);
    setZoom(Math.min(1, (scroll.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight)) / layout.width));
    const observer = new ResizeObserver(() => setHeight(box.offsetHeight));
    observer.observe(box);
    return () => {
      observer.disconnect();
      layout.pauseEditing();
    };
  }, [layout]);

  // open at the page that was tapped
  useEffect(() => {
    const scroll = scroller.current;
    const target = layout.pages[start];
    if (opened.current || !height || !scroll || !target) return;
    opened.current = true;
    scroll.scrollTop += target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
  }, [height, layout, start]);

  // handles over pictures and tables stay the same size on screen
  useEffect(() => layout.zoomed(), [layout, zoom]);

  // the page behind stays put
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!tip) return;
    const id = setTimeout(() => setTip(null), 3500);
    return () => clearTimeout(id);
  }, [tip]);

  const onScroll = () => {
    const scroll = scroller.current!;
    const line = scroll.getBoundingClientRect().top + scroll.clientHeight * 0.35;
    let current = 0;
    layout.pages.forEach((p, i) => p.getBoundingClientRect().top <= line && (current = i));
    setPage(current);
  };

  // zooming keeps the page you're on in view
  const zoomBy = (step: number) => {
    const current = layout.pages[page];
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + step) * 100) / 100)));
    requestAnimationFrame(() => {
      const scroll = scroller.current;
      if (!scroll || !current) return;
      scroll.scrollTop += current.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
      onScroll();
    });
  };

  const done = async () => {
    setSaving(true);
    try {
      await onSave(layout.finishEditing());
    } finally {
      onClose();
    }
  };

  const discard = () => {
    layout.cancelEditing();
    onClose();
  };

  const onDragOver = (e: DragEvent) => e.dataTransfer.types.includes('Files') && e.preventDefault();
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    onDropFile?.(e.dataTransfer.files[0]);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit pages" className="fixed inset-0 z-[100] flex flex-col bg-subtle text-ink">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-canvas px-2 sm:h-16 sm:px-4">
        {leave ? (
          <a
            href={leave}
            aria-label="All tools"
            title="All tools"
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink/70 transition-colors hover:bg-subtle hover:text-ink"
          >
            <ArrowLeft size={20} />
          </a>
        ) : (
          <IconButton label="Cancel" onClick={() => (dirty ? setAsking(true) : discard())} disabled={saving}>
            <X size={20} />
          </IconButton>
        )}
        <span className="ml-1 whitespace-nowrap text-[14px] font-medium tabular-nums sm:text-[15px]">
          Page {Math.min(page, count - 1) + 1} of {count}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Zoom out" onClick={() => zoomBy(-0.1)} disabled={saving || zoom <= MIN_ZOOM}>
            <Minus size={18} />
          </IconButton>
          <IconButton label="Zoom in" onClick={() => zoomBy(0.1)} disabled={saving || zoom >= MAX_ZOOM}>
            <Plus size={18} />
          </IconButton>
          <Button
            variant="outline"
            aria-label="New page here"
            title={`Start a new page where the cursor is (${NEW_PAGE_KEYS})`}
            disabled={saving}
            // keeps the cursor in the text, a tap here would otherwise take it away
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => !layout.newPageAtCaret() && setTip('Tap in the text where the new page should start, then try again.')}
            className="px-3 sm:px-4"
          >
            <FilePlus2 size={16} />
            <span className="hidden sm:inline">New page here</span>
          </Button>
          <Button variant="primary" onClick={done} disabled={saving} className="px-4">
            {saving ? <Spinner className="size-4" /> : <Check size={16} />}
            Done
          </Button>
        </div>
      </div>
      <WordToolbar layout={layout} onTip={setTip} />
      {/* until the first change, then the room goes back to the page */}
      {!dirty && (
        <div className="shrink-0 border-b border-line bg-canvas px-4 py-2 text-center text-[12.5px] leading-snug text-ink/55">
          {hint ?? (
            <>
              Tap any text to change it, and press Enter to add space.{hasKeyboard() && ` ${NEW_PAGE_KEYS} starts a new page.`} Text below a red line moves to
              the next page when you tap Done.
            </>
          )}
        </div>
      )}

      <div
        ref={scroller}
        onScroll={onScroll}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6"
      >
        <div className="mx-auto" style={{ width: width * zoom, height: height * zoom }}>
          <div ref={mount} style={{ width, transform: `scale(${zoom})`, transformOrigin: '0 0' }} />
        </div>
      </div>

      {saving && (
        <div role="status" className="absolute inset-x-0 bottom-0 top-14 flex flex-col items-center justify-center gap-4 bg-subtle text-[15px] text-ink/60 sm:top-16">
          <Spinner className="size-7" />
          Updating your PDF…
        </div>
      )}

      <div role="status" className="pointer-events-none fixed inset-x-0 bottom-6 z-[110] flex justify-center px-4">
        {tip && <p className="rounded-full bg-ink px-4 py-2.5 text-center text-[14px] font-medium text-canvas shadow-lg">{tip}</p>}
      </div>

      <Dialog open={asking} onClose={() => setAsking(false)} labelledBy="discard-edits-title">
        <h2 id="discard-edits-title" className="text-[20px] font-semibold tracking-[-0.02em]">
          Discard your changes?
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink/60">The pages go back to how they were before you started editing.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Keep editing
          </Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={discard}>
            Discard
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
