import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AlertTriangle, Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import { PDFDocument } from 'pdf-lib';
import { Button, formatSize, NameDialog, Panel, Spinner, ToolShell, UploadCard, useDocName, Workbench } from '@/components/toolkit';
import { buildPdfFromJpegs, ATTEMPTS, chooseSmaller, fitToTarget, lightCompress, MB, savedPercent, type Attempt } from '@/lib/compressPdf';
import { closePdf } from '@/lib/pdfjs';
import { renderPageImage } from '@/lib/pdfUtils';
import { getTool } from '@/lib/site';
import { useReportWork } from '@/lib/work';

const tool = getTool('compress-pdf');

type Mode = 'light' | 'strong' | 'target';
type Progress = { page: number; total: number };
type Result = { bytes: Uint8Array; fits: boolean };
type Plan = { kind: 'fixed'; quality: number; scale: number } | { kind: 'target'; bytes: number };

const MODES: { id: Mode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'strong', label: 'Strong' },
  { id: 'target', label: 'Target size' },
];
const PRESETS = ['1', '2', '5', 'custom'];
const MAX_SIDE = 2000;
const BASE_SCALE = 1.5;
const SAFETY = 0.96;
const BASE_OVERHEAD = 4096;
const PAGE_OVERHEAD = 1024;

async function loadImage(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

async function encodeImage(img: HTMLImageElement, quality: number, grayscale: boolean, ratio: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (grayscale) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(data, 0, 0);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error('JPEG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

async function pageSizes(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPages().map((page) => {
    const { width, height } = page.getSize();
    return page.getRotation().angle % 180 === 0 ? { width, height } : { width: height, height: width };
  });
}

// one pass, one page at a time: each page gets a share of the size budget and is fitted to it right away
async function compressPages(
  file: File,
  sizes: { width: number; height: number }[],
  plan: Plan,
  grayscale: boolean,
  onPage: (page: number) => void,
) {
  const total = sizes.length;
  const reserve = BASE_OVERHEAD + PAGE_OVERHEAD * total;
  const pages: { jpeg: Uint8Array; width: number; height: number }[] = [];
  let used = 0;
  for (let i = 0; i < total; i++) {
    const { width, height } = sizes[i];
    const k = Math.min(BASE_SCALE, MAX_SIDE / Math.max(width, height));
    const { url } = await renderPageImage(file, i, Math.round(width * k), Math.round(height * k));
    const img = await loadImage(url);
    let jpeg: Uint8Array;
    if (plan.kind === 'fixed') {
      jpeg = await encodeImage(img, plan.quality, grayscale, Math.min(1, plan.scale / BASE_SCALE));
    } else {
      const budget = Math.max(1000, (plan.bytes * SAFETY - reserve - used) / (total - i));
      const fit = await fitToTarget(
        budget,
        (a: Attempt) => encodeImage(img, a.quality, grayscale, Math.min(1, a.scale / BASE_SCALE)),
        ATTEMPTS,
      );
      jpeg = fit.bytes;
    }
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    used += jpeg.length;
    pages.push({ jpeg, width, height });
    onPage(i + 1);
  }
  return buildPdfFromJpegs(pages);
}

export default function CompressPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('target');
  const [quality, setQuality] = useState(0.6);
  const [preset, setPreset] = useState('2');
  const [custom, setCustom] = useState('');
  const [grayscale, setGrayscale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doc = useDocName(file?.name.replace(/\.pdf$/i, '') ?? 'document');
  useReportWork(tool.id, !!file);

  const onDrop = useCallback((files: File[]) => {
    if (!files[0]) return;
    setFile(files[0]);
    setResult(null);
    setError(null);
  }, []);

  const dropzone = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: false });

  const targetMb = parseFloat(preset === 'custom' ? custom : preset);
  const targetValid = mode !== 'target' || (targetMb > 0 && isFinite(targetMb));

  const run = async () => {
    if (!file || !targetValid) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const original = new Uint8Array(await file.arrayBuffer());
      let out: Uint8Array;
      let fits = true;
      if (mode === 'light') {
        out = await lightCompress(original);
      } else {
        const sizes = await pageSizes(original);
        const total = sizes.length;
        setProgress({ page: 0, total });
        const onPage = (page: number) => setProgress({ page, total });
        if (mode === 'strong') {
          out = await compressPages(file, sizes, { kind: 'fixed', quality, scale: 1.25 }, grayscale, onPage);
        } else {
          out = await compressPages(file, sizes, { kind: 'target', bytes: targetMb * MB }, grayscale, onPage);
          fits = out.length <= targetMb * MB;
        }
      }
      setResult({ bytes: chooseSmaller(original, out), fits });
    } catch (err) {
      console.error('Compress error', err);
      setError('Something went wrong while compressing this PDF. Try Light, or a different file.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const reset = () => {
    closePdf(file);
    setFile(null);
    setResult(null);
    setError(null);
    doc.forget();
  };

  const save = (fileName: string) => {
    if (result) saveAs(new Blob([result.bytes as BlobPart], { type: 'application/pdf' }), fileName);
  };

  if (!file) {
    return (
      <ToolShell tool={tool}>
        <UploadCard
          tool={tool}
          dropzone={dropzone}
          title="Choose a PDF"
          hint="Drag and drop a PDF here, or choose one from your device. You’ll pick how small to make it next."
          button="Choose PDF"
          formats="PDF files"
        />
      </ToolShell>
    );
  }

  const smaller = !!result && result.bytes.length < file.size;
  const fieldClass =
    'h-10 w-full min-w-0 rounded-[12px] border border-line bg-canvas px-3 text-[14px] tabular-nums outline-none transition-colors focus:border-ink';

  return (
    <ToolShell tool={tool} doc={{ name: doc.name, onRename: doc.rename, onChange: busy ? undefined : reset }} onDelete={busy ? undefined : reset} what="this PDF">
      <Workbench
        panel={
          <Panel
            title="Compression"
            footer={
              <Button variant="primary" size="lg" className="w-full" disabled={busy || !targetValid} onClick={run}>
                {busy ? <Spinner className="size-[18px]" /> : null}
                {busy ? 'Compressing…' : 'Compress PDF'}
              </Button>
            }
          >
            <div className="mt-4 flex flex-wrap gap-2">
              {MODES.map((m) => (
                <Button key={m.id} size="sm" variant={mode === m.id ? 'primary' : 'outline'} disabled={busy} onClick={() => setMode(m.id)}>
                  {m.label}
                </Button>
              ))}
            </div>

            {mode === 'light' && (
              <p className="mt-4 text-[13px] leading-relaxed text-ink/55">
                Re-saves the PDF without changing how it looks. Text stays selectable, but it often saves very little.
              </p>
            )}

            {mode === 'strong' && (
              <div className="mt-5">
                <label htmlFor="quality" className="text-[14px] font-medium">
                  Image quality: {Math.round(quality * 100)}%
                </label>
                <input
                  id="quality"
                  type="range"
                  min={0.2}
                  max={0.9}
                  step={0.05}
                  value={quality}
                  disabled={busy}
                  onChange={(e) => setQuality(parseFloat(e.target.value))}
                  className="mt-2 w-full"
                />
              </div>
            )}

            {mode === 'target' && (
              <div className="mt-5">
                <p className="text-[14px] font-medium">Make it smaller than</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <Button key={p} size="sm" variant={preset === p ? 'primary' : 'outline'} disabled={busy} onClick={() => setPreset(p)}>
                      {p === 'custom' ? 'Custom' : `${p} MB`}
                    </Button>
                  ))}
                </div>
                {preset === 'custom' && (
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    inputMode="decimal"
                    placeholder="Size in MB"
                    aria-label="Target size in MB"
                    value={custom}
                    disabled={busy}
                    onChange={(e) => setCustom(e.target.value)}
                    className={`${fieldClass} mt-3`}
                  />
                )}
              </div>
            )}

            {mode !== 'light' && (
              <>
                <label className="mt-5 flex items-center gap-2.5 text-[14px]">
                  <input type="checkbox" checked={grayscale} disabled={busy} onChange={(e) => setGrayscale(e.target.checked)} />
                  Grayscale (smaller scans)
                </label>
                <p className="mt-5 flex gap-2 rounded-[14px] bg-subtle p-3 text-[13px] leading-relaxed text-ink/70">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  This turns every page into an image. Selectable text, links and form fields will be removed.
                </p>
              </>
            )}
          </Panel>
        }
      >
        {!busy && !result && !error && (
          <div className="rounded-[24px] bg-card p-6">
            <p className="text-[13px] text-ink/50">Size now</p>
            <p className="mt-0.5 text-[20px] font-medium tabular-nums">{formatSize(file.size)}</p>
            <p className="mt-3 text-[14px] leading-relaxed text-ink/60">Choose how small to make it, then tap Compress PDF.</p>
          </div>
        )}

        {busy && progress && (
          <div role="status" className="mt-5 rounded-[24px] bg-card p-6 first:mt-0">
            <p className="text-[15px] font-medium">
              Compressing · Page {progress.page} of {progress.total}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-subtle">
              <div className="h-full bg-ink transition-all" style={{ width: `${(progress.page / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {busy && !progress && (
          <div role="status" className="mt-5 flex items-center gap-3 rounded-[24px] bg-card p-6 text-[15px] text-ink/60 first:mt-0">
            <Spinner className="size-5" />
            Compressing…
          </div>
        )}

        {error && <p className="mt-5 rounded-[24px] bg-card p-6 text-[15px] text-ink/70 first:mt-0">{error}</p>}

        {result && !busy && (
          <div className="mt-5 rounded-[24px] bg-card p-6 first:mt-0">
            <div className="flex items-center gap-6 tabular-nums">
              <div>
                <p className="text-[13px] text-ink/50">Before</p>
                <p className="text-[20px] font-medium">{formatSize(file.size)}</p>
              </div>
              <span className="text-ink/35">→</span>
              <div>
                <p className="text-[13px] text-ink/50">After</p>
                <p className="text-[20px] font-medium">{formatSize(result.bytes.length)}</p>
              </div>
              {smaller && <p className="ml-auto text-[15px] font-medium">−{savedPercent(file.size, result.bytes.length)}%</p>}
            </div>

            {!smaller && (
              <p className="mt-4 text-[14px] leading-relaxed text-ink/60">
                This method couldn’t make the file any smaller, so your original is kept. Try Strong or a target size.
              </p>
            )}
            {smaller && !result.fits && (
              <p className="mt-4 text-[14px] leading-relaxed text-ink/60">
                Couldn’t reach {targetMb} MB. This is the smallest result we could make.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => doc.download(save, `compressed-${file.name.replace(/\.pdf$/i, '')}`)}>
                <Download size={18} />
                {smaller ? 'Download compressed PDF' : 'Download original'}
              </Button>
              {smaller && (
                <Button variant="outline" onClick={() => saveAs(file, file.name)}>
                  Download original
                </Button>
              )}
            </div>
          </div>
        )}
      </Workbench>

      <NameDialog {...doc.dialog} />
    </ToolShell>
  );
}