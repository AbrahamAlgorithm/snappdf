import { useCallback, useRef, useState } from 'react';
import { Check, Copy, Download, Minus, PenLine, Plus, RotateCcw, RotateCw, Trash2, Upload } from 'lucide-react';
import { saveAs } from 'file-saver';
import { DocumentSigner, type DocumentSignerRef } from '@/components/DocumentSigner';
import { Button, IconButton, NameDialog, Panel, Spinner, Switch, ToolShell, Workbench } from '@/components/toolkit';
import { getTool } from '@/lib/site';
import { embedSignaturesIntoPdf, type SignatureItem } from '@/lib/signerUtils';
import { cn } from '@/lib/utils';
import { useReportWork } from '@/lib/work';

const tool = getTool('sign-pdf');

const SIZES = [
  { label: 'S', width: 16 },
  { label: 'M', width: 26 },
  { label: 'L', width: 40 },
];

export default function SignPdf() {
  const signer = useRef<DocumentSignerRef | null>(null);
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('document.pdf');
  const [signatures, setSignatures] = useState<SignatureItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  useReportWork(tool.id, !!docBytes);

  const onDocumentChange = useCallback((bytes: Uint8Array | null, name: string, sigs: SignatureItem[], selected?: string | null) => {
    setDocBytes(bytes);
    setFileName(name);
    setSignatures(sigs);
    if (selected !== undefined) setSelectedId(selected);
  }, []);

  const download = async (name: string) => {
    if (!docBytes) return;
    setSaving(true);
    try {
      const signed = await embedSignaturesIntoPdf(docBytes, signatures);
      saveAs(new Blob([signed], { type: 'application/pdf' }), name);
    } catch (err) {
      console.error('Failed to embed signatures and save PDF:', err);
    } finally {
      setSaving(false);
    }
  };

  const active = signatures.find((s) => s.id === selectedId);

  const panel = docBytes ? (
    <Panel
      title="Signatures"
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={saving}
          onClick={() => setSuggestedName(`${(fileName || 'document').replace(/\.[^/.]+$/, '')}-signed`)}
        >
          {saving ? <Spinner className="size-[18px]" /> : <Download size={18} />}
          Download signed PDF
        </Button>
      }
    >
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => signer.current?.openDrawPad()}>
          <PenLine size={16} />
          Draw
        </Button>
        <Button onClick={() => signer.current?.pickSignatureFile()}>
          <Upload size={16} />
          Upload
        </Button>
      </div>

      {signatures.length === 0 ? (
        <p className="mt-4 rounded-[18px] bg-subtle px-4 py-5 text-center text-[13px] leading-relaxed text-ink/55">
          Draw your signature or upload a photo of it, then drag it into place on the page.
        </p>
      ) : (
        <ul className="mt-4 space-y-1">
          {signatures.map((sig, i) => {
            const isSelected = sig.id === selectedId;
            return (
              <li key={sig.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => (isSelected ? signer.current?.setSelectedSigId(null) : signer.current?.focusSignature(sig.id))}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[16px] p-2 text-left transition-colors',
                    isSelected ? 'bg-[#2563eb]/[0.08]' : 'hover:bg-subtle',
                  )}
                >
                  <img src={sig.url} alt="" className="h-10 w-16 shrink-0 rounded-[10px] bg-paper object-contain p-1 ring-1 ring-line" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">Signature {i + 1}</span>
                    <span className="block text-[12px] text-ink/50">Page {sig.pageIndex + 1}</span>
                  </span>
                  {isSelected && <Check size={16} className="mr-1 text-[#2563eb]" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-[14px] font-medium">Selected signature</p>

          <div className="mt-4 flex items-center justify-between text-[13px]">
            <span className="text-ink/60">Size</span>
            <span className="tabular-nums">{Math.round(active.widthPercent)}% of page width</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <IconButton label="Smaller" size="sm" className="border border-line" onClick={() => signer.current?.scaleSignature(active.id, -4)}>
              <Minus size={15} />
            </IconButton>
            <div className="flex flex-1 rounded-full bg-subtle p-1">
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => signer.current?.setPresetSize(active.id, s.width)}
                  className={cn(
                    'flex-1 rounded-full py-1 text-[13px] transition-colors',
                    Math.round(active.widthPercent) === s.width ? 'bg-card font-medium shadow-sm' : 'text-ink/60 hover:text-ink',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <IconButton label="Larger" size="sm" className="border border-line" onClick={() => signer.current?.scaleSignature(active.id, 4)}>
              <Plus size={15} />
            </IconButton>
          </div>

          <div className="mt-5 flex items-center justify-between text-[13px]">
            <span className="text-ink/60">Rotation</span>
            <span className="tabular-nums">{active.rotation || 0}°</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <Button size="sm" className="px-0" aria-label="Rotate left 90°" title="Rotate left 90°" onClick={() => signer.current?.rotateSignature(active.id, -90)}>
              <RotateCcw size={15} />
            </Button>
            <Button size="sm" className="px-0" aria-label="Rotate right 90°" title="Rotate right 90°" onClick={() => signer.current?.rotateSignature(active.id, 90)}>
              <RotateCw size={15} />
            </Button>
            <Button size="sm" className="px-0" onClick={() => signer.current?.rotateSignature(active.id, 15)}>
              +15°
            </Button>
            <Button size="sm" className="px-0" disabled={!active.rotation} onClick={() => signer.current?.updateSignature(active.id, { rotation: 0 })}>
              Reset
            </Button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <span>
              <span className="block text-[13px]">Remove white background</span>
              <span className="block text-[12px] text-ink/50">For photos of a signature on paper</span>
            </span>
            <Switch
              label="Remove white background"
              checked={!!active.removeWhiteBg}
              onChange={(next) => signer.current?.updateSignature(active.id, { removeWhiteBg: next })}
            />
          </div>

          <div className="mt-5 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => signer.current?.duplicateSignature(active.id)}>
              <Copy size={15} />
              Duplicate
            </Button>
            <Button variant="danger" size="sm" className="flex-1 bg-red-50/60" onClick={() => signer.current?.removeSignature(active.id)}>
              <Trash2 size={15} />
              Delete
            </Button>
          </div>
        </div>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-ink/45">
        Drag a signature to move it. Drag its corners to resize and the round handle to rotate. Press Esc when you’re done.
      </p>
    </Panel>
  ) : null;

  return (
    <ToolShell tool={tool}>
      <Workbench panel={panel}>
        <DocumentSigner ref={signer} selectedSigId={selectedId} onSelectSigId={setSelectedId} onDocumentChange={onDocumentChange} />
      </Workbench>
      <NameDialog
        suggested={suggestedName}
        onCancel={() => setSuggestedName(null)}
        onConfirm={(name) => {
          setSuggestedName(null);
          download(name);
        }}
      />
    </ToolShell>
  );
}
