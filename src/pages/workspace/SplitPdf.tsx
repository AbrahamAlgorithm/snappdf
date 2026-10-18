import { useCallback, useState, type FormEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import { Check, Download, Eye, FileText } from 'lucide-react';
import { saveAs } from 'file-saver';
import {
  Button,
  FileRow,
  formatSize,
  IconButton,
  NameDialog,
  PageViewer,
  Panel,
  Spinner,
  ToolShell,
  UploadCard,
  Workbench,
} from '@/components/toolkit';
import { extractPdfPages, getPdfMetadata } from '@/lib/pdfUtils';
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

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
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
      setPreviews(meta.previews);
    } catch (err) {
      console.error('PDF processing error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const dropzone = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: false });

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
      const bytes = await extractPdfPages(file, selected);
      saveAs(new Blob([bytes], { type: 'application/pdf' }), fileName);
    } catch (err) {
      console.error('Split error', err);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreviews([]);
    setPageCount(0);
    setSelected([]);
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
  const rangeField =
    'h-10 w-full min-w-0 rounded-[12px] border border-line bg-canvas px-3 text-[14px] tabular-nums outline-none transition-colors focus:border-ink';

  return (
    <ToolShell tool={tool}>
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
                onClick={() => setSuggestedName(`split-${file.name.replace(/\.pdf$/i, '')}`)}
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
              {count > 0 && <p className="mt-1 text-[14px] leading-relaxed text-ink/60">Pages {describePages(selected)}</p>}
              <p className="mt-3 text-[13px] leading-relaxed text-ink/45">The new PDF keeps the pages in their original order, at full quality.</p>
            </div>
          </Panel>
        }
      >
        <FileRow
          name={file.name}
          meta={loading ? formatSize(file.size) : `${formatSize(file.size)} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`}
          onChange={reset}
        />
        <p className="px-1 pb-3 pt-5 text-[14px] text-ink/55">Tap the pages you want to keep.</p>

        {loading ? (
          <div role="status" className="flex flex-col items-center justify-center gap-4 rounded-[24px] bg-card py-24 text-[15px] text-ink/60">
            <Spinner className="size-7" />
            Loading pages…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: pageCount }, (_, i) => {
              const isSelected = selected.includes(i);
              return (
                <div
                  key={i}
                  className={cn(
                    'relative rounded-[20px] bg-card p-2 transition-shadow',
                    isSelected ? 'ring-2 ring-ink' : 'hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]',
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`Page ${i + 1}`}
                    onClick={() => toggle(i)}
                    className="relative block aspect-[3/4] w-full overflow-hidden rounded-[14px] bg-subtle"
                  >
                    {previews[i] ? (
                      <img src={previews[i]} alt="" className={cn('size-full object-contain transition-opacity', !isSelected && count > 0 && 'opacity-60')} />
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
                    <span className={cn('text-[13px] tabular-nums', isSelected ? 'font-medium' : 'text-ink/60')}>Page {i + 1}</span>
                    <IconButton label={`Preview page ${i + 1}`} size="sm" onClick={() => setViewing(i)}>
                      <Eye size={16} />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Workbench>

      <PageViewer
        previews={previews}
        count={pageCount}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        selected={viewing !== null && selected.includes(viewing)}
        onToggle={() => viewing !== null && toggle(viewing)}
      />

      <NameDialog
        suggested={suggestedName}
        onCancel={() => setSuggestedName(null)}
        onConfirm={(fileName) => {
          setSuggestedName(null);
          extract(fileName);
        }}
      />
    </ToolShell>
  );
}
