import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FilePlus2, Merge, Trash2, X } from 'lucide-react';
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
  Panel,
  Row,
  Spinner,
  ToolShell,
  UploadCard,
  Workbench,
} from '@/src/components/toolkit';
import { getPdfCover, mergePdfs } from '@/src/lib/pdfUtils';
import { getTool } from '@/src/lib/site';
import { cn } from '@/src/lib/utils';

type PdfItem = { id: string; file: File; pageCount: number; cover: string };

const tool = getTool('merge-pdf');
const newId = () => Math.random().toString(36).substring(7);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function PdfCard({ item, index, onRemove }: { item: PdfItem; index: number; onRemove: () => void }) {
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
        aria-label={`${index + 1}. ${item.file.name}, ${plural(item.pageCount, 'page')}. Drag to reorder.`}
        className="relative aspect-[4/5] cursor-grab overflow-hidden rounded-[14px] bg-subtle active:cursor-grabbing"
      >
        <img src={item.cover} alt="" draggable={false} className="size-full select-none object-contain p-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.18)]" />
        <span className="absolute left-2 top-2 min-w-6 rounded-full bg-ink px-2 py-0.5 text-center text-[12px] font-medium tabular-nums text-canvas">
          {index + 1}
        </span>
        <span className="absolute bottom-2 right-2 rounded-full bg-canvas/95 px-2 py-0.5 text-[12px] tabular-nums text-ink/70 shadow-sm">
          {plural(item.pageCount, 'page')}
        </span>
      </div>
      <div className="flex items-center gap-0.5 pl-1.5 pt-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink/65" title={item.file.name}>
          {item.file.name}
        </span>
        <IconButton label="Remove" size="sm" onClick={onRemove}>
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}

export default function MergePdf() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [reading, setReading] = useState(0);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [mergeFailed, setMergeFailed] = useState(false);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Files are read one at a time so they join the list in the order they were picked.
  const onDrop = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUnreadable([]);
    setReading((n) => n + files.length);
    for (const file of files) {
      try {
        const { pageCount, cover } = await getPdfCover(file);
        setItems((prev) => [...prev, { id: newId(), file, pageCount, cover }]);
      } catch (err) {
        console.error('Could not open PDF', err);
        setUnreadable((prev) => [...prev, file.name]);
      } finally {
        setReading((n) => n - 1);
      }
    }
  }, []);

  const dropzone = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: true });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((prev) => arrayMove(prev, prev.findIndex((i) => i.id === active.id), prev.findIndex((i) => i.id === over.id)));
  };

  const merge = async (fileName: string) => {
    setMergeFailed(false);
    setProgress({ current: 0, total: items.length });
    try {
      const bytes = await mergePdfs(
        items.map((item) => item.file),
        (current, total) => setProgress({ current, total }),
      );
      saveAs(new Blob([bytes], { type: 'application/pdf' }), fileName);
    } catch (err) {
      console.error('Merge error', err);
      setMergeFailed(true);
    } finally {
      setProgress(null);
    }
  };

  const unreadableNotice = unreadable.length > 0 && (
    <div role="alert" className="mb-3 flex items-start gap-3 rounded-[16px] bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-700">
      <span className="min-w-0 flex-1">
        Couldn’t open {unreadable.join(', ')}. {unreadable.length === 1 ? 'It may be' : 'They may be'} damaged or password-protected.
      </span>
      <IconButton label="Dismiss" size="xs" onClick={() => setUnreadable([])} className="text-red-700 hover:bg-red-100 hover:text-red-800">
        <X size={14} />
      </IconButton>
    </div>
  );

  if (items.length === 0) {
    return (
      <ToolShell tool={tool}>
        <UploadCard
          notice={unreadableNotice}
          tool={tool}
          dropzone={dropzone}
          title="Choose the PDFs to merge"
          hint="Drag and drop two or more PDFs here, or choose them from your device. You can put them in order next."
          button="Choose PDFs"
          formats="PDF files"
          busy={reading ? `Opening ${plural(reading, 'PDF')}…` : null}
        />
      </ToolShell>
    );
  }

  const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const firstName = items[0].file.name.replace(/\.pdf$/i, '');

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
                    <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={items.length < 2 || reading > 0}
                  onClick={() => setSuggestedName(`${firstName}-merged`)}
                >
                  <Merge size={18} />
                  {items.length < 2 ? 'Merge PDFs' : `Merge ${plural(items.length, 'PDF')}`}
                </Button>
              )
            }
          >
            <dl className="mt-5 space-y-2.5 text-[14px]">
              <Row label="Files" value={items.length} />
              <Row label="Total pages" value={totalPages} />
              <Row label="Total size" value={formatSize(totalBytes)} />
            </dl>
            {items.length < 2 && <p className="mt-5 rounded-[14px] bg-subtle px-4 py-3 text-[13px] text-ink/60">Add at least one more PDF to merge.</p>}
            {mergeFailed && (
              <p role="alert" className="mt-5 rounded-[14px] bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
                We couldn’t merge these files. If one of them is password-protected, remove it and try again.
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
          <Button variant="outline" onClick={dropzone.open}>
            <FilePlus2 size={18} />
            Add PDFs
          </Button>
        </div>

        {unreadableNotice}
        {reading > 0 && (
          <div role="status" className="mb-3 flex items-center gap-3 rounded-[20px] bg-card px-4 py-3 text-[14px]">
            <Spinner className="size-4" />
            Opening {plural(reading, 'PDF')}…
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item, index) => (
                <PdfCard key={item.id} item={item} index={index} onRemove={() => setItems((prev) => prev.filter((i) => i.id !== item.id))} />
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
