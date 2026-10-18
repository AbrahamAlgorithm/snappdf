import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Check, ChevronLeft, ChevronRight, Copy, Eraser, FileText, Minus, PenLine, Plus, RotateCcw, RotateCw, Trash2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, Dialog, IconButton, Spinner, UploadCard } from '@/components/toolkit';
import { closePdf, openPdf } from '@/lib/pdfjs';
import { renderPageImage } from '@/lib/pdfUtils';
import { convertImageFileToPdfBytes, type SignatureItem } from '@/lib/signerUtils';
import { getTool } from '@/lib/site';
import { cn } from '@/lib/utils';

export interface DocumentSignerRef {
  updateSignature: (id: string, updates: Partial<SignatureItem>) => void;
  removeSignature: (id: string) => void;
  duplicateSignature: (id: string) => void;
  rotateSignature: (id: string, delta: number) => void;
  scaleSignature: (id: string, deltaPercent: number) => void;
  setPresetSize: (id: string, targetWidthPercent: number) => void;
  setSelectedSigId: (id: string | null) => void;
  focusSignature: (id: string) => void;
  pickSignatureFile: () => void;
  openDrawPad: () => void;
}

export interface DocumentSignerProps {
  onDocumentChange?: (docBytes: Uint8Array | null, docName: string, signatures: SignatureItem[], selectedId?: string | null) => void;
  selectedSigId?: string | null;
  onSelectSigId?: (id: string | null) => void;
}

const tool = getTool('sign-pdf');
const PEN_COLORS = [
  { value: '#111111', label: 'Black' },
  { value: '#1e3a8a', label: 'Blue' },
  { value: '#78350f', label: 'Brown' },
];
const PEN_WIDTHS = [
  { value: 2, label: 'Fine' },
  { value: 3, label: 'Medium' },
  { value: 5, label: 'Thick' },
];
const newId = () => Math.random().toString(36).substring(7);
const corner = 'absolute size-3.5 rounded-full border-2 border-[#2563eb] bg-white shadow-sm transition-transform hover:scale-125 z-40';

export const DocumentSigner = React.forwardRef<DocumentSignerRef, DocumentSignerProps>(function DocumentSigner(
  { onDocumentChange, selectedSigId: propSelectedSigId, onSelectSigId },
  ref,
) {
  // document
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);
  const [docName, setDocName] = useState<string>('');
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0); // 0-based
  const [renderedPageUrl, setRenderedPageUrl] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [docAspect, setDocAspect] = useState<number>(1 / 1.414); // A4 until the page renders

  // signatures
  const [signatures, setSignatures] = useState<SignatureItem[]>([]);
  const [internalSelectedSigId, setInternalSelectedSigId] = useState<string | null>(null);

  const isControlledSelection = propSelectedSigId !== undefined;
  const activeSelectedId = isControlledSelection ? propSelectedSigId : internalSelectedSigId;

  const setSelectedSigId = useCallback(
    (id: string | null) => {
      setInternalSelectedSigId(id);
      onSelectSigId?.(id);
    },
    [onSelectSigId],
  );

  // scroll a new or picked signature into view
  const [revealId, setRevealId] = useState<string | null>(null);
  useEffect(() => {
    if (!revealId) return;
    document.querySelector(`[data-sig-id="${revealId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setRevealId(null);
  }, [revealId]);

  const [zoomLevel, setZoomLevel] = useState<number>(100); // 70-150%
  const [rotationPreviewAngle, setRotationPreviewAngle] = useState<number | null>(null);
  const [isRotating, setIsRotating] = useState<boolean>(false);

  // draw pad
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [penColor, setPenColor] = useState('#111111');
  const [penWidth, setPenWidth] = useState(3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnSomething, setHasDrawnSomething] = useState(false);

  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const sigFileInputRef = useRef<HTMLInputElement | null>(null);

  const dragTrackingRef = useRef<{ sigId: string; startX: number; startY: number; initX: number; initY: number } | null>(null);
  const resizeTrackingRef = useRef<{
    sigId: string;
    corner: 'se' | 'sw' | 'ne' | 'nw';
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initWidth: number;
    initHeight: number;
    aspectRatio: number;
  } | null>(null);

  // render the current page sharp enough for the biggest zoom on this screen
  const shownPage = useRef<{ bytes: Uint8Array; page: number; url: string } | null>(null);
  useEffect(() => {
    if (!docBytes || pageCount === 0) return;
    if (shownPage.current?.bytes === docBytes && shownPage.current.page === currentPage) return;
    let cancelled = false;
    renderPageImage(docBytes, currentPage, Math.min(900, window.innerWidth))
      .then(({ url, width, height }) => {
        if (cancelled) return URL.revokeObjectURL(url);
        if (shownPage.current) URL.revokeObjectURL(shownPage.current.url);
        shownPage.current = { bytes: docBytes, page: currentPage, url };
        setRenderedPageUrl(url);
        setDocAspect(width / height);
      })
      .catch((err) => !cancelled && console.error('Failed to render PDF page', err));
    return () => {
      cancelled = true;
    };
  }, [docBytes, currentPage, pageCount]);

  // keep the side panel and download in sync
  useEffect(() => {
    onDocumentChange?.(docBytes, docName, signatures, activeSelectedId);
  }, [docBytes, docName, signatures, activeSelectedId, onDocumentChange]);

  // keyboard shortcuts for the selected signature
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || isDrawModalOpen) return;

      if (e.key === 'Escape') {
        setSelectedSigId(null);
        return;
      }
      if (!activeSelectedId) return;
      const currentSig = signatures.find((s) => s.id === activeSelectedId);
      if (!currentSig) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSignature(activeSelectedId);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const delta = e.shiftKey ? -90 : 90;
        updateSignature(activeSelectedId, { rotation: ((((currentSig.rotation || 0) + delta) % 360) + 360) % 360 });
        return;
      }

      const step = e.shiftKey ? 2 : 0.5; // %
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateSignature(activeSelectedId, { xPercent: Math.max(0, currentSig.xPercent - step) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateSignature(activeSelectedId, { xPercent: Math.min(100 - currentSig.widthPercent, currentSig.xPercent + step) });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSignature(activeSelectedId, { yPercent: Math.max(0, currentSig.yPercent - step) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSignature(activeSelectedId, { yPercent: Math.min(100 - currentSig.heightPercent, currentSig.yPercent + step) });
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleScaleStep(activeSelectedId, 3);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleScaleStep(activeSelectedId, -3);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSelectedId, signatures, isDrawModalOpen, setSelectedSigId]);

  const handleDocumentFile = async (file: File) => {
    setIsLoadingDoc(true);
    setDocName(file.name);
    setRenderedPageUrl(null);
    setCurrentPage(0);
    setSignatures([]);
    setSelectedSigId(null);
    closePdf(docBytes);
    let bytes: Uint8Array | null = null;
    try {
      // a photo of a document becomes a one-page pdf
      bytes = file.type.startsWith('image/') ? await convertImageFileToPdfBytes(file) : new Uint8Array(await file.arrayBuffer());
      const pdf = await openPdf(bytes);
      setDocBytes(bytes);
      setPageCount(pdf.numPages);
    } catch (err) {
      closePdf(bytes);
      setDocBytes(null);
      setPageCount(0);
      console.error('Failed to load document file:', err);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const docDropzone = useDropzone({
    onDrop: (files) => files[0] && handleDocumentFile(files[0]),
    accept: { 'application/pdf': ['.pdf'], 'image/*': [] },
    multiple: false,
  });

  const pickSignatureFile = () => {
    if (!sigFileInputRef.current) return;
    sigFileInputRef.current.value = '';
    sigFileInputRef.current.click();
  };

  const openDrawPad = () => {
    setHasDrawnSomething(false);
    setIsDrawModalOpen(true);
  };

  const addSignature = (url: string, name: string, aspectRatio: number, minHeight: number, maxHeight = 95) => {
    const widthPercent = 26;
    const heightPercent = (widthPercent * (docAspect || 1 / 1.414)) / aspectRatio;
    const sig: SignatureItem = {
      id: newId(),
      url,
      name,
      pageIndex: currentPage,
      xPercent: 35,
      yPercent: 70,
      widthPercent,
      heightPercent: Math.max(minHeight, Math.min(maxHeight, heightPercent)),
      aspectRatio,
      rotation: 0,
      removeWhiteBg: false,
    };
    setSignatures((prev) => [...prev, sig]);
    setSelectedSigId(sig.id);
    setRevealId(sig.id);
  };

  const handleSignatureFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => addSignature(url, file.name, (img.naturalWidth || 300) / (img.naturalHeight || 150), 4, 45);
    img.src = url;
  };

  const handleInsertDrawnSignature = () => {
    if (!canvasRef.current || !hasDrawnSomething) return;
    addSignature(canvasRef.current.toDataURL('image/png'), `Signature_${new Date().toLocaleTimeString()}`, 2.4, 4);
    setIsDrawModalOpen(false);
  };

  const updateSignature = (id: string, updates: Partial<SignatureItem>) => {
    setSignatures((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const removeSignature = (id: string) => {
    setSignatures((prev) => prev.filter((s) => s.id !== id));
    if (activeSelectedId === id) setSelectedSigId(null);
  };

  const duplicateSignature = (id: string) => {
    const sig = signatures.find((s) => s.id === id);
    if (!sig) return;
    const copy: SignatureItem = {
      ...sig,
      id: newId(),
      xPercent: Math.min(80, sig.xPercent + 4),
      yPercent: Math.min(80, sig.yPercent + 4),
      rotation: sig.rotation || 0,
    };
    setSignatures((prev) => [...prev, copy]);
    setSelectedSigId(copy.id);
  };

  const focusSignature = (id: string) => {
    const sig = signatures.find((s) => s.id === id);
    if (!sig) return;
    setCurrentPage(sig.pageIndex);
    setSelectedSigId(id);
    setRevealId(id);
  };

  const containerAspect = () => {
    const rect = pageContainerRef.current?.getBoundingClientRect();
    return rect ? rect.width / rect.height : null;
  };

  const handleScaleStep = (sigId: string, deltaPercent: number) => {
    const sig = signatures.find((s) => s.id === sigId);
    const aspect = containerAspect();
    if (!sig || !aspect) return;
    const newWidth = Math.max(6, Math.min(95, sig.widthPercent + deltaPercent));
    const newHeight = (newWidth * aspect) / (sig.aspectRatio || 2);
    updateSignature(sigId, {
      xPercent: Math.max(0, Math.min(100 - newWidth, sig.xPercent - deltaPercent / 2)),
      yPercent: Math.max(0, Math.min(100 - newHeight, sig.yPercent)),
      widthPercent: newWidth,
      heightPercent: Math.max(3, Math.min(95, newHeight)),
    });
  };

  const handleSetPresetSize = (sigId: string, targetWidthPercent: number) => {
    const sig = signatures.find((s) => s.id === sigId);
    const aspect = containerAspect();
    if (!sig || !aspect) return;
    const newHeight = (targetWidthPercent * aspect) / (sig.aspectRatio || 2);
    updateSignature(sigId, {
      xPercent: Math.max(0, Math.min(100 - targetWidthPercent, sig.xPercent)),
      yPercent: Math.max(0, Math.min(100 - newHeight, sig.yPercent)),
      widthPercent: targetWidthPercent,
      heightPercent: Math.max(3, Math.min(95, newHeight)),
    });
  };

  const handleRotateStep = (sigId: string, deltaAngle: number) => {
    const sig = signatures.find((s) => s.id === sigId);
    if (!sig) return;
    updateSignature(sigId, { rotation: ((((sig.rotation || 0) + deltaAngle) % 360) + 360) % 360 });
  };

  // no deps on purpose, so the side panel always acts on the latest signatures
  React.useImperativeHandle(ref, () => ({
    updateSignature,
    removeSignature,
    duplicateSignature,
    rotateSignature: handleRotateStep,
    scaleSignature: handleScaleStep,
    setPresetSize: handleSetPresetSize,
    setSelectedSigId,
    focusSignature,
    pickSignatureFile,
    openDrawPad,
  }));

  // drag to move
  const handleSigPointerDown = (e: React.PointerEvent, sig: SignatureItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedSigId(sig.id);
    dragTrackingRef.current = { sigId: sig.id, startX: e.clientX, startY: e.clientY, initX: sig.xPercent, initY: sig.yPercent };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!dragTrackingRef.current || !pageContainerRef.current) return;
      const rect = pageContainerRef.current.getBoundingClientRect();
      const deltaXPercent = ((moveEvt.clientX - dragTrackingRef.current.startX) / rect.width) * 100;
      const deltaYPercent = ((moveEvt.clientY - dragTrackingRef.current.startY) / rect.height) * 100;
      updateSignature(dragTrackingRef.current.sigId, {
        xPercent: Math.max(0, Math.min(100 - sig.widthPercent, dragTrackingRef.current.initX + deltaXPercent)),
        yPercent: Math.max(0, Math.min(100 - sig.heightPercent, dragTrackingRef.current.initY + deltaYPercent)),
      });
    };
    const handlePointerUp = () => {
      dragTrackingRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // drag a corner to resize, keeps the ratio
  const handleResizePointerDown = (e: React.PointerEvent, sig: SignatureItem, c: 'se' | 'sw' | 'ne' | 'nw') => {
    e.stopPropagation();
    setSelectedSigId(sig.id);
    resizeTrackingRef.current = {
      sigId: sig.id,
      corner: c,
      startX: e.clientX,
      startY: e.clientY,
      initX: sig.xPercent,
      initY: sig.yPercent,
      initWidth: sig.widthPercent,
      initHeight: sig.heightPercent,
      aspectRatio: sig.aspectRatio || 2,
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!resizeTrackingRef.current || !pageContainerRef.current) return;
      const rect = pageContainerRef.current.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const { corner: k, startX, initX, initY, initWidth, initHeight, aspectRatio } = resizeTrackingRef.current;
      const deltaXPercent = ((moveEvt.clientX - startX) / rect.width) * 100;

      let newWidth = initWidth;
      let newHeight = initHeight;
      let newX = initX;
      let newY = initY;

      if (k === 'se') {
        newWidth = Math.max(6, Math.min(100 - initX, initWidth + deltaXPercent));
        newHeight = (newWidth * aspect) / aspectRatio;
        if (initY + newHeight > 100) {
          newHeight = 100 - initY;
          newWidth = (newHeight * aspectRatio) / aspect;
        }
      } else if (k === 'sw') {
        const rightEdge = initX + initWidth;
        newWidth = Math.max(6, Math.min(rightEdge, initWidth - deltaXPercent));
        newHeight = (newWidth * aspect) / aspectRatio;
        if (initY + newHeight > 100) {
          newHeight = 100 - initY;
          newWidth = (newHeight * aspectRatio) / aspect;
        }
        newX = rightEdge - newWidth;
      } else if (k === 'ne') {
        const bottomEdge = initY + initHeight;
        newWidth = Math.max(6, Math.min(100 - initX, initWidth + deltaXPercent));
        newHeight = (newWidth * aspect) / aspectRatio;
        newY = bottomEdge - newHeight;
        if (newY < 0) {
          newY = 0;
          newHeight = bottomEdge;
          newWidth = (newHeight * aspectRatio) / aspect;
        }
      } else {
        const rightEdge = initX + initWidth;
        const bottomEdge = initY + initHeight;
        newWidth = Math.max(6, Math.min(rightEdge, initWidth - deltaXPercent));
        newHeight = (newWidth * aspect) / aspectRatio;
        newX = rightEdge - newWidth;
        newY = bottomEdge - newHeight;
        if (newY < 0) {
          newY = 0;
          newHeight = bottomEdge;
          newWidth = (newHeight * aspectRatio) / aspect;
          newX = rightEdge - newWidth;
        }
      }

      updateSignature(sig.id, {
        xPercent: Math.max(0, Math.min(100 - newWidth, newX)),
        yPercent: Math.max(0, Math.min(100 - newHeight, newY)),
        widthPercent: newWidth,
        heightPercent: Math.max(3, Math.min(95, newHeight)),
      });
    };
    const handlePointerUp = () => {
      resizeTrackingRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // drag the top handle to rotate, shift snaps to 15°
  const handleRotatePointerDown = (e: React.PointerEvent, sig: SignatureItem) => {
    e.stopPropagation();
    setSelectedSigId(sig.id);
    if (!pageContainerRef.current) return;
    const rect = pageContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + ((sig.xPercent + sig.widthPercent / 2) / 100) * rect.width;
    const centerY = rect.top + ((sig.yPercent + sig.heightPercent / 2) / 100) * rect.height;
    setIsRotating(true);

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const rad = Math.atan2(moveEvt.clientY - centerY, moveEvt.clientX - centerX);
      // atan2 starts at 3 o'clock, the handle is at 12
      let deg = (((Math.round((rad * 180) / Math.PI) + 90) % 360) + 360) % 360;
      if (moveEvt.shiftKey) deg = (Math.round(deg / 15) * 15) % 360;
      setRotationPreviewAngle(deg);
      updateSignature(sig.id, { rotation: deg });
    };
    const handlePointerUp = () => {
      setIsRotating(false);
      setRotationPreviewAngle(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // drawing on the pad
  const pointOnCanvas = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = pointOnCanvas(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
    setHasDrawnSomething(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = pointOnCanvas(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSomething(false);
  };

  const activePageSignatures = signatures.filter((s) => s.pageIndex === currentPage);
  const goToPage = (page: number) => {
    setSelectedSigId(null);
    setCurrentPage(page);
  };

  return (
    <div>
      <input
        type="file"
        ref={sigFileInputRef}
        onChange={handleSignatureFilePicked}
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/heic,image/gif"
        className="hidden"
      />

      {!docBytes ? (
        <UploadCard
          tool={tool}
          dropzone={docDropzone}
          title="Choose a document to sign"
          hint="Drag and drop a PDF or a photo of a document here, or choose one from your device."
          button="Choose document"
          formats="PDF, JPG, PNG and other images"
          busy={isLoadingDoc ? 'Opening your document…' : null}
        />
      ) : (
        <>
          <input {...docDropzone.getInputProps()} />
          <div className="sticky top-[76px] z-30 flex items-center gap-2 rounded-[20px] bg-card p-2 pl-3">
            <span className="hidden size-9 shrink-0 place-items-center rounded-[12px] bg-subtle text-ink/60 sm:grid">
              <FileText size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{docName}</p>
              <p className="text-[12px] text-ink/50">
                {pageCount} {pageCount === 1 ? 'page' : 'pages'}
              </p>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center">
                <IconButton label="Previous page" size="sm" disabled={currentPage === 0} onClick={() => goToPage(Math.max(0, currentPage - 1))}>
                  <ChevronLeft size={18} />
                </IconButton>
                <span className="min-w-11 text-center text-[13px] tabular-nums">
                  {currentPage + 1} / {pageCount}
                </span>
                <IconButton label="Next page" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => goToPage(Math.min(pageCount - 1, currentPage + 1))}>
                  <ChevronRight size={18} />
                </IconButton>
              </div>
            )}
            <div className="hidden items-center border-l border-line pl-1.5 md:flex">
              <IconButton label="Zoom out" size="sm" disabled={zoomLevel <= 70} onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}>
                <ZoomOut size={17} />
              </IconButton>
              <span className="w-11 text-center text-[13px] tabular-nums">{zoomLevel}%</span>
              <IconButton label="Zoom in" size="sm" disabled={zoomLevel >= 150} onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}>
                <ZoomIn size={17} />
              </IconButton>
            </div>
            <Button variant="ghost" size="sm" onClick={docDropzone.open}>
              Replace
            </Button>
          </div>

          {/* click the backdrop or the page to deselect */}
          <div onClick={() => setSelectedSigId(null)} className="flex select-none justify-center pb-4 pt-6 sm:pt-8">
            {isLoadingDoc || !renderedPageUrl ? (
              <div role="status" className="flex flex-col items-center gap-4 py-24 text-[15px] text-ink/60">
                <Spinner className="size-7" />
                Loading pages…
              </div>
            ) : (
              <div style={{ width: `${Math.round(zoomLevel * 0.75)}%`, maxWidth: 'min(900px, 100%)', minWidth: 'min(320px, 100%)' }} className="transition-[width] duration-150">
                <div
                  ref={pageContainerRef}
                  onClick={() => setSelectedSigId(null)}
                  className="relative bg-paper shadow-[0_2px_14px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
                  style={{ aspectRatio: docAspect ? `${docAspect}` : '1 / 1.414' }}
                >
                  <img
                    src={renderedPageUrl}
                    alt={`Page ${currentPage + 1}`}
                    className="pointer-events-none h-full w-full select-none object-contain"
                    draggable={false}
                  />

                  {signatures.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="pointer-events-auto w-full max-w-[280px] rounded-[22px] bg-card/95 p-5 text-center shadow-xl ring-1 ring-black/5 backdrop-blur"
                      >
                        <p className="text-[16px] font-semibold tracking-[-0.01em]">Add your signature</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink/55">Draw it or upload a photo, then drag it into place.</p>
                        <div className="mt-4 flex justify-center gap-2">
                          <Button variant="primary" size="sm" onClick={openDrawPad}>
                            <PenLine size={15} />
                            Draw
                          </Button>
                          <Button size="sm" onClick={pickSignatureFile}>
                            <Upload size={15} />
                            Upload
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePageSignatures.map((sig) => {
                    const isSelected = activeSelectedId === sig.id;
                    const rotAngle = sig.rotation || 0;
                    return (
                      <div
                        key={sig.id}
                        data-sig-id={sig.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSigId(sig.id);
                        }}
                        onPointerDown={(e) => handleSigPointerDown(e, sig)}
                        style={{
                          position: 'absolute',
                          left: `${sig.xPercent}%`,
                          top: `${sig.yPercent}%`,
                          width: `${sig.widthPercent}%`,
                          height: `${sig.heightPercent}%`,
                          transform: `rotate(${rotAngle}deg)`,
                          transformOrigin: 'center center',
                          cursor: isSelected ? 'move' : 'pointer',
                          touchAction: 'none',
                        }}
                        className={cn(
                          'flex items-center justify-center',
                          isSelected ? 'z-30 outline outline-2 outline-[#2563eb]' : 'z-20 hover:outline hover:outline-1 hover:outline-[#2563eb]/60',
                        )}
                      >
                        <img
                          src={sig.url}
                          alt="Signature"
                          draggable={false}
                          className={cn('pointer-events-none h-full w-full select-none object-contain', sig.removeWhiteBg && 'mix-blend-multiply')}
                        />

                        {isSelected && (
                          <>
                            <div
                              onPointerDown={(e) => handleRotatePointerDown(e, sig)}
                              className="absolute -top-8 left-1/2 z-50 flex -translate-x-1/2 cursor-grab select-none flex-col items-center active:cursor-grabbing"
                              title="Drag to rotate (hold Shift to snap to 15°)"
                            >
                              <span className="grid size-6 place-items-center rounded-full border-2 border-[#2563eb] bg-white text-[#2563eb] shadow-sm">
                                <RotateCw size={12} className="pointer-events-none" />
                              </span>
                              <span className="h-2 w-0.5 bg-[#2563eb]" />
                              {isRotating && rotationPreviewAngle !== null && (
                                <span className="absolute -top-7 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-canvas">
                                  {rotationPreviewAngle}°
                                </span>
                              )}
                            </div>

                            <div onPointerDown={(e) => handleResizePointerDown(e, sig, 'nw')} className={cn(corner, '-left-[7px] -top-[7px] cursor-nwse-resize')} />
                            <div onPointerDown={(e) => handleResizePointerDown(e, sig, 'ne')} className={cn(corner, '-right-[7px] -top-[7px] cursor-nesw-resize')} />
                            <div onPointerDown={(e) => handleResizePointerDown(e, sig, 'sw')} className={cn(corner, '-bottom-[7px] -left-[7px] cursor-nesw-resize')} />
                            <div onPointerDown={(e) => handleResizePointerDown(e, sig, 'se')} className={cn(corner, '-bottom-[7px] -right-[7px] cursor-nwse-resize')} />

                            {/* counter-rotate so the toolbar stays level */}
                            <div
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              style={{ transform: `rotate(-${rotAngle}deg)` }}
                              className={cn(
                                'absolute left-1/2 z-50 flex -translate-x-1/2 select-none items-center gap-0.5 whitespace-nowrap rounded-full bg-card p-1 text-ink shadow-[0_6px_20px_rgba(0,0,0,0.16)] ring-1 ring-black/5',
                                sig.yPercent < 15 ? '-bottom-14' : '-top-[78px]',
                              )}
                            >
                              <IconButton label="Smaller" size="xs" onClick={() => handleScaleStep(sig.id, -4)}>
                                <Minus size={14} />
                              </IconButton>
                              <span className="w-9 text-center text-[12px] tabular-nums text-ink/70">{Math.round(sig.widthPercent)}%</span>
                              <IconButton label="Larger" size="xs" onClick={() => handleScaleStep(sig.id, 4)}>
                                <Plus size={14} />
                              </IconButton>
                              <span className="mx-0.5 h-4 w-px bg-line" />
                              <IconButton label="Rotate left" size="xs" onClick={() => handleRotateStep(sig.id, -90)}>
                                <RotateCcw size={14} />
                              </IconButton>
                              <IconButton label="Rotate right (R)" size="xs" onClick={() => handleRotateStep(sig.id, 90)}>
                                <RotateCw size={14} />
                              </IconButton>
                              {rotAngle !== 0 && (
                                <button
                                  type="button"
                                  onClick={() => updateSignature(sig.id, { rotation: 0 })}
                                  title="Reset rotation"
                                  className="rounded-full px-2 py-1 text-[12px] tabular-nums text-ink/70 hover:bg-subtle"
                                >
                                  {rotAngle}° ×
                                </button>
                              )}
                              <span className="mx-0.5 h-4 w-px bg-line" />
                              <IconButton
                                label={sig.removeWhiteBg ? 'Keep white background' : 'Remove white background'}
                                size="xs"
                                aria-pressed={!!sig.removeWhiteBg}
                                onClick={() => updateSignature(sig.id, { removeWhiteBg: !sig.removeWhiteBg })}
                                className={cn(sig.removeWhiteBg && 'bg-[#2563eb]/10 text-[#2563eb] hover:bg-[#2563eb]/15 hover:text-[#2563eb]')}
                              >
                                <Eraser size={14} />
                              </IconButton>
                              <IconButton label="Duplicate" size="xs" onClick={() => duplicateSignature(sig.id)}>
                                <Copy size={14} />
                              </IconButton>
                              <IconButton label="Delete (Del)" size="xs" onClick={() => removeSignature(sig.id)} className="hover:bg-red-50 hover:text-red-600">
                                <Trash2 size={14} />
                              </IconButton>
                              <span className="mx-0.5 h-4 w-px bg-line" />
                              <IconButton label="Done (Esc)" size="xs" onClick={() => setSelectedSigId(null)}>
                                <Check size={15} />
                              </IconButton>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-center text-[13px] text-ink/50">
                  Page {currentPage + 1} of {pageCount}
                  {activePageSignatures.length > 0 &&
                    ` · ${activePageSignatures.length} ${activePageSignatures.length === 1 ? 'signature' : 'signatures'}`}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={isDrawModalOpen} onClose={() => setIsDrawModalOpen(false)} labelledBy="draw-title" className="max-w-lg">
        <h2 id="draw-title" className="text-[20px] font-semibold tracking-[-0.02em]">
          Draw your signature
        </h2>
        <p className="mt-1.5 text-[14px] text-ink/60">Use your mouse, trackpad or finger.</p>
        <div className="relative mt-5 overflow-hidden rounded-[18px] border border-line bg-paper">
          <canvas
            ref={canvasRef}
            width={700}
            height={300}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={() => setIsDrawing(false)}
            onMouseLeave={() => setIsDrawing(false)}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={() => setIsDrawing(false)}
            className="block h-52 w-full cursor-crosshair touch-none"
          />
          <div className="pointer-events-none absolute inset-x-8 bottom-12 border-b border-dashed border-black/20" />
          {!hasDrawnSomething && (
            <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[14px] text-black/30">Sign here</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Ink colour">
            {PEN_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={penColor === c.value}
                aria-label={c.label}
                title={c.label}
                onClick={() => setPenColor(c.value)}
                className={cn('size-7 rounded-full ring-offset-2 ring-offset-card transition-shadow', penColor === c.value ? 'ring-2 ring-ink' : 'ring-1 ring-line')}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          <div className="flex rounded-full bg-subtle p-1" role="radiogroup" aria-label="Pen thickness">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w.value}
                type="button"
                role="radio"
                aria-checked={penWidth === w.value}
                onClick={() => setPenWidth(w.value)}
                className={cn('rounded-full px-3 py-1 text-[13px] transition-colors', penWidth === w.value ? 'bg-card font-medium shadow-sm' : 'text-ink/60 hover:text-ink')}
              >
                {w.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={clearCanvas} disabled={!hasDrawnSomething} className="ml-auto">
            Clear
          </Button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setIsDrawModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleInsertDrawnSignature} disabled={!hasDrawnSomething}>
            <Check size={16} />
            Add signature
          </Button>
        </div>
      </Dialog>
    </div>
  );
});
