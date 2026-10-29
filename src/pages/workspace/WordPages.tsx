import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Download, Eye, FileText, MoveLeft, MoveRight, PenLine } from 'lucide-react';
import { Button, formatSize, IconButton, PageViewer, Panel, Row, Spinner, Workbench } from '@/components/toolkit';
import { closePdf } from '@/lib/pdfjs';
import { renderPageImage } from '@/lib/pdfUtils';
import { cn } from '@/lib/utils';
import type { WordLayout, WordPdf } from '@/lib/wordToPdf';
import WordEditor from '@/pages/workspace/WordEditor';

// a4, letter and legal by name, anything else in millimetres
function describeSize(pages: WordPdf['pages']) {
  const [first] = pages;
  if (!first) return '—';
  if (pages.some((p) => Math.abs(p.width - first.width) > 2 || Math.abs(p.height - first.height) > 2)) return 'Mixed';
  const short = Math.min(first.width, first.height);
  const long = Math.max(first.width, first.height);
  const near = (a: number, b: number) => Math.abs(a - b) < 3;
  const name =
    near(short, 595) && near(long, 842) ? 'A4'
    : near(short, 612) && near(long, 792) ? 'Letter'
    : near(short, 612) && near(long, 1008) ? 'Legal'
    : near(short, 420) && near(long, 595) ? 'A5'
    : `${Math.round((short / 72) * 25.4)} × ${Math.round((long / 72) * 25.4)} mm`;
  return `${name}, ${first.width > first.height ? 'landscape' : 'portrait'}`;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-5 rounded-[16px] bg-subtle px-4 py-3 text-[13px] leading-relaxed text-ink/60">{children}</p>;
}

// a page's thumbnail, with an id that stays with the page when it moves
type Thumb = { id: string; url: string | null };
let lastThumb = 0;
const newThumb = (): Thumb => ({ id: `page-${++lastThumb}`, url: null });

function PageCard({ thumb, index, page, onOpen }: { thumb: Thumb; index: number; page: WordPdf['pages'][number]; onOpen: (index: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: thumb.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
      className={cn('rounded-[20px] bg-card p-2 transition-shadow', isDragging ? 'shadow-2xl ring-2 ring-ink' : 'hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        // a tap opens the page, dragging only starts once the pointer moves
        onClick={() => onOpen(index)}
        aria-label={`Preview page ${index + 1}`}
        title="Click to see it full size, drag to move it"
        className="group block w-full cursor-grab text-left active:cursor-grabbing"
      >
        <span className="relative block w-full overflow-hidden rounded-[14px] bg-subtle" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
          {thumb.url ? (
            <img src={thumb.url} alt="" draggable={false} className="size-full select-none object-contain" />
          ) : (
            <FileText size={36} strokeWidth={1.2} className="absolute inset-0 m-auto text-ink/20" />
          )}
        </span>
        <span className="flex items-center justify-between pl-1.5 pr-1 pt-2">
          <span className="text-[13px] tabular-nums text-ink/60">Page {index + 1}</span>
          <Eye size={16} aria-hidden="true" className="text-ink/45 transition-colors group-hover:text-ink" />
        </span>
      </button>
    </div>
  );
}

type EditorExtras = Pick<ComponentProps<typeof WordEditor>, 'leave' | 'hint' | 'onEdit' | 'onDropFile'>;

// a laid out document as its pdf: the pages, which drag into a new order, a full size viewer, the editor and the
// download panel. word to pdf and text to pdf both work this way
export default function WordPages({
  layout,
  result,
  onResult,
  editing,
  onEditing,
  onDownload,
  rows,
  editor,
}: {
  layout: WordLayout;
  // null until the first pdf is made, while the editor is all there is
  result: WordPdf | null;
  onResult: (result: WordPdf) => void;
  // the page editing starts at, null while not editing
  editing: number | null;
  onEditing: (page: number | null) => void;
  onDownload: () => void;
  // more about the pdf, above the page count
  rows?: ReactNode;
  editor?: EditorExtras;
}) {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  // the pdf being made again after a page moved
  const [moving, setMoving] = useState(false);
  const job = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // thumbnails come in one at a time, so the first pages show up straight away. the old one stays until its
  // replacement is ready, so a page that moved keeps its picture
  useEffect(() => {
    if (!result) return;
    const total = result.pages.length;
    let cancelled = false;
    setThumbs((prev) => {
      prev.slice(total).forEach((t) => t.url && URL.revokeObjectURL(t.url));
      return [...prev.slice(0, total), ...Array.from({ length: Math.max(0, total - prev.length) }, newThumb)];
    });
    (async () => {
      for (let i = 0; i < total && !cancelled; i++) {
        try {
          const { url } = await renderPageImage(result.bytes, i, 260, Infinity, 'image/jpeg');
          if (cancelled) {
            URL.revokeObjectURL(url);
            break;
          }
          setThumbs((prev) =>
            prev.map((t, j) => {
              if (j !== i) return t;
              if (t.url && t.url !== url) URL.revokeObjectURL(t.url);
              return { ...t, url };
            }),
          );
        } catch (err) {
          console.error('Page preview error', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      closePdf(result.bytes);
    };
  }, [result]);

  // every thumbnail goes when the pages do
  const latest = useRef(thumbs);
  latest.current = thumbs;
  useEffect(() => () => latest.current.forEach((t) => t.url && URL.revokeObjectURL(t.url)), []);

  // sharp page renders for the full screen preview
  const renderPage = useCallback(
    async (index: number, width: number, height: number) => {
      if (!result) throw new Error('No PDF yet');
      return (await renderPageImage(result.bytes, index, width, height)).url;
    },
    [result],
  );

  // after editing, the pdf is made again from the edited pages. the first time it's made whatever happened
  const save = async (changed: boolean) => {
    if (changed || !result) onResult(await layout.toPdf());
  };

  // the page moves in the document too, so page numbers follow and editing keeps the new order
  const move = async (from: number, to: number) => {
    const total = result?.pages.length ?? 0;
    if (from === to || from < 0 || to < 0 || from >= total || to >= total) return;
    setThumbs((prev) => arrayMove(prev, from, to));
    layout.movePage(from, to);
    const id = ++job.current;
    setMoving(true);
    try {
      const made = await layout.toPdf();
      if (id === job.current) onResult(made);
    } finally {
      if (id === job.current) setMoving(false);
    }
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      thumbs.findIndex((t) => t.id === active.id),
      thumbs.findIndex((t) => t.id === over.id),
    );
  };

  const count = result?.pages.length ?? 0;
  const shown = thumbs.slice(0, count);
  return (
    <>
      {result && (
        <Workbench
          panel={
            <Panel
              title="Your PDF"
              footer={
                <div className="flex gap-2">
                  <Button size="lg" onClick={() => onEditing(0)} disabled={moving}>
                    <PenLine size={18} />
                    Edit
                  </Button>
                  <Button variant="primary" size="lg" className="flex-1" onClick={onDownload} disabled={moving}>
                    {moving ? <Spinner className="size-[18px]" /> : <Download size={18} />}
                    {moving ? 'Updating…' : 'Download PDF'}
                  </Button>
                </div>
              }
            >
              <dl className="mt-5 space-y-2.5 text-[14px]">
                {rows}
                <Row label="Pages" value={count} />
                <Row label="Page size" value={describeSize(result.pages)} />
                <Row label="PDF size" value={formatSize(result.bytes.length)} />
              </dl>
              {result.missingText && <Note>Emoji and some symbols or alphabets can’t go in the PDF yet, so they’re left out.</Note>}
              {result.charts > 0 && (
                <Note>
                  {result.charts === 1 ? 'A chart or diagram' : `${result.charts} charts or diagrams`} from Word can’t go in the PDF yet. In Word,
                  copy {result.charts === 1 ? 'it' : 'each one'}, paste it back with Paste Special as a picture, then convert again.
                </Note>
              )}
              {result.oldPictures > 0 && (
                <Note>
                  {result.oldPictures === 1 ? 'A picture is' : `${result.oldPictures} pictures are`} in an old Windows format (EMF or WMF) that can’t go
                  in the PDF yet. In Word, right-click {result.oldPictures === 1 ? 'it' : 'each one'}, choose Save as Picture, insert that picture
                  instead, then convert again.
                </Note>
              )}
              {result.skipped > 0 && (
                <Note>
                  {result.skipped === 1 ? 'One picture or shape' : `${result.skipped} pictures or shapes`} couldn’t go in the PDF, so check the pages
                  before you send it.
                </Note>
              )}
              <p className="mt-5 text-[13px] leading-relaxed text-ink/45">The text stays real text, so it can be selected, searched and read by job sites.</p>
            </Panel>
          }
        >
          <p className="px-1 pb-3 text-[14px] text-ink/55">
            This is your PDF. Tap a page to see it full size, drag one to move it, or Edit to change the text.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={shown.map((t) => t.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {shown.map((thumb, i) => (
                  <PageCard key={thumb.id} thumb={thumb} index={i} page={result.pages[i]} onOpen={setViewing} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </Workbench>
      )}

      <PageViewer
        previews={shown.map((t) => t.url ?? '')}
        count={count}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        renderPage={renderPage}
        action={
          viewing !== null && (
            <div className="flex items-center gap-1.5">
              <IconButton
                label="Move page earlier"
                disabled={moving || viewing === 0}
                onClick={() => {
                  move(viewing, viewing - 1);
                  setViewing(viewing - 1);
                }}
                className="bg-canvas/80 text-ink shadow-sm hover:bg-canvas"
              >
                <MoveLeft size={18} />
              </IconButton>
              <IconButton
                label="Move page later"
                disabled={moving || viewing === count - 1}
                onClick={() => {
                  move(viewing, viewing + 1);
                  setViewing(viewing + 1);
                }}
                className="bg-canvas/80 text-ink shadow-sm hover:bg-canvas"
              >
                <MoveRight size={18} />
              </IconButton>
              <Button
                variant="primary"
                disabled={moving}
                onClick={() => {
                  onEditing(viewing);
                  setViewing(null);
                }}
              >
                <PenLine size={16} />
                Edit
              </Button>
            </div>
          )
        }
      />

      {editing !== null && <WordEditor layout={layout} start={editing} onSave={save} onClose={() => onEditing(null)} {...editor} />}
    </>
  );
}
