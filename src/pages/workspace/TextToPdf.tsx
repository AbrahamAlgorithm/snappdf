import { useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { saveAs } from 'file-saver';
import { NameDialog, Row, Spinner, ToolShell, useDocName } from '@/components/toolkit';
import { APP_HREF } from '@/lib/router';
import { getTool } from '@/lib/site';
import { useReportWork } from '@/lib/work';
import { hasKeyboard, NEW_PAGE_KEYS } from '@/lib/wordEditing';
import type { WordLayout, WordPdf } from '@/lib/wordToPdf';
import WordPages from '@/pages/workspace/WordPages';

const tool = getTool('text-to-pdf');

const isTextFile = (file: File) => file.type.startsWith('text/') || /\.(txt|md)$/i.test(file.name);

// the first line makes a good default file name, like google docs does
function nameFromText(text: string) {
  const firstLine = text.trim().split('\n')[0];
  return firstLine.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 40).trim() || 'Untitled document';
}

// a blank page in the word editor, so typing here works like google docs, new pages and all
export default function TextToPdf() {
  const [layout, setLayout] = useState<WordLayout | null>(null);
  // a new layout gets fresh pages and a fresh editor
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<WordPdf | null>(null);
  const [editing, setEditing] = useState<number | null>(0);
  // what's on the pages, kept up to date while typing
  const [text, setText] = useState('');
  const [openedFile, setOpenedFile] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const current = useRef<WordLayout | null>(null);
  const job = useRef(0);
  const timer = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  const doc = useDocName(openedFile?.replace(/\.[^.]+$/, '') || nameFromText(text));
  const empty = !text.trim();
  useReportWork(tool.id, !empty);

  // lays out a document holding words, a blank one to start with
  const open = async (words: string, fileName: string | null = null) => {
    const id = ++job.current;
    setProblem(null);
    try {
      // the layout engine and fonts only load once someone uses this tool
      const { WordLayout, textDocx } = await import('@/lib/wordToPdf');
      const next = await WordLayout.open(await textDocx(words, 'Untitled document'));
      if (id !== job.current) return next.close();
      current.current?.close();
      current.current = next;
      doc.forget();
      setLayout(next);
      setVersion((v) => v + 1);
      setResult(null);
      setText(words);
      setOpenedFile(fileName);
      setEditing(0);
    } catch (err) {
      if (id !== job.current) return;
      console.error('Text to PDF error', err);
      setProblem('We couldn’t set up the page. Refresh and try again.');
    }
  };

  // once, the tool stays open while hidden and runs this again when it's shown
  useEffect(() => {
    if (job.current === 0) open('');
  }, []);

  const openFile = async (file?: File) => {
    if (!file || !isTextFile(file)) return;
    open(await file.text(), file.name);
  };

  // the pages' text, a moment after typing stops
  const edited = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => current.current && setText(current.current.text), 300);
  };

  const pdfTitle = doc.name;
  useEffect(() => {
    if (layout) layout.title = pdfTitle;
  }, [layout, pdfTitle]);

  if (!layout) {
    return (
      <ToolShell tool={tool}>
        <div role="status" className="flex flex-col items-center justify-center gap-4 py-32 text-[15px] text-ink/60">
          {problem ?? (
            <>
              <Spinner className="size-7" />
              Getting your page ready…
            </>
          )}
        </div>
      </ToolShell>
    );
  }

  const words = empty ? 0 : text.trim().split(/\s+/).length;
  return (
    <ToolShell tool={tool} doc={result ? { name: doc.name, onRename: doc.rename } : undefined} onDelete={result ? () => open('') : undefined} what="your text">
      <WordPages
        key={version}
        layout={layout}
        result={result}
        onResult={setResult}
        editing={editing}
        onEditing={setEditing}
        onDownload={() => result && doc.download((name) => saveAs(new Blob([result.bytes], { type: 'application/pdf' }), name))}
        rows={<Row label="Words" value={words.toLocaleString()} />}
        editor={{
          // until there's a pdf, the editor is the whole tool
          leave: result ? undefined : APP_HREF,
          hint: empty ? (
            <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              Start typing or paste your text.{hasKeyboard() && ` ${NEW_PAGE_KEYS} starts a new page.`}
              <button type="button" onClick={() => picker.current?.click()} className="inline-flex items-center gap-1 font-medium text-ink underline-offset-2 hover:underline">
                <FileUp size={14} />
                Open a .txt file
              </button>
            </span>
          ) : undefined,
          onEdit: edited,
          onDropFile: (file) => current.current?.empty && openFile(file),
        }}
      />
      <input
        ref={picker}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => {
          openFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <NameDialog {...doc.dialog} />
    </ToolShell>
  );
}
