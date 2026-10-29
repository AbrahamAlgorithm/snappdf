import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import { Download, Eye, FileText } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Button, FileRow, formatSize, NameDialog, PageViewer, Panel, Row, ToolShell, UploadCard, Workbench } from '@/components/toolkit';
import { closePdf } from '@/lib/pdfjs';
import { renderPageImage } from '@/lib/pdfUtils';
import { getTool } from '@/lib/site';
import { useReportWork } from '@/lib/work';
import type { WordPdf } from '@/lib/wordToPdf';

const tool = getTool('word-to-pdf');

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

export default function WordToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<WordPdf | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  // picking another file or starting over makes an unfinished conversion stale
  const job = useRef(0);
  useReportWork(tool.id, !!result);

  const convert = async (picked: File) => {
    const id = ++job.current;
    setProblem(null);
    setProgress('Reading your document…');
    try {
      // the layout engine and fonts only load once someone uses this tool
      const { wordToPdf } = await import('@/lib/wordToPdf');
      const made = await wordToPdf(picked, (message) => id === job.current && setProgress(message));
      if (id !== job.current) return;
      setFile(picked);
      setResult(made);
    } catch (err) {
      if (id !== job.current) return;
      console.error('Word to PDF error', err);
      setProblem('We couldn’t read this document. Check that it’s a Word file ending in .docx, then try again.');
    } finally {
      if (id === job.current) setProgress(null);
    }
  };

  const dropzone = useDropzone({
    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    multiple: false,
    disabled: !!progress,
    onDrop: (files) => files[0] && convert(files[0]),
    onDropRejected: ([rejected]) =>
      setProblem(
        /\.doc$/i.test(rejected?.file.name ?? '')
          ? 'That’s an older .doc file. Open it in Word or Google Docs, save it as .docx, then try again.'
          : 'Choose a Word document that ends in .docx.',
      ),
  });

  // thumbnails come in one at a time, so the first pages show up straight away
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (let i = 0; i < result.pages.length && !cancelled; i++) {
        try {
          const { url } = await renderPageImage(result.bytes, i, 260, Infinity, 'image/jpeg');
          if (cancelled) {
            URL.revokeObjectURL(url);
            break;
          }
          urls.push(url);
          setPreviews((prev) => {
            const next = [...prev];
            next[i] = url;
            return next;
          });
        } catch (err) {
          console.error('Page preview error', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      setPreviews([]);
      closePdf(result.bytes);
    };
  }, [result]);

  // sharp page renders for the full screen preview
  const renderPage = useCallback(
    async (index: number, width: number, height: number) => {
      if (!result) throw new Error('No PDF yet');
      return (await renderPageImage(result.bytes, index, width, height)).url;
    },
    [result],
  );

  const reset = () => {
    job.current++;
    setFile(null);
    setResult(null);
    setProblem(null);
    setProgress(null);
    setViewing(null);
  };

  if (!file || !result) {
    return (
      <ToolShell tool={tool}>
        <UploadCard
          tool={tool}
          dropzone={dropzone}
          title="Choose a Word document"
          hint="Drag and drop a .docx file here, or choose one from your device. You’ll see every page before you download."
          button="Choose document"
          formats="Word documents (.docx)"
          busy={progress}
          notice={problem}
        />
      </ToolShell>
    );
  }

  const count = result.pages.length;
  return (
    <ToolShell tool={tool} onDelete={reset} what="this document">
      <Workbench
        panel={
          <Panel
            title="Your PDF"
            footer={
              <Button variant="primary" size="lg" className="w-full" onClick={() => setSuggestedName(file.name.replace(/\.docx$/i, ''))}>
                <Download size={18} />
                Download PDF
              </Button>
            }
          >
            <dl className="mt-5 space-y-2.5 text-[14px]">
              <Row label="Pages" value={count} />
              <Row label="Page size" value={describeSize(result.pages)} />
              <Row label="PDF size" value={formatSize(result.bytes.length)} />
            </dl>
            {result.missingText && <Note>Emoji and some symbols or alphabets can’t go in the PDF yet, so they’re left out.</Note>}
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
        <FileRow name={file.name} meta={`${formatSize(file.size)} · ${count} ${count === 1 ? 'page' : 'pages'}`} onChange={reset} />
        <p className="px-1 pb-3 pt-5 text-[14px] text-ink/55">This is your PDF. Tap a page to see it full size.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {result.pages.map((page, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setViewing(i)}
              aria-label={`Preview page ${i + 1}`}
              className="group rounded-[20px] bg-card p-2 text-left transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]"
            >
              <span className="relative block w-full overflow-hidden rounded-[14px] bg-subtle" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                {previews[i] ? (
                  <img src={previews[i]} alt="" className="size-full object-contain" />
                ) : (
                  <FileText size={36} strokeWidth={1.2} className="absolute inset-0 m-auto text-ink/20" />
                )}
              </span>
              <span className="flex items-center justify-between pl-1.5 pr-1 pt-2">
                <span className="text-[13px] tabular-nums text-ink/60">Page {i + 1}</span>
                <Eye size={16} aria-hidden="true" className="text-ink/45 transition-colors group-hover:text-ink" />
              </span>
            </button>
          ))}
        </div>
      </Workbench>

      <PageViewer previews={previews} count={count} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} renderPage={renderPage} />

      <NameDialog
        suggested={suggestedName}
        onCancel={() => setSuggestedName(null)}
        onConfirm={(name) => {
          setSuggestedName(null);
          saveAs(new Blob([result.bytes], { type: 'application/pdf' }), name);
        }}
      />
    </ToolShell>
  );
}
