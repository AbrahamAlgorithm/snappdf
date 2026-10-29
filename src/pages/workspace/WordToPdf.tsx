import { useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import { NameDialog, ToolShell, UploadCard, useDocName } from '@/components/toolkit';
import { getTool } from '@/lib/site';
import { useReportWork } from '@/lib/work';
import type { WordLayout, WordPdf } from '@/lib/wordToPdf';
import WordPages from '@/pages/workspace/WordPages';

const tool = getTool('word-to-pdf');

export default function WordToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<WordPdf | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // the page editing starts at, null while not editing
  const [editing, setEditing] = useState<number | null>(null);
  // the laid out document, kept so it can be edited and made into a pdf again
  const layout = useRef<WordLayout | null>(null);
  // picking another file or starting over makes an unfinished conversion stale
  const job = useRef(0);
  const doc = useDocName(file?.name.replace(/\.docx$/i, '') ?? 'document');
  useReportWork(tool.id, !!result);

  const convert = async (picked: File) => {
    const id = ++job.current;
    setProblem(null);
    setProgress('Reading your document…');
    try {
      // the layout engine and fonts only load once someone uses this tool
      const { WordLayout } = await import('@/lib/wordToPdf');
      const report = (message: string) => id === job.current && setProgress(message);
      const opened = await WordLayout.open(picked, report);
      const made = id === job.current ? await opened.toPdf(report) : null;
      if (!made || id !== job.current) return opened.close();
      layout.current?.close();
      layout.current = opened;
      doc.forget();
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

  const reset = () => {
    job.current++;
    layout.current?.close();
    layout.current = null;
    setFile(null);
    setResult(null);
    setProblem(null);
    setProgress(null);
    setEditing(null);
  };

  if (!file || !result || !layout.current) {
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

  return (
    <ToolShell tool={tool} doc={{ name: doc.name, onRename: doc.rename, onChange: reset }} onDelete={reset} what="this document">
      <WordPages
        layout={layout.current}
        result={result}
        onResult={setResult}
        editing={editing}
        onEditing={setEditing}
        onDownload={() => doc.download((name) => saveAs(new Blob([result.bytes], { type: 'application/pdf' }), name))}
      />
      <NameDialog {...doc.dialog} />
    </ToolShell>
  );
}
