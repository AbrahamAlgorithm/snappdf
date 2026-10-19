import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Crop, Download, ImagePlus, RotateCw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
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
  Dialog,
  formatSize,
  IconButton,
  NameDialog,
  Panel,
  Row,
  Spinner,
  ToolShell,
  UploadCard,
  Workbench,
} from '@/components/toolkit';
import { isHeicFile, processFileForImageUpload } from '@/lib/heicUtils';
import { imagesToPdf } from '@/lib/pdfUtils';
import { getTool } from '@/lib/site';
import { cn, cropImage, imageToCanvas, rotateImage } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

type ImageData = {
  id: string;
  url: string; // full quality, used for the pdf
  thumb?: string; // small preview for the grid
  name: string;
  size: number;
  pending?: boolean; // still converting or making the preview
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

// previews are made a few at a time, so hundreds of photos never sit in memory at full size
const BATCH = 4;
const THUMB_WIDTH = 600;

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

const revoke = (img: ImageData) => {
  if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
  if (img.thumb) URL.revokeObjectURL(img.thumb);
};

function ImageCard({
  image,
  index,
  onRemove,
  onCrop,
  onRotate,
}: {
  image: ImageData;
  index: number;
  onRemove: () => void;
  onCrop: () => void;
  onRotate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });

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
        aria-label={`Page ${index + 1}: ${image.name}. Drag to reorder.`}
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
        <IconButton label="Rotate" size="sm" disabled={image.pending} onClick={onRotate}>
          <RotateCw size={16} />
        </IconButton>
        <IconButton label="Crop" size="sm" disabled={image.pending} onClick={onCrop}>
          <Crop size={16} />
        </IconButton>
        <IconButton label="Remove" size="sm" onClick={onRemove}>
          <Trash2 size={16} />
        </IconButton>
      </div>
    </div>
  );
}

export default function ImageToPdf() {
  const [images, setImages] = useState<ImageData[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [quality, setQuality] = useState(0.85);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);

  const [cropping, setCropping] = useState<ImageData | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  useReportWork(tool.id, images.length > 0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDrop = useCallback(async (accepted: File[], rejections: FileRejection[] = []) => {
    // some browsers give heic photos an empty or odd mime type, let them through
    const lookLikeImages = rejections
      .map((r) => r.file)
      .filter((file) => isHeicFile(file) || (file.type || '').startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|tiff|svg)$/i.test(file.name));
    const files = [...accepted, ...lookLikeImages];
    if (files.length === 0) return;

    // cards show up straight away, heic conversion and previews fill in a few at a time
    const queue = files.map((file) => ({ id: newId(), file }));
    setImages((prev) => [...prev, ...queue.map(({ id, file }) => ({ id, url: '', name: file.name, size: file.size, pending: true }))]);
    const label = files.some(isHeicFile) ? 'Converting photos' : 'Adding images';
    setBusy(`${label}… 0 of ${files.length}`);
    try {
      for (let i = 0; i < queue.length; i += BATCH) {
        const ready = await Promise.all(
          queue.slice(i, i + BATCH).map(async ({ id, file }) => {
            const converted = await processFileForImageUpload(file);
            return { id, url: URL.createObjectURL(converted), thumb: await makeThumb(converted), size: converted.size };
          }),
        );
        setImages((prev) => prev.map((img) => ({ ...img, ...ready.find((r) => r.id === img.id), pending: img.pending && !ready.some((r) => r.id === img.id) })));
        setBusy(`${label}… ${Math.min(i + BATCH, files.length)} of ${files.length}`);
      }
    } catch (err) {
      console.error('Error processing dropped images', err);
    } finally {
      setBusy(null);
    }
  }, []);

  const dropzone = useDropzone({ onDrop, accept: ACCEPT, multiple: true });

  const rotate = async (id: string) => {
    const img = images.find((i) => i.id === id);
    if (!img) return;
    try {
      const url = await rotateImage(await imageToCanvas(img.url), 90);
      const thumb = await makeThumb(url);
      if (img.thumb) URL.revokeObjectURL(img.thumb);
      setImages((prev) => prev.map((i) => (i.id === id ? { ...i, url, thumb } : i)));
    } catch (err) {
      console.error('Rotate error', err);
    }
  };

  const startOver = () => {
    images.forEach(revoke);
    setImages([]);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setImages((items) => arrayMove(items, items.findIndex((i) => i.id === active.id), items.findIndex((i) => i.id === over.id)));
  };

  const startCrop = (image: ImageData) => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropping(image);
  };

  const applyCrop = async () => {
    if (!cropping || !croppedAreaPixels) return;
    try {
      const url = await cropImage(cropping.url, croppedAreaPixels);
      const thumb = await makeThumb(url);
      if (cropping.thumb) URL.revokeObjectURL(cropping.thumb);
      setImages((prev) => prev.map((i) => (i.id === cropping.id ? { ...i, url, thumb } : i)));
      setCropping(null);
    } catch (err) {
      console.error('Crop error', err);
    }
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
        />
      </ToolShell>
    );
  }

  const totalBytes = images.reduce((sum, img) => sum + img.size, 0);

  return (
    <ToolShell tool={tool}>
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
                <Button variant="primary" size="lg" className="w-full" disabled={!!busy} onClick={() => setSuggestedName(`snap-pdf-${Date.now()}`)}>
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
          <SortableContext items={images} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {images.map((image, index) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  index={index}
                  onRemove={() => {
                    revoke(image);
                    setImages((prev) => prev.filter((i) => i.id !== image.id));
                  }}
                  onCrop={() => startCrop(image)}
                  onRotate={() => rotate(image.id)}
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
            </div>
          </SortableContext>
        </DndContext>
      </Workbench>

      <Dialog open={!!cropping} onClose={() => setCropping(null)} labelledBy="crop-title" className="max-w-3xl overflow-hidden p-0">
        {cropping && (
          <>
            <div className="flex items-center justify-between px-6 pb-4 pt-5">
              <h2 id="crop-title" className="text-[20px] font-semibold tracking-[-0.02em]">
                Crop image
              </h2>
              <IconButton label="Close" onClick={() => setCropping(null)}>
                <X size={20} />
              </IconButton>
            </div>
            <div className="relative h-[55vh] bg-[#18181b]">
              <Cropper
                image={cropping.url}
                crop={crop}
                zoom={zoom}
                onCropChange={setCrop}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                onZoomChange={setZoom}
              />
            </div>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:px-6">
              <div className="flex flex-1 items-center gap-3 text-ink/50">
                <ZoomOut size={18} aria-hidden="true" />
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  aria-label="Zoom"
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="min-w-0 flex-1 cursor-pointer accent-ink"
                />
                <ZoomIn size={18} aria-hidden="true" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCropping(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={applyCrop}>
                  Apply crop
                </Button>
              </div>
            </div>
          </>
        )}
      </Dialog>

      <NameDialog
        suggested={suggestedName}
        onCancel={() => setSuggestedName(null)}
        onConfirm={(fileName) => {
          setSuggestedName(null);
          generate(fileName);
        }}
      />
    </ToolShell>
  );
}
