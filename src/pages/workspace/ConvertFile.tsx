import { useCallback, useState } from 'react';
import { useDropzone, type Accept } from 'react-dropzone';
import { ArrowRight, Check, Download, Eye, Info } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Button, FileRow, formatSize, PageViewer, PrivacyNote, Spinner, ToolShell, UploadCard } from '@/components/toolkit';
import { csvToExcel, jsonToCsv, jsonToExcel } from '@/lib/convUtils';
import { closePdf } from '@/lib/pdfjs';
import { pdfToWord } from '@/lib/pdfToWord';
import { getPdfMetadata, renderPageImage } from '@/lib/pdfUtils';
import { getTool, type ToolId } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

export type ConvertMode = Extract<ToolId, 'pdf-to-word' | 'csv-to-excel' | 'json-to-excel' | 'json-to-csv'>;

type ModeConfig = {
  accept: Accept;
  input: RegExp;
  output: string;
  from: string;
  to: string;
  noun: string;
  formats: string;
  action: string;
  // scanned: pdf pages that had no text, so went into word as pictures
  convert: (file: File) => Promise<{ blob: Blob; scanned?: number[] }>;
};

const only = (convert: (file: File) => Promise<Blob>) => async (file: File) => ({ blob: await convert(file) });

// "Page 4 is a scan" / "Pages 2, 3 and 5 are scans"
function scannedNote(pages: number[], total: number) {
  if (pages.length === total) return 'This PDF is a scan, so every page went in as a picture you can’t edit.';
  const list = pages.length === 1 ? `Page ${pages[0]} is a scan` : `Pages ${pages.slice(0, -1).join(', ')} and ${pages.at(-1)} are scans`;
  return `${list}, so ${pages.length === 1 ? 'it' : 'they'} went in as ${pages.length === 1 ? 'a picture' : 'pictures'} you can’t edit.`;
}

const MODES: Record<ConvertMode, ModeConfig> = {
  'pdf-to-word': {
    accept: { 'application/pdf': ['.pdf'] },
    input: /\.pdf$/i,
    output: '.docx',
    from: 'PDF',
    to: 'Word (.docx)',
    noun: 'PDF',
    formats: 'PDF files',
    action: 'Convert to Word',
    convert: pdfToWord,
  },
  'csv-to-excel': {
    accept: { 'text/csv': ['.csv'] },
    input: /\.csv$/i,
    output: '.xlsx',
    from: 'CSV',
    to: 'Excel (.xlsx)',
    noun: 'CSV file',
    formats: 'CSV files',
    action: 'Convert to Excel',
    convert: only(csvToExcel),
  },
  'json-to-excel': {
    accept: { 'application/json': ['.json'] },
    input: /\.json$/i,
    output: '.xlsx',
    from: 'JSON',
    to: 'Excel (.xlsx)',
    noun: 'JSON file',
    formats: 'JSON files',
    action: 'Convert to Excel',
    convert: only(jsonToExcel),
  },
  'json-to-csv': {
    accept: { 'application/json': ['.json'] },
    input: /\.json$/i,
    output: '.csv',
    from: 'JSON',
    to: 'CSV',
    noun: 'JSON file',
    formats: 'JSON files',
    action: 'Convert to CSV',
    convert: only(jsonToCsv),
  },
};

export default function ConvertFile({ mode }: { mode: ConvertMode }) {
  const tool = getTool(mode);
  const config = MODES[mode];
  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [converting, setConverting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; name: string; scanned: number[] } | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  useReportWork(mode, !!file);

  const dropzone = useDropzone({
    accept: config.accept,
    multiple: false,
    onDrop: async (files) => {
      const picked = files[0];
      if (!picked) return;
      setFile(picked);
      setResult(null);
      setFailed(false);
      // keep page previews for pdf to word, so people can check the result
      if (mode === 'pdf-to-word' && picked.type === 'application/pdf') {
        try {
          const meta = await getPdfMetadata(picked);
          setPageCount(meta.pageCount);
          setPreviews(meta.previews);
        } catch (err) {
          console.error('PDF processing error', err);
        }
      }
    },
  });

  const convert = async () => {
    if (!file) return;
    setConverting(true);
    setFailed(false);
    try {
      const { blob, scanned = [] } = await config.convert(file);
      setResult({ blob, name: file.name.replace(config.input, '') + config.output, scanned });
    } catch (err) {
      console.error('Conversion error', err);
      setFailed(true);
    } finally {
      setConverting(false);
    }
  };

  // sharp page renders for the full screen preview
  const renderPage = useCallback(
    async (index: number, width: number, height: number) => {
      if (!file) throw new Error('No file open');
      return (await renderPageImage(file, index, width, height)).url;
    },
    [file],
  );

  const reset = () => {
    closePdf(file);
    setFile(null);
    setResult(null);
    setFailed(false);
    setPreviews([]);
    setPageCount(0);
  };

  if (!file) {
    return (
      <ToolShell tool={tool}>
        <UploadCard
          tool={tool}
          dropzone={dropzone}
          title={`Choose a ${config.noun}`}
          hint={`Drag and drop a ${config.noun} here, or choose one from your device.`}
          button={`Choose ${config.noun}`}
          formats={config.formats}
        />
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool}>
      <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
        <div className="rounded-[28px] bg-card p-5 sm:p-8">
          {result ? (
            <div className="text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#e7f6ec] text-[#1d8348]">
                <Check size={28} strokeWidth={2.5} />
              </span>
              <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Your file is ready</h2>
              <p className="mt-1.5 break-all text-[14px] text-ink/60">{result.name}</p>
              {result.scanned.length > 0 && (
                <p className="mx-auto mt-5 flex max-w-sm items-start gap-2.5 rounded-[16px] bg-subtle px-4 py-3 text-left text-[14px] leading-relaxed text-ink/70">
                  <Info size={17} className="mt-0.5 shrink-0" />
                  {scannedNote(result.scanned, pageCount || result.scanned.length)}
                </p>
              )}
              <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
                <Button variant="primary" size="lg" onClick={() => saveAs(result.blob, result.name)}>
                  <Download size={18} />
                  Download
                </Button>
                {mode === 'pdf-to-word' && previews.length > 0 && (
                  <Button size="lg" onClick={() => setViewing(0)}>
                    <Eye size={18} />
                    View original pages
                  </Button>
                )}
              </div>
              <Button variant="ghost" className="mt-3" onClick={reset}>
                Convert another file
              </Button>
            </div>
          ) : (
            <>
              <FileRow
                name={file.name}
                meta={pageCount ? `${formatSize(file.size)} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : formatSize(file.size)}
                onChange={reset}
                className="bg-subtle"
              />
              <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-line px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-ink/50">From</p>
                  <p className="mt-0.5 text-[15px] font-medium">{config.from}</p>
                </div>
                <ArrowRight size={18} className="shrink-0 text-ink/35" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-right">
                  <p className="text-[12px] text-ink/50">To</p>
                  <p className="mt-0.5 text-[15px] font-medium">{config.to}</p>
                </div>
              </div>
              {mode === 'pdf-to-word' && (
                <p className="mt-3 px-1 text-[13px] leading-relaxed text-ink/50">Looks just like your PDF, and you can edit every word.</p>
              )}
              {failed && (
                <p role="alert" className="mt-4 rounded-[16px] bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-700">
                  We couldn’t convert this file. Check that it’s a valid {config.noun} and try again.
                </p>
              )}
              <Button
                variant="primary"
                size="lg"
                className="mt-6 w-full"
                disabled={converting}
                onClick={convert}
              >
                {converting ? (
                  <>
                    <Spinner className="size-[18px]" />
                    Converting…
                  </>
                ) : (
                  config.action
                )}
              </Button>
            </>
          )}
        </div>
        <PrivacyNote />
      </div>

      <PageViewer
        previews={previews}
        count={pageCount}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        renderPage={renderPage}
      />
    </ToolShell>
  );
}
