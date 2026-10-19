import { useCallback, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Eye, FilePlus2, Merge, Trash2, X } from 'lucide-react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { saveAs } from 'file-saver';
import {
  Button,
  formatSize,
  IconButton,
  NameDialog,
  PageViewer,
  Panel,
  Row,
  Spinner,
  ToolShell,
  UploadCard,
  Workbench,
} from '@/components/toolkit';
import { closePdf } from '@/lib/pdfjs';
import { getPdfCover, mergePdfs, renderPageImage, UnreadablePdfError } from '@/lib/pdfUtils';
import { getTool } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

type PdfItem = { id: string; file: File; pageCount: number; cover?: string; pending?: boolean };

const tool = getTool('merge-pdf');
const newId = () => Math.random().toString(36).substring(7);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function PdfCard({ item, index, onRemove, onPreview }: { item: PdfItem; index: number; onRemove: () => void; onPreview: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
      className={cn(
        'relative flex flex-col rounded-[20px] bg-card p-2 transition-shadow',
        isDragging ? 'shadow-2xl ring-2 ring-ink' : 'hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]',
      )}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`${index + 1}. ${item.file.name}${item.pending ? '' : `, ${plural(item.pageCount, 'page')}`}. Drag to reorder.`}
        title={item.pending ? undefined : 'Double-click to preview'}
        onDoubleClick={item.pending ? undefined : onPreview}
        className="relative aspect-[4/5] cursor-grab overflow-hidden rounded-[14px] bg-subtle active:cursor-grabbing"
      >
        {item.pending ? (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner className="size-5 text-ink/40" />
          </span>
        ) : (
          <img src={item.cover} alt="" draggable={false} className="size-full select-none object-contain p-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.18)]" />
        )}
        <span className="absolute left-2 top-2 min-w-6 rounded-full bg-ink px-2 py-0.5 text-center text-[12px] font-medium tabular-nums text-canvas">
          {index + 1}
        </span>
        {!item.pending && (
          <span className="absolute bottom-2 right-2 rounded-full bg-canvas/95 px-2 py-0.5 text-[12px] tabular-nums text-ink/70 shadow-sm">
            {plural(item.pageCount, 'page')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 pl-1.5 pt-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink/65" title={item.file.name}>
          {item.file.name}
        </span>
        <IconButton label="Preview" size="sm" disabled={item.pending} onClick={onPreview}>
          <Eye size={16} />
        </IconButton>
        <IconButton label="Remove" size="sm" onClick={onRemove}>
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}

export default function MergePdf() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<PdfItem | null>(null);
  const [page, setPage] = useState<number | null>(null);
  useReportWork(tool.id, items.length > 0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // cards show up straight away in the order picked, then each pdf is opened one at a time
  const reading = useRef(Promise.resolve());
  const alive = useRef(new Set<string>());

  const onDrop = (accepted: File[], rejections: FileRejection[] = []) => {
    setUnreadable(rejections.map((r) => r.file.name));
    setMergeError(null);
    const added = accepted.map((file) => ({ id: newId(), file, pageCount: 0, pending: true }));
    added.forEach((item) => alive.current.add(item.id));
    setItems((prev) => [...prev, ...added]);

    for (const item of added) {
      reading.current = reading.current.then(async () => {
        if (!alive.current.has(item.id)) return;
        try {
          const { pageCount, cover, locked } = await getPdfCover(item.file);
          if (locked) throw new Error('PDF is encrypted');
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pageCount, cover, pending: false } : i)));
        } catch (err) {
          console.warn(`Could not use ${item.file.name}`, err);
          alive.current.delete(item.id);
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          setUnreadable((prev) => [...prev, item.file.name]);
        } finally {
          // the card only needs the cover, the preview opens it again if asked
          closePdf(item.file);
        }
      });
    }
  };

  const dropzone = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: true });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((prev) => arrayMove(prev, prev.findIndex((i) => i.id === active.id), prev.findIndex((i) => i.id === over.id)));
  };

  const remove = (id: string) => {
    alive.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setMergeError(null);
  };

  const startOver = () => {
    alive.current.clear();
    setItems([]);
    setUnreadable([]);
    setMergeError(null);
  };

  const preview = (item: PdfItem) => {
    setPreviewing(item);
    setPage(0);
  };

  const closePreview = () => {
    closePdf(previewing?.file ?? null);
    setPreviewing(null);
    setPage(null);
  };

  // sharp page renders for the full screen preview
  const renderPage = useCallback(
    async (index: number, width: number, height: number) => {
      if (!previewing) throw new Error('No file open');
      return (await renderPageImage(previewing.file, index, width, height)).url;
    },
    [previewing],
  );

  const merge = async (fileName: string) => {
    setMergeError(null);
    setProgress({ current: 0, total: items.length });
    try {
      const bytes = await mergePdfs(
        items.map((item) => item.file),
        (current, total) => setProgress({ current, total }),
      );
      saveAs(new Blob([bytes], { type: 'application/pdf' }), fileName);
    } catch (err) {
      console.error('Merge error', err);
      setMergeError(
        err instanceof UnreadablePdfError
          ? `We couldn’t read ${err.fileName}. Remove it and try again.`
          : 'Something went wrong while merging. Please try again.',
      );
    } finally {
      setProgress(null);
    }
  };

  const unreadableNotice = unreadable.length > 0 && (
    <div role="alert" className="mb-3 flex items-start gap-3 rounded-[16px] bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-700">
      <span className="min-w-0 flex-1">
        Couldn’t add {unreadable.join(', ')}. Only PDFs that aren’t damaged or password-protected can be merged.
      </span>
      <IconButton label="Dismiss" size="sm" onClick={() => setUnreadable([])} className="-my-1 text-red-700 hover:bg-red-100 hover:text-red-800">
        <X size={16} />
      </IconButton>
    </div>
  );

  if (items.length === 0) {
    return (
      <ToolShell tool={tool}>
        {unreadableNotice && <div className="mx-auto -mb-6 w-full max-w-2xl px-4 pt-6 sm:-mb-10 sm:pt-10">{unreadableNotice}</div>}
        <UploadCard
          tool={tool}
          dropzone={dropzone}
          title="Choose the PDFs to merge"
          hint="Drag and drop two or more PDFs here, or choose them from your device. You can put them in order next."
          button="Choose PDFs"
          formats="PDF files"
        />
      </ToolShell>
    );
  }

  const opening = items.filter((item) => item.pending).length;
  const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  return (
    <ToolShell tool={tool}>
      <Workbench
        panel={
          <Panel
            title="Merged PDF"
            footer={
              progress ? (
                <div role="status" className="px-1">
                  <div className="flex justify-between text-[14px]">
                    <span className="font-medium">Merging your PDFs…</span>
                    <span className="tabular-nums text-ink/55">
                      {progress.current} of {progress.total}
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-ink transition-[width] duration-200"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={items.length < 2 || opening > 0}
                  onClick={() => setSuggestedName(`${items[0].file.name.replace(/\.pdf$/i, '')}-merged`)}
                >
                  <Merge size={18} />
                  {items.length < 2 ? 'Merge PDFs' : `Merge ${plural(items.length, 'PDF')}`}
                </Button>
              )
            }
          >
            <dl className="mt-5 space-y-2.5 text-[14px]">
              <Row label="Files" value={items.length} />
              <Row label="Total pages" value={opening ? '…' : totalPages} />
              <Row label="Total size" value={formatSize(totalBytes)} />
            </dl>
            {items.length < 2 && <p className="mt-5 rounded-[14px] bg-subtle px-4 py-3 text-[13px] text-ink/60">Add at least one more PDF to merge.</p>}
            {mergeError && (
              <p role="alert" className="mt-5 rounded-[14px] bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
                {mergeError}
              </p>
            )}
            <p className="mt-5 border-t border-line pt-5 text-[13px] leading-relaxed text-ink/45">
              Files are joined in the order shown. Every page is copied as it is, at full quality.
            </p>
          </Panel>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3 px-1 pb-4 pt-1">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{plural(items.length, 'PDF')}</h2>
            <p className="mt-0.5 text-[14px] text-ink/55">Drag to change the order.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={startOver} disabled={!!progress}>
              Start over
            </Button>
            <Button variant="outline" onClick={dropzone.open} disabled={!!progress}>
              <FilePlus2 size={18} />
              Add PDFs
            </Button>
          </div>
        </div>

        {unreadableNotice}
        {opening > 0 && (
          <div role="status" className="mb-3 flex items-center gap-3 rounded-[20px] bg-card px-4 py-3 text-[14px]">
            <Spinner className="size-4" />
            Opening {plural(opening, 'PDF')}…
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item, index) => (
                <PdfCard key={item.id} item={item} index={index} onRemove={() => remove(item.id)} onPreview={() => preview(item)} />
              ))}
              <div
                {...dropzone.getRootProps({
                  className: cn(
                    'flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed text-ink/55 transition-colors',
                    dropzone.isDragActive ? 'border-ink bg-card text-ink' : 'border-line hover:border-ink/25 hover:text-ink',
                  ),
                })}
              >
                <input {...dropzone.getInputProps()} />
                <FilePlus2 size={24} />
                <span className="text-[14px] font-medium">Add PDFs</span>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </Workbench>

      <PageViewer
        previews={previewing?.cover ? [previewing.cover] : []}
        count={previewing?.pageCount ?? 0}
        index={page}
        onIndex={setPage}
        onClose={closePreview}
        renderPage={renderPage}
      />

      <NameDialog
        suggested={suggestedName}
        onCancel={() => setSuggestedName(null)}
        onConfirm={(fileName) => {
          setSuggestedName(null);
          merge(fileName);
        }}
      />
    </ToolShell>
  );
}
