import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, FilePlus2, FileText, GripVertical, Merge, Trash2, X } from 'lucide-react';
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
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
import { getPdfInfo, mergePdfs, renderPageImage, UnreadablePdfError } from '@/lib/pdfUtils';
import { getTool } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

type PdfItem = { id: string; file: File; pageCount: number; pending?: boolean; collapsed?: boolean };
type Watch = (el: HTMLElement, key: string, file: File, page: number) => () => void;

const tool = getTool('merge-pdf');
const newId = () => Math.random().toString(36).substring(7);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const thumbKey = (id: string, page: number) => `${id}:${page}`;
const THUMB_WIDTH = 120;

// page thumbnails get drawn as they come near the screen, a big pdf never renders all its pages up front
function useThumbnails() {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // built once, so watch and forget stay the same functions
  const queue = useMemo(() => {
    const urls = new Map<string, string>();
    const waiting = new Map<string, { file: File; page: number }>();
    const started = new Set<string>();
    const nearScreen = new Set<string>();
    const targets = new Map<Element, { key: string; file: File; page: number }>();
    let running = 0;
    let frame = 0;

    // finished thumbnails land once per frame
    const publish = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), setThumbs(Object.fromEntries(urls))));
    };

    // two at a time, ones near the screen first, otherwise the latest asked for
    const pump = () => {
      while (running < 2 && waiting.size) {
        const keys = [...waiting.keys()];
        const key = keys.find((k) => nearScreen.has(k)) ?? keys[keys.length - 1];
        const { file, page } = waiting.get(key)!;
        waiting.delete(key);
        started.add(key);
        running++;
        renderPageImage(file, page, THUMB_WIDTH, Infinity, 'image/jpeg')
          .then(({ url }) => {
            // the file was removed while this page was drawing
            if (!started.has(key)) return URL.revokeObjectURL(url);
            urls.set(key, url);
            publish();
          })
          .catch((err) => console.warn('Thumbnail error', err))
          .finally(() => {
            running--;
            pump();
          });
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = targets.get(entry.target);
          if (!target) continue;
          const { key, file, page } = target;
          if (!entry.isIntersecting) {
            nearScreen.delete(key);
            continue;
          }
          nearScreen.add(key);
          if (!started.has(key) && !waiting.has(key)) waiting.set(key, { file, page });
        }
        pump();
      },
      { rootMargin: '400px 0px' },
    );

    const watch: Watch = (el, key, file, page) => {
      targets.set(el, { key, file, page });
      observer.observe(el);
      return () => {
        observer.unobserve(el);
        targets.delete(el);
        nearScreen.delete(key);
      };
    };

    const forget = (id: string) => {
      const mine = (key: string) => key.startsWith(`${id}:`);
      [...waiting.keys()].filter(mine).forEach((key) => waiting.delete(key));
      [...started].filter(mine).forEach((key) => started.delete(key));
      for (const [key, url] of urls) {
        if (!mine(key)) continue;
        URL.revokeObjectURL(url);
        urls.delete(key);
      }
      publish();
    };

    return { watch, forget };
  }, []);

  return { thumbs, ...queue };
}

const PageThumb = memo(function PageThumb({
  id,
  file,
  page,
  number,
  url,
  watch,
  onOpen,
  cover,
}: {
  id: string;
  file: File;
  page: number;
  number: number;
  url?: string;
  watch: Watch;
  onOpen: (index: number) => void;
  cover?: boolean; // the small first page in a file's header
}) {
  // only pages still waiting for a thumbnail need watching
  const ref = useCallback((el: HTMLButtonElement | null) => (el && !url ? watch(el, thumbKey(id, page), file, page) : undefined), [url, watch, id, file, page]);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`Preview page ${number}`}
      title={`Preview page ${number}`}
      onClick={() => onOpen(number - 1)}
      className={cn(
        'relative block aspect-[3/4] w-full overflow-hidden bg-subtle transition-shadow hover:shadow-[0_6px_18px_-10px_rgba(0,0,0,0.35)]',
        cover ? 'rounded-[6px]' : 'rounded-[12px]',
      )}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className={cn('size-full select-none object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]', cover ? 'p-0.5' : 'p-1.5')}
        />
      ) : (
        <FileText size={cover ? 16 : 22} strokeWidth={1.3} className="absolute inset-0 m-auto text-ink/20" />
      )}
      {!cover && (
        <span className="absolute bottom-1.5 left-1.5 min-w-5 rounded-full bg-ink px-1.5 py-px text-center text-[11px] font-medium tabular-nums text-canvas">
          {number}
        </span>
      )}
    </button>
  );
});

function PdfSection({
  item,
  index,
  start,
  thumbs,
  watch,
  onRemove,
  onToggle,
  onOpen,
}: {
  item: PdfItem;
  index: number;
  start: number; // where its first page lands in the merged pdf
  thumbs: Record<string, string>;
  watch: Watch;
  onRemove: () => void;
  onToggle: () => void;
  onOpen: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const { id, file, pageCount, pending, collapsed } = item;
  const range = pageCount === 1 ? `page ${start + 1}` : `pages ${start + 1}–${start + pageCount}`;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
      className={cn('relative rounded-[20px] bg-card p-2 sm:p-3', isDragging && 'shadow-2xl ring-2 ring-ink')}
    >
      <div className="flex items-center gap-1">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`${index + 1}. ${file.name}${pending ? '' : `, ${plural(pageCount, 'page')}`}. Drag to reorder.`}
          title="Drag to reorder"
          className="grid size-10 shrink-0 cursor-grab touch-none place-items-center rounded-full text-ink/40 transition-colors hover:bg-subtle hover:text-ink active:cursor-grabbing"
        >
          <GripVertical size={18} />
        </button>
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[12px] font-medium tabular-nums text-canvas">{index + 1}</span>
        <div className="ml-2 w-9 shrink-0">
          {pending ? (
            <div className="grid aspect-[3/4] place-items-center rounded-[6px] bg-subtle">
              <Spinner className="size-3.5 text-ink/40" />
            </div>
          ) : (
            <PageThumb cover id={id} file={file} page={0} number={start + 1} url={thumbs[thumbKey(id, 0)]} watch={watch} onOpen={onOpen} />
          )}
        </div>
        <div className="min-w-0 flex-1 pl-2">
          <p className="truncate text-[15px] font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-[13px] leading-snug text-ink/55">
            {pending ? (
              'Opening…'
            ) : (
              <>
                {plural(pageCount, 'page')} · {formatSize(file.size)}
                {/* phones show the merged page numbers on the pages instead */}
                <span className="hidden sm:inline"> · {range} of the merged PDF</span>
              </>
            )}
          </p>
        </div>
        <IconButton label={collapsed ? 'Show pages' : 'Hide pages'} aria-expanded={!collapsed} disabled={pending} onClick={onToggle}>
          <ChevronDown size={18} className={cn('transition-transform', !collapsed && 'rotate-180')} />
        </IconButton>
        <IconButton label="Remove" onClick={onRemove}>
          <Trash2 size={17} />
        </IconButton>
      </div>

      {!pending && !collapsed && (
        <div className="mt-2 grid grid-cols-3 gap-2 px-1 pb-1 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: pageCount }, (_, page) => (
            <PageThumb
              key={page}
              id={id}
              file={file}
              page={page}
              number={start + page + 1}
              url={thumbs[thumbKey(id, page)]}
              watch={watch}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function MergePdf() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const { thumbs, watch, forget } = useThumbnails();
  useReportWork(tool.id, items.length > 0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // files show up straight away in the order picked, then each one is opened in turn
  const reading = useRef(Promise.resolve());
  const alive = useRef(new Set<string>());

  const onDrop = (accepted: File[], rejections: FileRejection[] = []) => {
    setUnreadable(rejections.map((r) => r.file.name));
    setMergeError(null);
    // collapsed to start with, so the list reads as a list of files you can reorder
    const added = accepted.map((file) => ({ id: newId(), file, pageCount: 0, pending: true, collapsed: true }));
    added.forEach((item) => alive.current.add(item.id));
    setItems((prev) => [...prev, ...added]);

    for (const item of added) {
      reading.current = reading.current.then(async () => {
        if (!alive.current.has(item.id)) return;
        try {
          const { pageCount, locked } = await getPdfInfo(item.file);
          if (locked) throw new Error('PDF is encrypted');
          // stays open while it's in the list, the thumbnails and preview draw from it
          if (!alive.current.has(item.id)) return closePdf(item.file);
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pageCount, pending: false } : i)));
        } catch (err) {
          console.warn(`Could not use ${item.file.name}`, err);
          closePdf(item.file);
          alive.current.delete(item.id);
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          setUnreadable((prev) => [...prev, item.file.name]);
        }
      });
    }
  };

  const dropzone = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: true });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setItems((prev) => arrayMove(prev, prev.findIndex((i) => i.id === active.id), prev.findIndex((i) => i.id === over.id)));
  };

  const remove = (item: PdfItem) => {
    alive.current.delete(item.id);
    forget(item.id);
    closePdf(item.file);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setMergeError(null);
  };

  const startOver = () => {
    items.forEach((item) => {
      forget(item.id);
      closePdf(item.file);
    });
    alive.current.clear();
    setItems([]);
    setUnreadable([]);
    setMergeError(null);
  };

  const toggle = (id: string) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, collapsed: !i.collapsed } : i)));
  const anyOpen = items.some((i) => !i.pending && !i.collapsed);
  const toggleAll = () => setItems((prev) => prev.map((i) => ({ ...i, collapsed: anyOpen })));

  // every page of the merged pdf in order, so the preview can step through the whole result
  const pages = useMemo(() => items.filter((i) => !i.pending).flatMap((item) => Array.from({ length: item.pageCount }, (_, page) => ({ item, page }))), [items]);

  const renderPage = useCallback(
    async (index: number, width: number, height: number) => {
      const { item, page } = pages[index];
      return (await renderPageImage(item.file, page, width, height)).url;
    },
    [pages],
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
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  // where each file's first page lands in the merged pdf
  const starts = items.map((_, i) => items.slice(0, i).reduce((sum, item) => sum + item.pageCount, 0));

  return (
    <ToolShell tool={tool} onDelete={progress ? undefined : startOver} what="your PDFs">
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
              <Row label="Total pages" value={opening ? '…' : pages.length} />
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
            <p className="mt-0.5 text-[14px] text-ink/55">Drag to reorder. Open a file to see all its pages.</p>
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
        <div className="-mt-1 mb-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={toggleAll} disabled={!pages.length}>
            {anyOpen ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
            {anyOpen ? 'Collapse all' : 'Expand all'}
          </Button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {items.map((item, index) => (
                <PdfSection
                  key={item.id}
                  item={item}
                  index={index}
                  start={starts[index]}
                  thumbs={thumbs}
                  watch={watch}
                  onRemove={() => remove(item)}
                  onToggle={() => toggle(item.id)}
                  onOpen={setViewing}
                />
              ))}
              <div
                {...dropzone.getRootProps({
                  className: cn(
                    'flex h-24 cursor-pointer items-center justify-center gap-2 rounded-[20px] border-2 border-dashed text-ink/55 transition-colors',
                    dropzone.isDragActive ? 'border-ink bg-card text-ink' : 'border-line hover:border-ink/25 hover:text-ink',
                  ),
                })}
              >
                <input {...dropzone.getInputProps()} />
                <FilePlus2 size={22} />
                <span className="text-[14px] font-medium">Add PDFs</span>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </Workbench>

      <PageViewer
        previews={pages.map(({ item, page }) => thumbs[thumbKey(item.id, page)])}
        count={pages.length}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
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
