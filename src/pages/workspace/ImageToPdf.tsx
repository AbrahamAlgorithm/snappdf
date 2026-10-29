import { memo, useCallback, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Camera, Crop, Download, ImagePlus, RotateCw, Trash2 } from 'lucide-react';
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
import { CornerEditor } from '@/components/CornerEditor';
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
  useDocName,
  Workbench,
} from '@/components/toolkit';
import { isHeicFile, processFileForImageUpload } from '@/lib/heicUtils';
import { imagesToPdf } from '@/lib/pdfUtils';
import { findPage, flattenPage, type Quad } from '@/lib/scan';
import { getTool } from '@/lib/site';
import { cn, imageToCanvas, rotateImage } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

type ImageData = {
  id: string;
  url: string; // full quality, used for the pdf
  thumb?: string; // small preview for the grid
  name: string;
  size: number;
  pending?: boolean; // still converting or making the preview
  photo?: Blob; // the image as it was added (heic already converted), crops always start from this
  corners?: Quad | null; // where the page sits in the photo, null for the whole photo
  turns?: number; // quarter turns clockwise, done after the crop
};

const tool = getTool('image-to-pdf');

const ACCEPT = {
  'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp', '.HEIC', '.HEIF', '.JPG', '.JPEG', '.PNG'],
  'image/heic': ['.heic', '.HEIC'],
  'image/heif': ['.heif', '.HEIF'],
  'image/x-heic': ['.heic', '.HEIC'],
  'application/octet-stream': ['.heic', '.HEIC', '.heif', '.HEIF'],
};

const newId = () => Math.random().toString(36).substring(7);

const THUMB_WIDTH = 600;

// phones and tablets get a button that opens the camera, desktops just pick files
const HAS_CAMERA = window.matchMedia('(pointer: coarse)').matches;

// previews made at once. past 4 each one gets slower and the first screen shows up later, low-memory phones get fewer
const WORKERS = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2, (navigator as { deviceMemory?: number }).deviceMemory ?? 8));

// small jpeg preview for a grid card, a 12mp photo per card would run a phone out of memory
async function makeThumb(source: Blob | string): Promise<string | undefined> {
  try {
    let bitmap: ImageBitmap | HTMLImageElement;
    if (typeof source === 'string') {
      bitmap = new Image();
      bitmap.src = source;
      await bitmap.decode();
    } else {
      bitmap = await createImageBitmap(source, { resizeWidth: THUMB_WIDTH, resizeQuality: 'medium' });
    }
    const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if ('close' in bitmap) bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    canvas.width = 0;
    canvas.height = 0;
    return blob ? URL.createObjectURL(blob) : undefined;
  } catch {
    return undefined;
  }
}

const revoke = (img: Pick<ImageData, 'url' | 'thumb'>) => {
  if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
  if (img.thumb) URL.revokeObjectURL(img.thumb);
};

type Job = { id: string; file: File; scan: boolean };
type Ready = Pick<ImageData, 'id' | 'url' | 'thumb' | 'size' | 'photo' | 'corners'>;

// heic gets converted, camera shots get cropped to the page and flattened, then a small preview is made
async function prepare({ id, file, scan }: Job): Promise<Ready> {
  try {
    const photo = await processFileForImageUpload(file);
    let page: Blob = photo;
    let corners: Quad | null = null;
    if (scan) {
      corners = await findPage(photo).catch(() => null);
      if (corners) page = await flattenPage(photo, corners);
    }
    return { id, url: URL.createObjectURL(page), thumb: await makeThumb(page), size: page.size, photo, corners };
  } catch {
    return { id, url: URL.createObjectURL(file), size: file.size, photo: file };
  }
}

// makes previews in the background: the first picks start straight away, cards on screen
// jump the queue, and finished previews land once per frame so a big batch doesn't stutter
function usePreviewQueue(setImages: Dispatch<SetStateAction<ImageData[]>>, setBusy: (text: string | null) => void) {
  // built once, so the queue and its methods are the same object on every render
  return useMemo(() => {
    let jobs: Job[] = [];
    const alive = new Set<string>();
    const onScreen = new Set<string>();
    const nearScreen = new Set<string>();
    const cards = new Map<string, Element>();
    const finished: Ready[] = [];
    const stats = { running: 0, done: 0, total: 0, label: '', frame: 0 };

    const track = (set: Set<string>) => (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.id;
        if (id && entry.isIntersecting) set.add(id);
        else if (id) set.delete(id);
      }
    };
    // cards on screen go first, then the ones about to scroll on
    const observers = [new IntersectionObserver(track(onScreen)), new IntersectionObserver(track(nearScreen), { rootMargin: '600px 0px' })];

    const flush = () => {
      stats.frame = 0;
      const ready = finished.splice(0).filter((r) => alive.has(r.id) || (revoke(r), false));
      if (ready.length) {
        const byId = new Map(ready.map((r) => [r.id, r]));
        for (const r of ready) {
          const card = cards.get(r.id);
          if (card) observers.forEach((o) => o.unobserve(card));
          cards.delete(r.id);
          onScreen.delete(r.id);
          nearScreen.delete(r.id);
        }
        setImages((prev) => prev.map((img) => (byId.has(img.id) ? { ...img, ...byId.get(img.id), pending: false } : img)));
      }
      if (stats.done >= stats.total) {
        stats.done = stats.total = 0;
        setBusy(null);
      } else {
        setBusy(`${stats.label}… ${stats.done} of ${stats.total}`);
      }
    };

    const schedule = () => {
      if (!stats.frame) stats.frame = requestAnimationFrame(flush);
    };

    const pump = () => {
      while (stats.running < WORKERS && jobs.length) {
        let next = jobs.findIndex((job) => onScreen.has(job.id));
        if (next < 0) next = jobs.findIndex((job) => nearScreen.has(job.id));
        const [job] = jobs.splice(Math.max(0, next), 1);
        stats.running++;
        prepare(job).then((ready) => {
          finished.push(ready);
          stats.running--;
          stats.done++;
          schedule();
          pump();
        });
      }
    };

    return {
      // scan: find the page in each photo and flatten it, for camera shots
      add(files: File[], scan = false) {
        const added = files.map((file) => ({ id: newId(), file, scan }));
        added.forEach((job) => alive.add(job.id));
        jobs.push(...added);
        stats.total += added.length;
        stats.label = files.some(isHeicFile) || stats.label === 'Converting photos' ? 'Converting photos' : 'Adding images';
        setImages((prev) => [...prev, ...added.map(({ id, file }) => ({ id, url: '', name: file.name, size: file.size, pending: true }))]);
        setBusy(`${stats.label}… ${stats.done} of ${stats.total}`);
        pump();
      },
      watch(el: HTMLElement | null, id: string) {
        if (!el || cards.get(id) === el) return;
        el.dataset.id = id;
        cards.set(id, el);
        observers.forEach((o) => o.observe(el));
      },
      forget(ids: string[]) {
        const gone = new Set(ids);
        for (const id of ids) {
          alive.delete(id);
          const card = cards.get(id);
          if (card) observers.forEach((o) => o.unobserve(card));
          cards.delete(id);
        }
        const waiting = jobs.length;
        jobs = jobs.filter((job) => !gone.has(job.id));
        stats.total -= waiting - jobs.length;
        schedule();
      },
    };
  }, [setImages, setBusy]);
}

// memo + stable callbacks, so when previews land only the cards that changed re-render
const ImageCard = memo(function ImageCard({
  image,
  index,
  onRemove,
  onCrop,
  onRotate,
  onOpen,
  watch,
}: {
  image: ImageData;
  index: number;
  onRemove: (id: string) => void;
  onCrop: (id: string) => void;
  onRotate: (id: string) => void;
  onOpen: (index: number) => void;
  watch: (el: HTMLElement | null, id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });
  const { id, pending } = image;
  const cardRef = useCallback(
    (el: HTMLElement | null) => {
      setNodeRef(el);
      if (pending) watch(el, id);
    },
    [setNodeRef, watch, id, pending],
  );

  return (
    <div
      ref={cardRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
      className={cn(
        'relative flex flex-col rounded-[20px] bg-card p-2 transition-shadow',
        isDragging ? 'shadow-2xl ring-2 ring-ink' : 'hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]',
      )}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`Page ${index + 1}: ${image.name}. Drag to reorder.`}
        title={pending ? undefined : 'Click to preview, drag to reorder'}
        // a tap opens the preview, dragging only starts once the pointer moves
        onClick={() => !pending && onOpen(index)}
        className="relative aspect-[4/5] cursor-grab overflow-hidden rounded-[14px] bg-subtle active:cursor-grabbing"
      >
        {image.pending ? (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner className="size-5 text-ink/40" />
          </span>
        ) : (
          <img
            src={image.thumb ?? image.url}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="size-full select-none object-contain p-2"
          />
        )}
        <span className="absolute left-2 top-2 min-w-6 rounded-full bg-ink px-2 py-0.5 text-center text-[12px] font-medium tabular-nums text-canvas">
          {index + 1}
        </span>
      </div>
      <div className="flex items-center gap-0.5 pl-1.5 pt-1.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink/65" title={image.name}>
          {image.name}
        </span>
        <IconButton label="Rotate" size="sm" disabled={pending} onClick={() => onRotate(id)}>
          <RotateCw size={16} />
        </IconButton>
        <IconButton label="Crop" size="sm" disabled={pending} onClick={() => onCrop(id)}>
          <Crop size={16} />
        </IconButton>
        <IconButton label="Remove" size="sm" onClick={() => onRemove(id)}>
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
});

export default function ImageToPdf() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [quality, setQuality] = useState(0.85);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  // named after the first picture, like the files people pick
  const doc = useDocName(images[0]?.name.replace(/\.[^.]+$/, '') || 'images');

  const [viewing, setViewing] = useState<number | null>(null);
  const [cropping, setCropping] = useState<{ id: string; src: string; photo: Blob; corners: Quad | null } | null>(null);
  useReportWork(tool.id, images.length > 0);
  const previews = usePreviewQueue(setImages, setBusy);

  // a click or tap opens the preview, so a drag only starts after the pointer moves a little
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDrop = (accepted: File[], rejections: FileRejection[] = []) => {
    // some browsers give heic photos an empty or odd mime type, let them through
    const lookLikeImages = rejections
      .map((r) => r.file)
      .filter((file) => isHeicFile(file) || (file.type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|tiff|svg)$/i.test(file.name));
    const files = [...accepted, ...lookLikeImages];
    if (files.length) previews.add(files);
  };

  const dropzone = useDropzone({ onDrop, accept: ACCEPT, multiple: true });

  // every camera shot comes back as "image.jpg", so number them instead
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoCount = useRef(0);
  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const photos = [...(e.target.files ?? [])].map(
      (file) => new File([file], `Photo ${++photoCount.current}${file.name.match(/\.\w+$/)?.[0] ?? '.jpg'}`, { type: file.type, lastModified: file.lastModified }),
    );
    e.target.value = '';
    if (photos.length) previews.add(photos, true);
  };
  const takePhoto = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    cameraInput.current?.click();
  };
  const cameraField = HAS_CAMERA && <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />;

  // card actions stay the same functions across renders and read the latest list from here
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const rotate = useCallback(async (id: string) => {
    const img = imagesRef.current.find((i) => i.id === id);
    if (!img) return;
    try {
      const url = await rotateImage(await imageToCanvas(img.url), 90);
      const thumb = await makeThumb(url);
      revoke(img);
      setImages((prev) => prev.map((i) => (i.id === id ? { ...i, url, thumb, turns: ((i.turns ?? 0) + 1) % 4 } : i)));
    } catch (err) {
      console.error('Rotate error', err);
    }
  }, []);

  const removeImage = useCallback(
    (id: string) => {
      const img = imagesRef.current.find((i) => i.id === id);
      previews.forget([id]);
      if (img) revoke(img);
      setImages((prev) => prev.filter((i) => i.id !== id));
    },
    [previews],
  );

  const startOver = () => {
    previews.forget(images.map((img) => img.id));
    images.forEach(revoke);
    setImages([]);
    doc.forget();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setImages((items) => arrayMove(items, items.findIndex((i) => i.id === active.id), items.findIndex((i) => i.id === over.id)));
  };

  // the crop always works on the photo as it was added, so a page cut too tight can be widened again
  const startCrop = useCallback((id: string) => {
    const img = imagesRef.current.find((i) => i.id === id);
    if (!img?.photo) return;
    setCropping({ id, src: URL.createObjectURL(img.photo), photo: img.photo, corners: img.corners ?? null });
  }, []);

  const closeCrop = () => {
    if (cropping) URL.revokeObjectURL(cropping.src);
    setCropping(null);
  };

  // the drag list only cares about the order, not about previews landing
  const order = images.map((img) => img.id).join(',');
  const ids = useMemo(() => (order ? order.split(',') : []), [order]);

  const applyCrop = async (corners: Quad | null) => {
    const img = cropping && imagesRef.current.find((i) => i.id === cropping.id);
    if (!img?.photo) return closeCrop();
    try {
      const page = corners ? await flattenPage(img.photo, corners) : img.photo;
      let url = URL.createObjectURL(page);
      // turned pages stay turned
      if (img.turns) {
        const turned = await rotateImage(await imageToCanvas(url), 90 * img.turns);
        URL.revokeObjectURL(url);
        url = turned;
      }
      const thumb = await makeThumb(url);
      revoke(img);
      setImages((prev) => prev.map((i) => (i.id === img.id ? { ...i, url, thumb, corners, size: page.size } : i)));
    } catch (err) {
      console.error('Crop error', err);
    }
    closeCrop();
  };

  const generate = async (fileName: string) => {
    setProgress({ current: 0, total: images.length });
    try {
      const bytes = await imagesToPdf(images, quality, (current, total) => setProgress({ current, total }));
      saveAs(new Blob([bytes], { type: 'application/pdf' }), fileName);
    } catch (err) {
      console.error('PDF generation error', err);
    } finally {
      setProgress(null);
    }
  };

  if (images.length === 0) {
    return (
      <ToolShell tool={tool}>
        <UploadCard
          tool={tool}
          dropzone={dropzone}
          title="Add your images"
          hint="Drag and drop photos, screenshots or scans here, or choose them from your device."
          button="Choose images"
          formats="JPG, PNG, HEIC, WEBP, GIF and BMP"
          busy={busy}
          extra={
            HAS_CAMERA && (
              <Button variant="outline" size="lg" onClick={takePhoto}>
                <Camera size={18} />
                Take photo
              </Button>
            )
          }
        />
        {cameraField}
      </ToolShell>
    );
  }

  const totalBytes = images.reduce((sum, img) => sum + img.size, 0);

  return (
    <ToolShell tool={tool} doc={{ name: doc.name, onRename: doc.rename }} onDelete={busy || progress ? undefined : startOver} what="your images">
      <Workbench
        panel={
          <Panel
            title="PDF settings"
            footer={
              progress ? (
                <div role="status" className="px-1">
                  <div className="flex justify-between text-[14px]">
                    <span className="font-medium">Creating your PDF…</span>
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
                <Button variant="primary" size="lg" className="w-full" disabled={!!busy} onClick={() => doc.download(generate)}>
                  <Download size={18} />
                  Create PDF
                </Button>
              )
            }
          >
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="pdf-quality" className="text-[14px] font-medium">
                  Image quality
                </label>
                <span className="text-[14px] tabular-nums text-ink/60">{Math.round(quality * 100)}%</span>
              </div>
              <input
                id="pdf-quality"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="mt-3 w-full cursor-pointer accent-ink"
              />
              <div className="mt-1 flex justify-between text-[12px] text-ink/45">
                <span>Smaller file</span>
                <span>Sharper</span>
              </div>
            </div>
            <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-[14px]">
              <Row label="Pages" value={images.length} />
              <Row label="Page size" value="A4, portrait" />
              <Row label="Original size" value={formatSize(totalBytes)} />
              <Row label="Estimated PDF" value={`about ${formatSize(totalBytes * quality * 0.7)}`} />
            </dl>
          </Panel>
        }
      >
        <div className="flex flex-wrap items-end justify-between gap-3 px-1 pb-4 pt-1">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">
              {images.length} {images.length === 1 ? 'image' : 'images'}
            </h2>
            <p className="mt-0.5 text-[14px] text-ink/55">Drag to change the page order.</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={startOver} disabled={!!busy || !!progress}>
              Start over
            </Button>
            <Button variant="outline" onClick={dropzone.open} disabled={!!busy}>
              <ImagePlus size={18} />
              Add images
            </Button>
          </div>
        </div>

        {busy && (
          <div role="status" className="mb-3 flex items-center gap-3 rounded-[20px] bg-card px-4 py-3 text-[14px]">
            <Spinner className="size-4" />
            {busy}
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {images.map((image, index) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  index={index}
                  onRemove={removeImage}
                  onCrop={startCrop}
                  onRotate={rotate}
                  onOpen={setViewing}
                  watch={previews.watch}
                />
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
                <ImagePlus size={24} />
                <span className="text-[14px] font-medium">Add images</span>
              </div>
              {/* at the end of the grid, so scanning page after page is one tap each */}
              {HAS_CAMERA && (
                <button
                  type="button"
                  onClick={takePhoto}
                  className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-line text-ink/55 transition-colors hover:border-ink/25 hover:text-ink"
                >
                  <Camera size={24} />
                  <span className="text-[14px] font-medium">Take photo</span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
        {cameraField}
      </Workbench>

      <PageViewer
        previews={images.map((img) => img.url)}
        count={images.length}
        index={viewing !== null && viewing < images.length ? viewing : null}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />

      <CornerEditor
        src={cropping?.src ?? null}
        corners={cropping?.corners ?? null}
        onDetect={() => (cropping ? findPage(cropping.photo) : Promise.resolve(null))}
        onCancel={closeCrop}
        onApply={applyCrop}
      />

      <NameDialog {...doc.dialog} />
    </ToolShell>
  );
}
