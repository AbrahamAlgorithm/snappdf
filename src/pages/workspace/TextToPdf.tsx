import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { Download, FileUp } from 'lucide-react';
import { saveAs } from 'file-saver';
import { Button, NameDialog, Panel, Row, Spinner, ToolShell, Workbench } from '@/components/toolkit';
import { hasUnsupportedText, textToPdf } from '@/lib/convUtils';
import { getTool } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

const tool = getTool('text-to-pdf');

const isTextFile = (file: File) => file.type.startsWith('text/') || /\.(txt|md)$/i.test(file.name);

// the first line makes a good default file name, like google docs does
function nameFromText(text: string) {
  const firstLine = text.trim().split('\n')[0];
  return firstLine.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 40).trim() || 'document';
}

export default function TextToPdf() {
  const [text, setText] = useState('');
  const [openedFile, setOpenedFile] = useState<string | null>(null);
  const [notText, setNotText] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasText = text.trim().length > 0;
  useReportWork(tool.id, hasText);

  // grow the box with the text, so the page scrolls instead of the box
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [text]);

  const openFile = async (file?: File) => {
    if (!file) return;
    setNotText(!isTextFile(file));
    if (!isTextFile(file)) return;
    setText(await file.text());
    setOpenedFile(file.name);
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(true);
  };

  // dropped files open here, dropped text lands in the box like normal
  const onDrop = (e: DragEvent) => {
    setDragging(false);
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    openFile(e.dataTransfer.files[0]);
  };

  const clear = () => {
    setText('');
    setOpenedFile(null);
    setNotText(false);
    fieldRef.current?.focus();
  };

  const create = async (fileName: string) => {
    setSaving(true);
    setFailed(false);
    try {
      const bytes = await textToPdf(text);
      saveAs(new Blob([bytes], { type: 'application/pdf' }), fileName);
    } catch (err) {
      console.error('Text to PDF error', err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const words = hasText ? text.trim().split(/\s+/).length : 0;

  return (
    <ToolShell tool={tool}>
      <Workbench
        panel={
          <Panel
            title="Your PDF"
            footer={
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!hasText || saving}
                onClick={() => setSuggestedName(openedFile?.replace(/\.[^.]+$/, '') || nameFromText(text))}
              >
                {saving ? <Spinner className="size-[18px]" /> : <Download size={18} />}
                Create PDF
              </Button>
            }
          >
            <dl className="mt-5 space-y-2.5 text-[14px]">
              <Row label="Words" value={words.toLocaleString()} />
              <Row label="Characters" value={text.length.toLocaleString()} />
              <Row label="Page size" value="A4, portrait" />
            </dl>
            {hasUnsupportedText(text) && (
              <p className="mt-5 rounded-[16px] bg-subtle px-4 py-3 text-[13px] leading-relaxed text-ink/60">
                Emoji and some symbols or alphabets can’t go in the PDF yet, so they’ll be left out.
              </p>
            )}
            {failed && (
              <p role="alert" className="mt-5 rounded-[16px] bg-red-50 px-4 py-3 text-[14px] leading-relaxed text-red-700">
                We couldn’t create your PDF. Please try again.
              </p>
            )}
          </Panel>
        }
      >
        <div
          onDragOver={onDragOver}
          onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'relative overflow-hidden rounded-[24px] bg-card ring-1 transition-shadow',
            dragging ? 'ring-2 ring-ink' : 'ring-transparent focus-within:ring-ink/15',
          )}
        >
          <div className="flex items-center gap-1 border-b border-line py-2 pl-5 pr-2">
            <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{openedFile ?? 'Your text'}</p>
            {hasText && (
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={16} />
              Open file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                openFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {notText && (
            <p role="alert" className="border-b border-line bg-red-50 px-5 py-2.5 text-[13px] text-red-700">
              That doesn’t look like a text file. Try a .txt file instead.
            </p>
          )}
          <textarea
            ref={fieldRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Your text"
            placeholder="Start typing or paste your text here. You can also drop in a .txt file."
            autoFocus={window.matchMedia('(pointer: fine)').matches}
            className="block min-h-[55vh] w-full resize-none bg-transparent p-5 text-[16px] leading-[1.65] outline-none placeholder:text-ink/35 sm:px-7 sm:py-6"
          />
          {dragging && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-card/90 text-[16px] font-medium">
              Drop to open your text file
            </div>
          )}
        </div>
      </Workbench>

      <NameDialog
        suggested={suggestedName}
        onCancel={() => setSuggestedName(null)}
        onConfirm={(fileName) => {
          setSuggestedName(null);
          create(fileName);
        }}
      />
    </ToolShell>
  );
}
