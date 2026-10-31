import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import { ChevronLeft, ChevronRight, Download, EyeOff, FileText, Search, Undo2, X } from 'lucide-react';
import { Button, formatSize, IconButton, NameDialog, Panel, Row, Spinner, ToolShell, UploadCard, useDocName, Workbench } from '@/components/toolkit';
import { covered, findText, newMarkId, PATTERNS, redactPdf, textMatcher, type Mark } from '@/lib/redactPdf';
import { closePdf } from '@/lib/pdfjs';
import { getPdfInfo, getPdfMetadata, renderPageImage } from '@/lib/pdfUtils';
import { getTool } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

const tool = getTool('redact-pdf');

type Box = Pick<Mark, 'x' | 'y' | 'w' | 'h'>;
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Marking = { marks: Mark[]; whole: number[] };
type Drag =
  | { kind: 'draw'; x: number; y: number }
  | { kind: 'move'; id: string; x: number; y: number; from: Box }
  | { kind: 'resize'; id: string; corner: Corner; from: Box };

const clamp = (v: number, low = 0, high = 1) => Math.min(Math.max(v, low), high);
// the smallest mark worth keeping, as a fraction of the page
const MIN_W = 0.008;
const MIN_H = 0.004;

// the page as an image to draw on. boxes are laid over it by fractions, so they stay put at any size
function Stage({
  file,
  page,
  marks,
  whole,
  selected,
  drawing,
  onBegin,
  onAdd,
  onChange,
  onSelect,
  onRemove,
}: {
  file: File;
  page: number;
  marks: Mark[];
  whole: boolean;
  selected: string | null;
  drawing: boolean;
  onBegin: () => void;
  onAdd: (box: Box) => void;
  onChange: (id: string, box: Box) => void;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [shown, setShown] = useState<{ page: number; url: string; ratio: number } | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);

  // the sharp page for this width, and the last one stays up until the next is ready
  useEffect(() => {
    let cancelled = false;
    const width = area.current?.clientWidth || 720;
    renderPageImage(file, page, width)
      .then(({ url, width: w, height: h }) => {
        if (cancelled) return URL.revokeObjectURL(url);
        setShown((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { page, url, ratio: w / h };
        });
      })
      .catch((err) => !cancelled && console.error('Page render error', err));
    return () => {
      cancelled = true;
    };
  }, [file, page]);
  useEffect(() => () => setShown((prev) => (prev && URL.revokeObjectURL(prev.url), null)), []);

  const at = (e: ReactPointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const find = (id: string) => marks.find((m) => m.id === id);

  const startDraw = (e: ReactPointerEvent) => {
    if (whole || !drawing || e.button > 0) return;
    onSelect(null);
    area.current!.setPointerCapture(e.pointerId);
    drag.current = { kind: 'draw', ...at(e) };
  };

  const startEdit = (e: ReactPointerEvent, mark: Mark, corner?: Corner) => {
    e.stopPropagation();
    if (e.button > 0) return;
    onSelect(mark.id);
    onBegin();
    area.current!.setPointerCapture(e.pointerId);
    const from = { x: mark.x, y: mark.y, w: mark.w, h: mark.h };
    drag.current = corner ? { kind: 'resize', id: mark.id, corner, from } : { kind: 'move', id: mark.id, ...at(e), from };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    if (d.kind === 'draw') {
      setDraft({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) });
    } else if (d.kind === 'move') {
      onChange(d.id, { ...d.from, x: clamp(d.from.x + p.x - d.x, 0, 1 - d.from.w), y: clamp(d.from.y + p.y - d.y, 0, 1 - d.from.h) });
    } else {
      // the corner opposite the one held stays where it is
      const { from } = d;
      const fixedX = d.corner.includes('w') ? from.x + from.w : from.x;
      const fixedY = d.corner.includes('n') ? from.y + from.h : from.y;
      onChange(d.id, { x: Math.min(fixedX, p.x), y: Math.min(fixedY, p.y), w: Math.max(MIN_W, Math.abs(p.x - fixedX)), h: Math.max(MIN_H, Math.abs(p.y - fixedY)) });
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'draw' && draft && draft.w >= MIN_W && draft.h >= MIN_H) onAdd(draft);
    setDraft(null);
  };

  const ratio = shown?.ratio ?? 1 / 1.414;
  return (
    <div
      ref={area}
      onPointerDown={startDraw}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ aspectRatio: ratio, touchAction: drawing && !whole ? 'none' : 'pan-y pinch-zoom' }}
      className={cn('relative mx-auto w-full max-w-[760px] select-none bg-paper shadow-[0_2px_14px_rgba(0,0,0,0.12)] ring-1 ring-black/5', drawing && !whole && 'cursor-crosshair')}
    >
      {shown ? (
        <img src={shown.url} alt={`Page ${page + 1}`} draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />
      ) : (
        <span role="status" className="absolute inset-0 grid place-items-center">
          <Spinner className="size-6 text-ink/40" />
        </span>
      )}

      {whole && (
        <div className="absolute inset-0 grid place-items-center bg-black text-[15px] font-medium text-white">This whole page will be blacked out</div>
      )}

      {!whole &&
        marks.map((m) => {
          const on = m.id === selected;
          return (
            <div
              key={m.id}
              onPointerDown={(e) => startEdit(e, m)}
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%`, touchAction: 'none' }}
              className={cn('absolute cursor-move bg-black', on && 'outline outline-2 outline-offset-0 outline-[#1a73e8]')}
            >
              {on &&
                (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  // a small dot to see, in a bigger area to grab
                  <span
                    key={corner}
                    onPointerDown={(e) => startEdit(e, m, corner)}
                    className={cn(
                      'absolute grid size-7 place-items-center',
                      corner.includes('n') ? '-top-3.5' : '-bottom-3.5',
                      corner.includes('w') ? '-left-3.5' : '-right-3.5',
                      corner === 'nw' || corner === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize',
                    )}
                  >
                    <span className="size-2.5 rounded-full border-2 border-[#1a73e8] bg-white" />
                  </span>
                ))}
              {on && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onRemove(m.id)}
                  className={cn(
                    'absolute left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-medium text-canvas shadow-lg',
                    m.y > 0.08 ? 'bottom-full mb-2' : 'top-full mt-2',
                  )}
                >
                  <X size={13} />
                  Remove
                </button>
              )}
            </div>
          );
        })}

      {draft && (
        <div
          style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
          className="pointer-events-none absolute bg-black/80 outline outline-2 outline-[#1a73e8]"
        />
      )}
    </div>
  );
}

// the redacted pages, for a last look before saving
function Result({ bytes, pages }: { bytes: Uint8Array; pages: number[] }) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      for (const page of pages) {
        try {
          const { url } = await renderPageImage(bytes, page, 300, Infinity, 'image/jpeg');
          if (cancelled) return URL.revokeObjectURL(url);
          made.push(url);
          setUrls((prev) => ({ ...prev, [page]: url }));
        } catch (err) {
          console.error('Page preview error', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      made.forEach((url) => URL.revokeObjectURL(url));
      closePdf(bytes);
    };
  }, [bytes, pages]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {pages.map((page) => (
        <div key={page} className="rounded-[20px] bg-card p-2">
          <div className="relative aspect-[3/4] overflow-hidden rounded-[14px] bg-subtle">
            {urls[page] ? <img src={urls[page]} alt={`Redacted page ${page + 1}`} className="size-full object-contain" /> : <FileText size={36} strokeWidth={1.2} className="absolute inset-0 m-auto text-ink/20" />}
          </div>
          <p className="pl-1.5 pt-2 text-[13px] tabular-nums text-ink/60">Page {page + 1}</p>
        </div>
      ))}
    </div>
  );
}

export default function RedactPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [marking, setMarking] = useState<Marking>({ marks: [], whole: [] });
  // what it was before each change, so undo can step back
  const [history, setHistory] = useState<Marking[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ bytes: Uint8Array; redacted: number[] } | null>(null);
  const job = useRef(0);
  const doc = useDocName(file?.name.replace(/\.pdf$/i, '') ?? 'document');
  const { marks, whole } = marking;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  useReportWork(tool.id, !!file);

  const onDrop = useCallback(async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    const id = ++job.current;
    setProblem(null);
    setLoading(true);
    try {
      const info = await getPdfInfo(picked);
      if (info.locked) throw new Error('locked');
      const meta = await getPdfMetadata(picked);
      if (id !== job.current) return;
      setFile(picked);
      setPageCount(meta.pageCount);
      setPreviews(meta.previews);
      setPage(0);
      setMarking({ marks: [], whole: [] });
      setHistory([]);
      setSelected(null);
      setNote(null);
      setResult(null);
    } catch (err) {
      if (id !== job.current) return;
      console.error('Redact open error', err);
      setProblem(
        err instanceof Error && err.message === 'locked'
          ? 'This PDF is password protected. Open it with its password, save an unlocked copy, then try again.'
          : 'We couldn’t read this PDF. Check that it’s a valid PDF file and try again.',
      );
    } finally {
      if (id === job.current) setLoading(false);
    }
  }, []);

  const dropzone = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: false, disabled: loading });

  // every change goes through here, so undo has something to go back to
  const change = useCallback((next: (m: Marking) => Marking) => {
    setMarking((m) => {
      setHistory((h) => [...h.slice(-49), m]);
      return next(m);
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last) setMarking(last);
      return h.slice(0, -1);
    });
    setSelected(null);
  }, []);

  const removeMark = useCallback(
    (id: string) => {
      change((m) => ({ ...m, marks: m.marks.filter((x) => x.id !== id) }));
      setSelected(null);
    },
    [change],
  );

  // delete takes out the picked mark, and cmd or ctrl and z steps back
  useEffect(() => {
    if (!file || result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (selected && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        removeMark(selected);
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, result, selected, undo, removeMark]);

  // finds text on every page and marks it
  const search = async (label: string, pattern: RegExp | null) => {
    if (!file || !pattern) return;
    setNote(null);
    setSearching(label);
    try {
      const found = await findText(file, pattern, (done, total) => setSearching(`${label} · page ${done} of ${total}`));
      const fresh = found.filter((m, i) => !covered(m, marks) && !covered(m, found.slice(0, i)));
      if (fresh.length) change((m) => ({ ...m, marks: [...m.marks, ...fresh] }));
      const onPages = new Set(fresh.map((m) => m.page)).size;
      setNote(
        fresh.length
          ? `Marked ${fresh.length} ${fresh.length === 1 ? 'match' : 'matches'} on ${onPages} ${onPages === 1 ? 'page' : 'pages'}. Check them, and tap any mark to move or remove it.`
          : found.length
            ? 'Everything found is marked already.'
            : 'Nothing found. If this PDF is a scan or a photo, it has no text to search, so draw boxes on the page instead.',
      );
      const first = fresh.map((m) => m.page).sort((a, b) => a - b)[0];
      if (first !== undefined && !fresh.some((m) => m.page === page)) setPage(first);
    } catch (err) {
      console.error('Find text error', err);
      setNote('We couldn’t search this PDF. You can still draw boxes on the page.');
    } finally {
      setSearching(null);
    }
  };

  const apply = async () => {
    if (!file) return;
    setNote(null);
    setWorking({ done: 0, total: pageCount });
    try {
      const made = await redactPdf(file, marks, whole, (done, total) => setWorking({ done, total }));
      const redacted = [...new Set([...marks.map((m) => m.page), ...whole])].sort((a, b) => a - b);
      setResult({ bytes: made.bytes, redacted });
    } catch (err) {
      console.error('Redact error', err);
      setNote('We couldn’t redact this PDF. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  const reset = () => {
    job.current++;
    closePdf(file);
    setFile(null);
    setPreviews([]);
    setPageCount(0);
    setMarking({ marks: [], whole: [] });
    setHistory([]);
    setSelected(null);
    setQuery('');
    setNote(null);
    setResult(null);
    setProblem(null);
    setLoading(false);
    doc.forget();
  };

  if (!file) {
    return (
      <ToolShell tool={tool}>
        <UploadCard
          tool={tool}
          dropzone={dropzone}
          title="Choose a PDF to redact"
          hint="Drag and drop a PDF here, or choose one from your device. You’ll cover what you want to hide next."
          button="Choose PDF"
          formats="PDF files"
          busy={loading ? 'Opening your PDF…' : null}
          notice={problem}
        />
      </ToolShell>
    );
  }

  const busy = !!working || !!searching;
  const total = marks.length + whole.length;
  const pagesHit = new Set([...marks.map((m) => m.page), ...whole]).size;
  const here = marks.filter((m) => m.page === page);
  const isWhole = whole.includes(page);
  const save = (name: string) => result && saveAs(new Blob([result.bytes as BlobPart], { type: 'application/pdf' }), name);

  return (
    <ToolShell tool={tool} doc={{ name: doc.name, onRename: doc.rename, onChange: busy ? undefined : reset }} onDelete={busy ? undefined : reset} what="this PDF">
      {result ? (
        <Workbench
          panel={
            <Panel
              title="Redacted PDF"
              footer={
                <div className="flex gap-2">
                  <Button size="lg" className="px-4" onClick={() => setResult(null)}>
                    Keep editing
                  </Button>
                  <Button variant="primary" size="lg" className="min-w-0 flex-1 px-4" onClick={() => doc.download(save, `redacted-${file.name.replace(/\.pdf$/i, '')}`)}>
                    <Download size={18} />
                    Download PDF
                  </Button>
                </div>
              }
            >
              <dl className="mt-5 space-y-2.5 text-[14px]">
                <Row label="Pages" value={pageCount} />
                <Row label="Pages redacted" value={result.redacted.length} />
                <Row label="PDF size" value={formatSize(result.bytes.length)} />
              </dl>
              <p className="mt-5 rounded-[16px] bg-subtle px-4 py-3 text-[13px] leading-relaxed text-ink/60">
                Redacted pages are drawn again with the black burned in, so what’s under it is gone from the file and can’t be copied or searched. The text on those
                pages can’t be selected anymore. Other pages are unchanged.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-ink/45">The author, title and other details of the original are not kept.</p>
            </Panel>
          }
        >
          <p className="px-1 pb-3 text-[14px] text-ink/55">Check every redacted page before you send it. Your original file is untouched.</p>
          <Result bytes={result.bytes} pages={result.redacted} />
        </Workbench>
      ) : (
        <Workbench
          panel={
            <Panel
              title="Redact"
              footer={
                working ? (
                  <div role="status" className="px-1">
                    <div className="flex justify-between text-[14px]">
                      <span className="font-medium">Redacting…</span>
                      <span className="tabular-nums text-ink/55">
                        {working.done} of {working.total}
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${(working.done / working.total) * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <Button variant="primary" size="lg" className="w-full" disabled={!total || busy} onClick={apply}>
                    <EyeOff size={18} />
                    {total ? `Redact ${pagesHit} ${pagesHit === 1 ? 'page' : 'pages'}` : 'Redact PDF'}
                  </Button>
                )
              }
            >
              <p className="mt-3 text-[13px] leading-relaxed text-ink/55">Drag on the page to cover what you want to hide, or find it by its text below.</p>

              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  search(`“${query.trim()}”`, textMatcher(query));
                }}
              >
                <label htmlFor="redact-find" className="text-[14px] font-medium">
                  Find text
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="redact-find"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="A name, an address…"
                    // 16px on phones, or iphones zoom in when it's tapped
                    className="h-10 min-w-0 flex-1 rounded-[12px] border border-line bg-canvas px-3 text-[16px] outline-none transition-colors focus:border-ink sm:text-[14px]"
                  />
                  <Button type="submit" variant="outline" className="h-10 px-4" disabled={busy || !query.trim()}>
                    <Search size={16} />
                    Find
                  </Button>
                </div>
              </form>

              <p className="mt-5 text-[14px] font-medium">Or mark every</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PATTERNS.map((p) => (
                  <Button key={p.id} size="sm" variant="outline" disabled={busy} onClick={() => search(p.label.toLowerCase(), p.test)}>
                    {p.label}
                  </Button>
                ))}
              </div>

              {searching && (
                <p role="status" className="mt-4 flex items-center gap-2 text-[13px] text-ink/60">
                  <Spinner className="size-4" />
                  Looking for {searching}…
                </p>
              )}
              {note && (
                <p role="status" className="mt-4 rounded-[16px] bg-subtle px-4 py-3 text-[13px] leading-relaxed text-ink/70">
                  {note}
                </p>
              )}

              <div className="mt-6 border-t border-line pt-5">
                <p className="text-[14px] font-medium">{total ? `${total} ${total === 1 ? 'thing' : 'things'} to redact` : 'Nothing marked yet'}</p>
                {total > 0 && (
                  <p className="mt-1 text-[14px] leading-relaxed text-ink/60">
                    {marks.length} {marks.length === 1 ? 'box' : 'boxes'} and {whole.length} whole {whole.length === 1 ? 'page' : 'pages'}, over {pagesHit}{' '}
                    {pagesHit === 1 ? 'page' : 'pages'}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={!history.length || busy} onClick={undo}>
                    <Undo2 size={15} />
                    Undo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!total || busy}
                    onClick={() => {
                      change(() => ({ marks: [], whole: [] }));
                      setSelected(null);
                    }}
                  >
                    Clear all
                  </Button>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink/45">Redacted pages become pictures, so what’s under the black is removed for good.</p>
              </div>
            </Panel>
          }
        >
          <div className="sticky top-[76px] z-30 flex items-center gap-1 rounded-[20px] bg-card p-2 pl-3">
            <IconButton label="Previous page" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={18} />
            </IconButton>
            <span className="min-w-20 text-center text-[13px] tabular-nums">
              Page {page + 1} of {pageCount}
            </span>
            <IconButton label="Next page" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight size={18} />
            </IconButton>
            <span className="ml-1 hidden text-[13px] text-ink/50 sm:inline">{isWhole ? 'Whole page' : here.length ? `${here.length} ${here.length === 1 ? 'box' : 'boxes'}` : ''}</span>
            <div className="ml-auto flex items-center gap-1.5">
              {touch && !isWhole && (
                <Button size="sm" variant={drawing ? 'primary' : 'outline'} onClick={() => setDrawing(!drawing)} title="Switch between drawing boxes and scrolling the page">
                  {drawing ? 'Drawing' : 'Scrolling'}
                </Button>
              )}
              <Button
                size="sm"
                variant={isWhole ? 'primary' : 'outline'}
                onClick={() => {
                  change((m) => ({ ...m, whole: isWhole ? m.whole.filter((p) => p !== page) : [...m.whole, page] }));
                  setSelected(null);
                }}
              >
                <EyeOff size={15} />
                <span className="sm:hidden">{isWhole ? 'Blacked out' : 'Whole page'}</span>
                <span className="hidden sm:inline">{isWhole ? 'Page blacked out' : 'Redact whole page'}</span>
              </Button>
            </div>
          </div>

          <div className="py-5">
            <Stage
              file={file}
              page={page}
              marks={here}
              whole={isWhole}
              selected={selected}
              drawing={drawing}
              onBegin={() => setHistory((h) => [...h.slice(-49), marking])}
              onAdd={(box) => {
                const mark = { id: newMarkId(), page, ...box };
                change((m) => ({ ...m, marks: [...m.marks, mark] }));
                setSelected(mark.id);
              }}
              onChange={(id, box) => setMarking((m) => ({ ...m, marks: m.marks.map((x) => (x.id === id ? { ...x, ...box } : x)) }))}
              onSelect={setSelected}
              onRemove={removeMark}
            />
          </div>

          {pageCount > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Pages">
              {Array.from({ length: pageCount }, (_, i) => {
                const count = marks.filter((m) => m.page === i).length + (whole.includes(i) ? 1 : 0);
                return (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === page}
                    aria-label={`Page ${i + 1}${count ? `, ${count} to redact` : ''}`}
                    onClick={() => {
                      setPage(i);
                      setSelected(null);
                    }}
                    className={cn('relative h-24 w-[72px] shrink-0 overflow-hidden rounded-[12px] bg-card p-1 transition-shadow', i === page ? 'ring-2 ring-ink' : 'hover:shadow-md')}
                  >
                    {previews[i] ? <img src={previews[i]} alt="" className="size-full rounded-[8px] object-contain" /> : <FileText size={24} strokeWidth={1.2} className="absolute inset-0 m-auto text-ink/25" />}
                    <span className="absolute bottom-1 left-1 rounded-full bg-canvas/90 px-1.5 text-[11px] tabular-nums">{i + 1}</span>
                    {count > 0 && <span className="absolute right-1 top-1 size-2.5 rounded-full bg-red-600 ring-2 ring-canvas" />}
                  </button>
                );
              })}
            </div>
          )}
        </Workbench>
      )}
      <NameDialog {...doc.dialog} />
    </ToolShell>
  );
}
