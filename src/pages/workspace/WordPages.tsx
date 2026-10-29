import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Download, Eye, FileText, PenLine } from 'lucide-react';
import { Button, formatSize, PageViewer, Panel, Row, Workbench } from '@/components/toolkit';
import { closePdf } from '@/lib/pdfjs';
import { renderPageImage } from '@/lib/pdfUtils';
import type { WordLayout, WordPdf } from '@/lib/wordToPdf';
import WordEditor from '@/pages/workspace/WordEditor';

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

type EditorExtras = Pick<ComponentProps<typeof WordEditor>, 'leave' | 'hint' | 'onEdit' | 'onDropFile'>;

// a laid out document as its pdf: the pages, a full size viewer, the editor and the download panel.
// word to pdf and text to pdf both work this way
export default function WordPages({
  layout,
  result,
  onResult,
  editing,
  onEditing,
  onDownload,
  rows,
  editor,
}: {
  layout: WordLayout;
  // null until the first pdf is made, while the editor is all there is
  result: WordPdf | null;
  onResult: (result: WordPdf) => void;
  // the page editing starts at, null while not editing
  editing: number | null;
  onEditing: (page: number | null) => void;
  onDownload: () => void;
  // more about the pdf, above the page count
  rows?: ReactNode;
  editor?: EditorExtras;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);

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

  // after editing, the pdf is made again from the edited pages. the first time it's made whatever happened
  const save = async (changed: boolean) => {
    if (changed || !result) onResult(await layout.toPdf());
  };

  const count = result?.pages.length ?? 0;
  return (
    <>
      {result && (
        <Workbench
          panel={
            <Panel
              title="Your PDF"
              footer={
                <div className="flex gap-2">
                  <Button size="lg" onClick={() => onEditing(0)}>
                    <PenLine size={18} />
                    Edit
                  </Button>
                  <Button variant="primary" size="lg" className="flex-1" onClick={onDownload}>
                    <Download size={18} />
                    Download PDF
                  </Button>
                </div>
              }
            >
              <dl className="mt-5 space-y-2.5 text-[14px]">
                {rows}
                <Row label="Pages" value={count} />
                <Row label="Page size" value={describeSize(result.pages)} />
                <Row label="PDF size" value={formatSize(result.bytes.length)} />
              </dl>
              {result.missingText && <Note>Emoji and some symbols or alphabets can’t go in the PDF yet, so they’re left out.</Note>}
              {result.charts > 0 && (
                <Note>
                  {result.charts === 1 ? 'A chart or diagram' : `${result.charts} charts or diagrams`} from Word can’t go in the PDF yet. In Word,
                  copy {result.charts === 1 ? 'it' : 'each one'}, paste it back with Paste Special as a picture, then convert again.
                </Note>
              )}
              {result.oldPictures > 0 && (
                <Note>
                  {result.oldPictures === 1 ? 'A picture is' : `${result.oldPictures} pictures are`} in an old Windows format (EMF or WMF) that can’t go
                  in the PDF yet. In Word, right-click {result.oldPictures === 1 ? 'it' : 'each one'}, choose Save as Picture, insert that picture
                  instead, then convert again.
                </Note>
              )}
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
          <p className="px-1 pb-3 text-[14px] text-ink/55">This is your PDF. Tap a page to see it full size, or Edit to change the text.</p>
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
      )}

      <PageViewer
        previews={previews}
        count={count}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        renderPage={renderPage}
        action={
          <Button
            variant="primary"
            onClick={() => {
              onEditing(viewing);
              setViewing(null);
            }}
          >
            <PenLine size={16} />
            Edit
          </Button>
        }
      />

      {editing !== null && <WordEditor layout={layout} start={editing} onSave={save} onClose={() => onEditing(null)} {...editor} />}
    </>
  );
}
