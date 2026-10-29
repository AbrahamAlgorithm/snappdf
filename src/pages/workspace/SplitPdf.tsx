import { useCallback, useState, type FormEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Download, Eye, FileText } from 'lucide-react';
import { saveAs } from 'file-saver';
import {
  Button,
  formatSize,
  IconButton,
  NameDialog,
  PageViewer,
  Panel,
  Spinner,
  ToolShell,
  UploadCard,
  useDocName,
  Workbench,
} from '@/components/toolkit';
import { closePdf } from '@/lib/pdfjs';
import { extractPdfPages, getPdfMetadata, renderPageImage } from '@/lib/pdfUtils';
import { getTool } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

const tool = getTool('pdf-splitter');

// [2, 3, 4, 8] (zero-based) → "3–5, 9"
function describePages(pages: number[]) {
  const parts: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    parts.push(j > i ? `${pages[i] + 1}–${pages[j] + 1}` : `${pages[i] + 1}`);
    i = j;
  }
  return parts.join(', ');
}

// a page of the pdf: tap to keep it, double-click to see it, drag to move it
function PageTile({
  page,
  preview,
  isSelected,
  dim,
  onToggle,
  onOpen,
}: {
  page: number;
  preview?: string;
  isSelected: boolean;
  dim: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
      className={cn(
        'relative rounded-[20px] bg-card p-2 transition-shadow',
        isDragging ? 'shadow-2xl' : !isSelected && 'hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]',
        isSelected && 'ring-2 ring-ink',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-pressed={isSelected}
        aria-label={`Page ${page + 1}`}
        title="Double-click to preview, drag to move"
        onClick={(e) => e.detail < 2 && onToggle()}
        // double-click undoes the first click's pick and opens the preview instead
        onDoubleClick={() => {
          onToggle();
          onOpen();
        }}
        className="relative block aspect-[3/4] w-full cursor-grab overflow-hidden rounded-[14px] bg-subtle active:cursor-grabbing"
      >
        {preview ? (
          <img src={preview} alt="" draggable={false} className={cn('size-full select-none object-contain transition-opacity', dim && 'opacity-60')} />
        ) : (
          <FileText size={36} strokeWidth={1.2} className="absolute inset-0 m-auto text-ink/20" />
        )}
        <span
          className={cn(
            'absolute right-2 top-2 grid size-6 place-items-center rounded-full border-2 transition-colors',
            isSelected ? 'border-ink bg-ink text-canvas' : 'border-ink/25 bg-canvas/90',
          )}
        >
          {isSelected && <Check size={14} strokeWidth={3} />}
        </span>
      </button>
      <div className="flex items-center justify-between pl-1.5 pt-1.5">
        <span className={cn('text-[13px] tabular-nums', isSelected ? 'font-medium' : 'text-ink/60')}>Page {page + 1}</span>
        <IconButton label={`Preview page ${page + 1}`} size="sm" onClick={onOpen}>
          <Eye size={16} />
        </IconButton>
      </div>
    </div>
  );
}

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  // the pages as they're laid out, which is the order they go in the new pdf
  const [order, setOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const doc = useDocName(file?.name.replace(/\.pdf$/i, '') ?? 'document');
  useReportWork(tool.id, !!file);

  const onDrop = useCallback(async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setLoading(true);
    setFile(picked);
    setSelected([]);
    try {
      const meta = await getPdfMetadata(picked);
      setPageCount(meta.pageCount);
      setOrder(Array.from({ length: meta.pageCount }, (_, i) => i));
      setPreviews(meta.previews);
    } catch (err) {
      console.error('PDF processing error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const dropzone = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: false });

  // pages drag into a new order, after a press and hold on touch screens
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder((prev) => arrayMove(prev, prev.indexOf(active.id as number), prev.indexOf(over.id as number)));
  };

  // sharp page renders for the full screen preview
  const renderPage = useCallback(
    async (index: number, width: number, height: number) => {
      if (!file) throw new Error('No file open');
      return (await renderPageImage(file, order[index], width, height)).url;
    },
    [file, order],
  );

  const toggle = (index: number) =>
    setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)));

  const addRange = (e: FormEvent) => {
    e.preventDefault();
    const start = parseInt(range.from) - 1;
    const end = parseInt(range.to) - 1;
    if (isNaN(start) || isNaN(end) || start < 0 || end >= pageCount || start > end) return;
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    setSelected((prev) => Array.from(new Set([...prev, ...pages])).sort((a, b) => a - b));
    setRange({ from: '', to: '' });
  };

  const extract = async (fileName: string) => {
    if (!file || selected.length === 0) return;
    setSaving(true);
    try {
      const bytes = await extractPdfPages(file, kept);
      saveAs(new Blob([bytes], { type: 'application/pdf' }), fileName);
    } catch (err) {
      console.error('Split error', err);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    closePdf(file);
    setFile(null);
    setPreviews([]);
    setPageCount(0);
    setSelected([]);
    setOrder([]);
    doc.forget();
  };

  if (!file) {
    return (
      <ToolShell tool={tool}>
        <UploadCard
          tool={tool}
          dropzone={dropzone}
          title="Choose a PDF"
          hint="Drag and drop a PDF here, or choose one from your device. You’ll pick the pages next."
          button="Choose PDF"
          formats="PDF files"
        />
      </ToolShell>
    );
  }

  const count = selected.length;
  const kept = order.filter((page) => selected.includes(page));
  const rangeField =
    'h-10 w-full min-w-0 rounded-[12px] border border-line bg-canvas px-3 text-[14px] tabular-nums outline-none transition-colors focus:border-ink';

  return (
    <ToolShell tool={tool} doc={{ name: doc.name, onRename: doc.rename, onChange: reset }} onDelete={saving ? undefined : reset} what="this PDF">
      <Workbench
        panel={
          <Panel
            title="Pages to keep"
            footer={
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={count === 0 || saving}
                onClick={() => doc.download(extract, `split-${file.name.replace(/\.pdf$/i, '')}`)}
              >
                {saving ? <Spinner className="size-[18px]" /> : <Download size={18} />}
                {count ? `Extract ${count} ${count === 1 ? 'page' : 'pages'}` : 'Extract pages'}
              </Button>
            }
          >
            <div className="mt-4 flex gap-2">
              <Button size="sm" disabled={!pageCount} onClick={() => setSelected(Array.from({ length: pageCount }, (_, i) => i))}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" disabled={!count} onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>

            <form onSubmit={addRange} className="mt-6">
              <p className="text-[14px] font-medium">Add a range</p>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={pageCount || undefined}
                  inputMode="numeric"
                  placeholder="From"
                  aria-label="From page"
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  className={rangeField}
                />
                <span className="text-ink/35">–</span>
                <input
                  type="number"
                  min={1}
                  max={pageCount || undefined}
                  inputMode="numeric"
                  placeholder="To"
                  aria-label="To page"
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  className={rangeField}
                />
                <Button type="submit" variant="outline" className="h-10 px-4">
                  Add
                </Button>
              </div>
            </form>

            <div className="mt-6 border-t border-line pt-5">
              <p className="text-[14px] font-medium">{count ? `${count} selected` : 'No pages selected yet'}</p>
              {count > 0 && <p className="mt-1 text-[14px] leading-relaxed text-ink/60">Pages {describePages(kept)}</p>}
              <p className="mt-3 text-[13px] leading-relaxed text-ink/45">The new PDF has the pages in the order they’re shown, at full quality. Drag a page to move it.</p>
            </div>
          </Panel>
        }
      >
        <p className="px-1 pb-3 text-[14px] text-ink/55">
          {loading ? formatSize(file.size) : `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${formatSize(file.size)}`}. Tap the pages you want to keep, and drag one to move it.
        </p>

        {loading ? (
          <div role="status" className="flex flex-col items-center justify-center gap-4 rounded-[24px] bg-card py-24 text-[15px] text-ink/60">
            <Spinner className="size-7" />
            Loading pages…
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {order.map((page, place) => (
                  <PageTile
                    key={page}
                    page={page}
                    preview={previews[page]}
                    isSelected={selected.includes(page)}
                    dim={!selected.includes(page) && count > 0}
                    onToggle={() => toggle(page)}
                    onOpen={() => setViewing(place)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Workbench>

      <PageViewer
        previews={order.map((page) => previews[page])}
        count={pageCount}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        selected={viewing !== null && selected.includes(order[viewing])}
        onToggle={() => viewing !== null && toggle(order[viewing])}
        renderPage={renderPage}
      />

      <NameDialog {...doc.dialog} />
    </ToolShell>
  );
}
