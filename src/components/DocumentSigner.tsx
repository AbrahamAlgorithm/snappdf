import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileUp, 
  Upload, 
  PenTool, 
  Trash2, 
  Maximize2, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Sparkles, 
  Download, 
  RefreshCw,
  Sliders,
  RotateCw,
  RotateCcw,
  FileText,
  Copy,
  MousePointer,
  Move
} from 'lucide-react';
import { 
  SignatureItem, 
  renderPdfPageHighRes, 
  generateSampleContractPdf, 
  convertImageFileToPdfBytes,
} from '@/src/lib/signerUtils';
import { getPdfMetadata } from '@/src/lib/pdfUtils';
import { cn } from '@/src/lib/utils';

export interface DocumentSignerRef {
  updateSignature: (id: string, updates: Partial<SignatureItem>) => void;
  removeSignature: (id: string) => void;
  rotateSignature: (id: string, delta: number) => void;
  scaleSignature: (id: string, deltaPercent: number) => void;
  setPresetSize: (id: string, targetWidthPercent: number) => void;
  setSelectedSigId: (id: string | null) => void;
}

export interface DocumentSignerProps {
  onTriggerDownloadModal: (sourceBytes: Uint8Array, signatures: SignatureItem[], filename: string) => void;
  onDocumentChange?: (docBytes: Uint8Array | null, docName: string, signatures: SignatureItem[], selectedId?: string | null) => void;
  isDownloading?: boolean;
  selectedSigId?: string | null;
  onSelectSigId?: (id: string | null) => void;
  onUpdateSignature?: (id: string, updates: Partial<SignatureItem>) => void;
  onDeleteSignature?: (id: string) => void;
}

export const DocumentSigner = React.forwardRef<DocumentSignerRef, DocumentSignerProps>(function DocumentSigner({ 
  onTriggerDownloadModal, 
  onDocumentChange,
  isDownloading = false,
  selectedSigId: propSelectedSigId,
  onSelectSigId
}, ref) {
  // Document state
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docBytes, setDocBytes] = useState<Uint8Array | null>(null);
  const [docName, setDocName] = useState<string>('');
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0); // 0-based
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [renderedPageUrl, setRenderedPageUrl] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [docAspect, setDocAspect] = useState<number>(1 / 1.414); // default A4 width/height

  // Signatures state
  const [signatures, setSignatures] = useState<SignatureItem[]>([]);
  const [internalSelectedSigId, setInternalSelectedSigId] = useState<string | null>(null);

  // Manage selection (prop or internal)
  const isControlledSelection = propSelectedSigId !== undefined;
  const activeSelectedId = isControlledSelection ? propSelectedSigId : internalSelectedSigId;

  const setSelectedSigId = useCallback((id: string | null) => {
    setInternalSelectedSigId(id);
    onSelectSigId?.(id);
  }, [onSelectSigId]);

  // Viewport / Zoom state
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 70 to 150 %

  // Rotation live tracking state
  const [rotationPreviewAngle, setRotationPreviewAngle] = useState<number | null>(null);
  const [isRotating, setIsRotating] = useState<boolean>(false);

  // Draw Signature modal state
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [penColor, setPenColor] = useState('#111111');
  const [penWidth, setPenWidth] = useState(3);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnSomething, setHasDrawnSomething] = useState(false);

  // Drag & Resize tracking refs
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const sigFileInputRef = useRef<HTMLInputElement | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);

  const dragTrackingRef = useRef<{
    sigId: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

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

  // 1. Load document when docBytes changes or currentPage changes
  useEffect(() => {
    if (!docBytes || pageCount === 0) return;

    let isCancelled = false;
    async function loadCurrentPage() {
      try {
        const { dataUrl, width, height } = await renderPdfPageHighRes(docBytes!, currentPage, 1.8);
        if (!isCancelled) {
          setRenderedPageUrl(dataUrl);
          if (width && height) {
            setDocAspect(width / height);
          }
        }
      } catch (err) {
        console.error('Failed to render PDF page', err);
      }
    }

    loadCurrentPage();
    return () => {
      isCancelled = true;
    };
  }, [docBytes, currentPage, pageCount]);

  // Sync state up to parent for top-bar status and downloads
  useEffect(() => {
    onDocumentChange?.(docBytes, docName, signatures, activeSelectedId);
  }, [docBytes, docName, signatures, activeSelectedId, onDocumentChange]);

  // Keyboard controls for selected signature (Nudge, Rotate, Delete, Unselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement || 
        isDrawModalOpen
      ) {
        return;
      }

      // Esc always unselects
      if (e.key === 'Escape') {
        setSelectedSigId(null);
        return;
      }

      if (!activeSelectedId) return;

      const currentSig = signatures.find(s => s.id === activeSelectedId);
      if (!currentSig) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSignature(activeSelectedId);
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const delta = e.shiftKey ? -90 : 90;
        const nextRot = (((currentSig.rotation || 0) + delta) % 360 + 360) % 360;
        updateSignature(activeSelectedId, { rotation: nextRot });
        return;
      }

      // Arrow keys for precision nudging
      const step = e.shiftKey ? 2 : 0.5; // in percent
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateSignature(activeSelectedId, { 
          xPercent: Math.max(0, currentSig.xPercent - step) 
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateSignature(activeSelectedId, { 
          xPercent: Math.min(100 - currentSig.widthPercent, currentSig.xPercent + step) 
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSignature(activeSelectedId, { 
          yPercent: Math.max(0, currentSig.yPercent - step) 
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSignature(activeSelectedId, { 
          yPercent: Math.min(100 - currentSig.heightPercent, currentSig.yPercent + step) 
        });
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

  // Handle uploading document file (PDF or Image)
  const handleDocumentFile = async (file: File) => {
    setIsLoadingDoc(true);
    setDocName(file.name);
    setDocFile(file);
    setCurrentPage(0);
    setSignatures([]);
    setSelectedSigId(null);

    try {
      let bytes: Uint8Array;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuf = await file.arrayBuffer();
        bytes = new Uint8Array(arrayBuf);
      } else if (file.type.startsWith('image/')) {
        bytes = await convertImageFileToPdfBytes(file);
      } else {
        const arrayBuf = await file.arrayBuffer();
        bytes = new Uint8Array(arrayBuf);
      }

      setDocBytes(bytes);
      const meta = await getPdfMetadata(new File([bytes], file.name, { type: 'application/pdf' }));
      setPageCount(meta.pageCount || 1);
      setPagePreviews(meta.previews);
    } catch (err) {
      console.error('Failed to load document file:', err);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Load sample contract
  const handleLoadSampleContract = async () => {
    setIsLoadingDoc(true);
    setDocName('Sample_NDA_Contract.pdf');
    setCurrentPage(0);
    setSignatures([]);
    setSelectedSigId(null);

    try {
      const bytes = await generateSampleContractPdf();
      setDocBytes(bytes);
      setDocFile(new File([bytes], 'Sample_NDA_Contract.pdf', { type: 'application/pdf' }));
      const meta = await getPdfMetadata(new File([bytes], 'Sample_NDA_Contract.pdf', { type: 'application/pdf' }));
      setPageCount(meta.pageCount || 1);
      setPagePreviews(meta.previews);
    } catch (err) {
      console.error('Failed to generate sample PDF:', err);
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Trigger signature file upload
  const handleUploadSignatureClick = () => {
    if (sigFileInputRef.current) {
      sigFileInputRef.current.value = '';
      sigFileInputRef.current.click();
    }
  };

  // Process signature image file
  const handleSignatureFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const naturalW = img.naturalWidth || 300;
      const naturalH = img.naturalHeight || 150;
      const aspectRatio = naturalW / naturalH;

      // Initial size in percent of page container
      const widthPercent = Math.min(32, Math.max(16, 26));
      const containerAspect = docAspect || (1 / 1.414);
      const heightPercent = (widthPercent * containerAspect) / aspectRatio;

      const newSig: SignatureItem = {
        id: Math.random().toString(36).substring(7),
        url,
        name: file.name,
        pageIndex: currentPage,
        xPercent: 35,
        yPercent: 70,
        widthPercent,
        heightPercent: Math.max(4, Math.min(45, heightPercent)),
        aspectRatio,
        rotation: 0,
        removeWhiteBg: false
      };

      setSignatures(prev => [...prev, newSig]);
      setSelectedSigId(newSig.id);
    };
    img.src = url;
  };

  // Insert drawn signature
  const handleInsertDrawnSignature = () => {
    if (!canvasRef.current || !hasDrawnSomething) return;
    const url = canvasRef.current.toDataURL('image/png');
    
    const aspectRatio = 2.4;
    const widthPercent = 26;
    const containerAspect = docAspect || (1 / 1.414);
    const heightPercent = (widthPercent * containerAspect) / aspectRatio;

    const newSig: SignatureItem = {
      id: Math.random().toString(36).substring(7),
      url,
      name: `Signature_${new Date().toLocaleTimeString()}`,
      pageIndex: currentPage,
      xPercent: 35,
      yPercent: 70,
      widthPercent,
      heightPercent: Math.max(4, heightPercent),
      aspectRatio,
      rotation: 0,
      removeWhiteBg: false
    };

    setSignatures(prev => [...prev, newSig]);
    setSelectedSigId(newSig.id);
    setIsDrawModalOpen(false);
  };

  // Update a signature property
  const updateSignature = (id: string, updates: Partial<SignatureItem>) => {
    setSignatures(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  // Delete signature
  const removeSignature = (id: string) => {
    setSignatures(prev => prev.filter(s => s.id !== id));
    if (activeSelectedId === id) setSelectedSigId(null);
  };

  // Duplicate signature
  const duplicateSignature = (sig: SignatureItem) => {
    const copy: SignatureItem = {
      ...sig,
      id: Math.random().toString(36).substring(7),
      xPercent: Math.min(80, sig.xPercent + 4),
      yPercent: Math.min(80, sig.yPercent + 4),
      rotation: sig.rotation || 0
    };
    setSignatures(prev => [...prev, copy]);
    setSelectedSigId(copy.id);
  };

  // Quick scale by percent
  const handleScaleStep = (sigId: string, deltaPercent: number) => {
    const sig = signatures.find(s => s.id === sigId);
    if (!sig || !pageContainerRef.current) return;
    const rect = pageContainerRef.current.getBoundingClientRect();
    const containerAspect = rect.width / rect.height;

    const newWidth = Math.max(6, Math.min(95, sig.widthPercent + deltaPercent));
    const newHeight = (newWidth * containerAspect) / (sig.aspectRatio || 2);

    const newX = Math.max(0, Math.min(100 - newWidth, sig.xPercent - deltaPercent / 2));
    const newY = Math.max(0, Math.min(100 - newHeight, sig.yPercent));

    updateSignature(sigId, {
      xPercent: newX,
      yPercent: newY,
      widthPercent: newWidth,
      heightPercent: Math.max(3, Math.min(95, newHeight))
    });
  };

  // Quick preset sizes
  const handleSetPresetSize = (sigId: string, targetWidthPercent: number) => {
    const sig = signatures.find(s => s.id === sigId);
    if (!sig || !pageContainerRef.current) return;
    const rect = pageContainerRef.current.getBoundingClientRect();
    const containerAspect = rect.width / rect.height;

    const newHeight = (targetWidthPercent * containerAspect) / (sig.aspectRatio || 2);
    const newX = Math.max(0, Math.min(100 - targetWidthPercent, sig.xPercent));
    const newY = Math.max(0, Math.min(100 - newHeight, sig.yPercent));

    updateSignature(sigId, {
      xPercent: newX,
      yPercent: newY,
      widthPercent: targetWidthPercent,
      heightPercent: Math.max(3, Math.min(95, newHeight))
    });
  };

  // Step rotation
  const handleRotateStep = (sigId: string, deltaAngle: number) => {
    const sig = signatures.find(s => s.id === sigId);
    if (!sig) return;
    const currentRot = sig.rotation || 0;
    const nextRot = (((currentRot + deltaAngle) % 360) + 360) % 360;
    updateSignature(sigId, { rotation: nextRot });
  };

  // Reset rotation
  const handleResetRotation = (sigId: string) => {
    updateSignature(sigId, { rotation: 0 });
  };

  // Expose methods via ref for external controls (e.g. from App.tsx sidebar)
  React.useImperativeHandle(ref, () => ({
    updateSignature,
    removeSignature,
    rotateSignature: handleRotateStep,
    scaleSignature: handleScaleStep,
    setPresetSize: handleSetPresetSize,
    setSelectedSigId
  }), [setSelectedSigId]);

  // Pointer drag logic for moving signature
  const handleSigPointerDown = (e: React.PointerEvent, sig: SignatureItem) => {
    // Only drag with primary mouse button
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedSigId(sig.id);

    dragTrackingRef.current = {
      sigId: sig.id,
      startX: e.clientX,
      startY: e.clientY,
      initX: sig.xPercent,
      initY: sig.yPercent
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!dragTrackingRef.current || !pageContainerRef.current) return;
      const rect = pageContainerRef.current.getBoundingClientRect();
      const deltaXPercent = ((moveEvt.clientX - dragTrackingRef.current.startX) / rect.width) * 100;
      const deltaYPercent = ((moveEvt.clientY - dragTrackingRef.current.startY) / rect.height) * 100;

      const currentSig = signatures.find(s => s.id === dragTrackingRef.current?.sigId);
      const widthP = currentSig?.widthPercent || sig.widthPercent;
      const heightP = currentSig?.heightPercent || sig.heightPercent;

      const newX = Math.max(0, Math.min(100 - widthP, dragTrackingRef.current.initX + deltaXPercent));
      const newY = Math.max(0, Math.min(100 - heightP, dragTrackingRef.current.initY + deltaYPercent));

      updateSignature(dragTrackingRef.current.sigId, { xPercent: newX, yPercent: newY });
    };

    const handlePointerUp = () => {
      dragTrackingRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Pointer resize logic for 4 corners (SE, SW, NE, NW)
  const handleResizePointerDown = (
    e: React.PointerEvent, 
    sig: SignatureItem, 
    corner: 'se' | 'sw' | 'ne' | 'nw'
  ) => {
    e.stopPropagation();
    setSelectedSigId(sig.id);

    resizeTrackingRef.current = {
      sigId: sig.id,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      initX: sig.xPercent,
      initY: sig.yPercent,
      initWidth: sig.widthPercent,
      initHeight: sig.heightPercent,
      aspectRatio: sig.aspectRatio || 2
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!resizeTrackingRef.current || !pageContainerRef.current) return;
      const rect = pageContainerRef.current.getBoundingClientRect();
      const containerAspect = rect.width / rect.height;
      const { corner: c, startX, startY, initX, initY, initWidth, initHeight, aspectRatio } = resizeTrackingRef.current;

      const deltaXPercent = ((moveEvt.clientX - startX) / rect.width) * 100;

      let newWidth = initWidth;
      let newHeight = initHeight;
      let newX = initX;
      let newY = initY;

      if (c === 'se') {
        // Bottom-right: origin is top-left
        newWidth = Math.max(6, Math.min(100 - initX, initWidth + deltaXPercent));
        newHeight = (newWidth * containerAspect) / aspectRatio;
        if (initY + newHeight > 100) {
          newHeight = 100 - initY;
          newWidth = (newHeight * aspectRatio) / containerAspect;
        }
      } else if (c === 'sw') {
        // Bottom-left: origin is top-right
        const rightEdge = initX + initWidth;
        newWidth = Math.max(6, Math.min(rightEdge, initWidth - deltaXPercent));
        newHeight = (newWidth * containerAspect) / aspectRatio;
        if (initY + newHeight > 100) {
          newHeight = 100 - initY;
          newWidth = (newHeight * aspectRatio) / containerAspect;
        }
        newX = rightEdge - newWidth;
      } else if (c === 'ne') {
        // Top-right: origin is bottom-left
        const bottomEdge = initY + initHeight;
        newWidth = Math.max(6, Math.min(100 - initX, initWidth + deltaXPercent));
        newHeight = (newWidth * containerAspect) / aspectRatio;
        newY = bottomEdge - newHeight;
        if (newY < 0) {
          newY = 0;
          newHeight = bottomEdge;
          newWidth = (newHeight * aspectRatio) / containerAspect;
        }
      } else if (c === 'nw') {
        // Top-left: origin is bottom-right
        const rightEdge = initX + initWidth;
        const bottomEdge = initY + initHeight;
        newWidth = Math.max(6, Math.min(rightEdge, initWidth - deltaXPercent));
        newHeight = (newWidth * containerAspect) / aspectRatio;
        newX = rightEdge - newWidth;
        newY = bottomEdge - newHeight;
        if (newY < 0) {
          newY = 0;
          newHeight = bottomEdge;
          newWidth = (newHeight * aspectRatio) / containerAspect;
          newX = rightEdge - newWidth;
        }
      }

      updateSignature(sig.id, {
        xPercent: Math.max(0, Math.min(100 - newWidth, newX)),
        yPercent: Math.max(0, Math.min(100 - newHeight, newY)),
        widthPercent: newWidth,
        heightPercent: Math.max(3, Math.min(95, newHeight))
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

  // Pointer rotation handle logic
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
      // Atan2: 0 at 3 o'clock (right). Handle is at top (12 o'clock, -90 deg).
      let deg = Math.round((rad * 180) / Math.PI) + 90;
      deg = ((deg % 360) + 360) % 360;

      // Hold Shift to snap to 15 degree intervals
      if (moveEvt.shiftKey) {
        deg = (Math.round(deg / 15) * 15) % 360;
      }

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

  // Canvas drawing handlers for signature pad
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

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
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSomething(false);
  };

  // Active page signatures
  const activePageSignatures = signatures.filter(s => s.pageIndex === currentPage);
  const activeSignature = signatures.find(s => s.id === activeSelectedId);

  // Trigger download action
  const handleInitiateDownload = () => {
    if (!docBytes) return;
    onTriggerDownloadModal(docBytes, signatures, docName || 'document.pdf');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={sigFileInputRef} 
        onChange={handleSignatureFilePicked} 
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/heic,image/gif" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={docFileInputRef} 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleDocumentFile(file);
        }} 
        accept=".pdf,application/pdf,image/*,.txt" 
        className="hidden" 
      />

      {/* 1. Empty State: No Document Uploaded */}
      {!docBytes ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
          <div 
            onClick={() => docFileInputRef.current?.click()}
            className="w-full max-w-2xl border-2 border-dashed border-ink/30 hover:border-brand hover:bg-card/60 transition-all p-10 md:p-14 text-center cursor-pointer bg-card/40 flex flex-col items-center group rounded-2xl"
          >
            <div className="w-20 h-20 bg-subtle border border-line flex items-center justify-center mb-6 group-hover:scale-105 transition-transform rounded-lg">
              <FileUp className="text-brand" size={40} />
            </div>

            <h2 className="text-lg md:text-xl font-black uppercase tracking-tight mb-2">
              Upload Document to Sign & Stamp
            </h2>
            <p className="text-xs uppercase font-medium text-ink/60 max-w-md mx-auto mb-6">
              Upload any PDF contract, letter, scan, or form. You can add signatures or stamps, freely rotate, resize, position, and export.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  docFileInputRef.current?.click();
                }}
                className="px-6 h-12 bg-ink text-canvas font-bold uppercase text-[10px] tracking-widest hover:bg-brand/80 transition-colors flex items-center gap-2"
              >
                <FileText size={16} />
                Browse Document
              </button>

              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadSampleContract();
                }}
                className="px-6 h-12 bg-card border border-line font-bold uppercase text-[10px] tracking-widest hover:bg-subtle transition-colors flex items-center gap-2 rounded-lg"
              >
                <Sparkles size={16} className="text-brand" />
                Try Sample Contract
              </button>
            </div>

            <p className="text-[10px] font-bold uppercase tracking-wider text-brand mt-6 opacity-80">
              Supports PDF, PNG, JPG, HEIC, TXT
            </p>
          </div>
        </div>
      ) : (
        /* 2. Document Loaded Workspace */
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Top Control Bar */}
          <div className="bg-card border-b-2 border-line p-3 md:p-4 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shadow-sm">
            {/* Left: Document Info & Change */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-subtle border border-ink/20 rounded-lg">
                <FileText size={18} className="text-brand" />
              </div>
              <div className="max-w-[150px] sm:max-w-xs truncate">
                <h4 className="text-xs font-black uppercase tracking-tight truncate">{docName}</h4>
                <p className="text-[9px] font-bold uppercase text-ink/50">
                  {pageCount} {pageCount === 1 ? 'Page' : 'Pages'} • Client-side Encrypted
                </p>
              </div>
              <button 
                onClick={() => docFileInputRef.current?.click()}
                className="text-[9px] font-black uppercase underline underline-offset-4 hover:text-brand transition-colors ml-1 hidden sm:inline-block"
              >
                Replace File
              </button>
            </div>

            {/* Center: Upload Signature Button + Draw Signature Button */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                id="upload-signature-btn"
                onClick={handleUploadSignatureClick}
                className="h-10 md:h-11 px-4 md:px-5 bg-brand text-canvas font-black uppercase text-[10px] md:text-xs tracking-widest hover:bg-ink/80 transition-all flex items-center gap-2 active:translate-y-0.5"
                title="Upload image or transparent signature"
              >
                <Upload size={16} />
                <span>Upload Signature</span>
              </button>

              <button
                onClick={() => {
                  setIsDrawModalOpen(true);
                  setTimeout(() => clearCanvas(), 50);
                }}
                className="h-10 md:h-11 px-3 md:px-4 bg-subtle border border-line font-bold uppercase text-[10px] tracking-widest hover:bg-card transition-colors flex items-center gap-2 rounded-lg"
                title="Draw your signature directly on screen"
              >
                <PenTool size={15} className="text-brand" />
                <span className="hidden sm:inline">Draw Signature</span>
              </button>
            </div>

            {/* Right: Page Navigation, Zoom, and Download */}
            <div className="flex items-center gap-2">
              {pageCount > 1 && (
                <div className="flex items-center bg-subtle border border-line p-0.5 text-xs font-bold rounded-md">
                  <button 
                    onClick={() => {
                      setSelectedSigId(null);
                      setCurrentPage(p => Math.max(0, p - 1));
                    }}
                    disabled={currentPage === 0}
                    className="p-1 hover:bg-card disabled:opacity-20 transition-colors"
                    title="Previous Page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-2 text-[10px] uppercase font-black">
                    {currentPage + 1} / {pageCount}
                  </span>
                  <button 
                    onClick={() => {
                      setSelectedSigId(null);
                      setCurrentPage(p => Math.min(pageCount - 1, p + 1));
                    }}
                    disabled={currentPage >= pageCount - 1}
                    className="p-1 hover:bg-card disabled:opacity-20 transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {/* Zoom Controls */}
              <div className="hidden lg:flex items-center bg-subtle border border-line p-0.5 rounded-md">
                <button 
                  onClick={() => setZoomLevel(z => Math.max(70, z - 10))}
                  className="p-1 hover:bg-card transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-[9px] font-black uppercase px-1.5 min-w-[40px] text-center">{zoomLevel}%</span>
                <button 
                  onClick={() => setZoomLevel(z => Math.min(150, z + 10))}
                  className="p-1 hover:bg-card transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
              </div>

              {/* Quick Download Button in Top Bar */}
              <button
                onClick={handleInitiateDownload}
                disabled={isDownloading}
                className="h-10 px-4 bg-ink text-canvas font-black uppercase text-[10px] tracking-widest hover:bg-brand/80 transition-all flex items-center gap-1.5 ml-1"
                title="Download Document with Custom Name"
              >
                <Download size={14} />
                <span className="hidden md:inline">Download</span>
              </button>
            </div>
          </div>

          {/* Main Visual Document Canvas Area */}
          {/* Clicking anywhere on the workspace backdrop deselects active signature */}
          <div 
            onClick={() => setSelectedSigId(null)}
            className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center bg-subtle/70 relative select-none cursor-default"
          >
            {isLoadingDoc ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="animate-spin text-brand" size={36} />
                <p className="text-xs font-black uppercase tracking-widest">Loading Document Pages...</p>
              </div>
            ) : renderedPageUrl ? (
              <div 
                style={{ width: `${Math.round(zoomLevel * 0.75)}%`, maxWidth: '900px', minWidth: '320px' }}
                className="transition-all duration-150 mx-auto"
              >
                {/* PDF Page Container */}
                {/* Clicking on the page background (not on a signature) deselects */}
                <div 
                  ref={pageContainerRef}
                  onClick={(e) => {
                    // Deselect when clicking directly on page background
                    setSelectedSigId(null);
                  }}
                  className="relative bg-paper shadow-xl shadow-black/10 ring-1 ring-ink/10 overflow-visible"
                  style={{
                    aspectRatio: docAspect ? `${docAspect}` : '1 / 1.414',
                  }}
                >
                  {/* Background Rendered PDF Page */}
                  <img 
                    src={renderedPageUrl} 
                    alt={`Page ${currentPage + 1}`}
                    className="w-full h-full object-contain pointer-events-none select-none"
                    draggable={false}
                  />

                  {/* Empty state hint on page if no signature added yet */}
                  {activePageSignatures.length === 0 && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUploadSignatureClick();
                      }}
                      className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none"
                    >
                      <div className="bg-card/95 border border-dashed border-brand rounded-xl p-4 text-center max-w-sm pointer-events-auto cursor-pointer hover:bg-card transition-all shadow-lg shadow-black/10">
                        <Upload size={24} className="mx-auto mb-2 text-brand animate-bounce" />
                        <h5 className="text-[11px] font-black uppercase tracking-widest text-ink">Click to Add Signature Here</h5>
                        <p className="text-[9px] uppercase font-bold text-ink/60 mt-1">Upload an image file or use Draw Signature</p>
                      </div>
                    </div>
                  )}

                  {/* Render Signatures on Current Page */}
                  {activePageSignatures.map((sig) => {
                    const isSelected = activeSelectedId === sig.id;
                    const rotAngle = sig.rotation || 0;
                    const isNearTop = sig.yPercent < 15;

                    return (
                      <div
                        key={sig.id}
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
                          "group transition-shadow duration-100 flex items-center justify-center",
                          isSelected 
                            ? "ring-2 ring-brand z-30" 
                            : "hover:ring-2 hover:ring-brand/60 z-20"
                        )}
                        title={isSelected ? "Drag to move signature" : "Click to select signature"}
                      >
                        {/* Signature Image */}
                        <img 
                          src={sig.url} 
                          alt="Signature"
                          draggable={false}
                          className={cn(
                            "w-full h-full object-contain select-none pointer-events-none",
                            sig.removeWhiteBg && "mix-blend-multiply"
                          )}
                        />

                        {/* Unselected subtle hover indicator */}
                        {!isSelected && (
                          <div className="absolute inset-0 border border-black/20 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                        )}

                        {/* Selection Frame, 4 Corner Handles, Rotation Stem, and Floating Mini-Toolbar */}
                        {isSelected && (
                          <>
                            {/* Dashed selection border */}
                            <div className="absolute inset-0 border-2 border-dashed border-brand pointer-events-none" />

                            {/* --- 1. ROTATE STEM & HANDLE --- */}
                            <div 
                              onPointerDown={(e) => handleRotatePointerDown(e, sig)}
                              className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing group/rot z-50 select-none"
                              title="Drag to rotate signature (Hold Shift for 15° snap)"
                            >
                              <div className="w-5 h-5 bg-brand text-canvas rounded-full border-2 border-white flex items-center justify-center hover:scale-125 transition-transform">
                                <RotateCw size={11} className="pointer-events-none" />
                              </div>
                              <div className="w-[2px] h-2 bg-brand" />
                              {/* Angle readout tooltip when rotating */}
                              {isRotating && rotationPreviewAngle !== null && (
                                <div className="absolute -top-6 bg-ink text-canvas text-[8px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                                  {rotationPreviewAngle}°
                                </div>
                              )}
                            </div>

                            {/* --- 2. FOUR CORNER RESIZE HANDLES --- */}
                            {/* NW: Top-Left */}
                            <div 
                              onPointerDown={(e) => handleResizePointerDown(e, sig, 'nw')}
                              className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-brand border-2 border-white cursor-nwse-resize shadow-md hover:scale-125 transition-transform z-40 rounded-lg"
                              title="Drag to resize (Top-Left)"
                            />

                            {/* NE: Top-Right */}
                            <div 
                              onPointerDown={(e) => handleResizePointerDown(e, sig, 'ne')}
                              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-brand border-2 border-white cursor-nesw-resize shadow-md hover:scale-125 transition-transform z-40 rounded-lg"
                              title="Drag to resize (Top-Right)"
                            />

                            {/* SW: Bottom-Left */}
                            <div 
                              onPointerDown={(e) => handleResizePointerDown(e, sig, 'sw')}
                              className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-brand border-2 border-white cursor-nesw-resize shadow-md hover:scale-125 transition-transform z-40 rounded-lg"
                              title="Drag to resize (Bottom-Left)"
                            />

                            {/* SE: Bottom-Right */}
                            <div 
                              onPointerDown={(e) => handleResizePointerDown(e, sig, 'se')}
                              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-brand border-2 border-white cursor-nwse-resize flex items-center justify-center shadow-md z-40 hover:scale-125 transition-transform rounded-lg"
                              title="Drag to resize (Bottom-Right)"
                            >
                              <Maximize2 size={8} className="text-canvas pointer-events-none" />
                            </div>

                            {/* --- 3. FLOATING ACTION TOOLBAR --- */}
                            {/* Counter-rotate by -rotAngle so buttons always stay perfectly level with screen! */}
                            <div 
                              onPointerDown={(e) => e.stopPropagation()} 
                              style={{ transform: `rotate(-${rotAngle}deg)` }}
                              className={cn(
                                "theme-dark absolute left-1/2 -translate-x-1/2 bg-card text-ink px-2 py-1 rounded-lg flex items-center gap-1.5 shadow-lg shadow-black/10 whitespace-nowrap z-50 border border-line select-none",
                                isNearTop ? "-bottom-12" : "-top-12"
                              )}
                            >
                              {/* Scale Buttons & Badge */}
                              <button
                                onClick={() => handleScaleStep(sig.id, -4)}
                                title="Scale down (-4%)"
                                className="p-0.5 hover:text-brand text-ink/80 transition-colors"
                              >
                                <ZoomOut size={12} />
                              </button>
                              <span className="text-[8px] font-bold uppercase tracking-wider text-ink/90 px-0.5">
                                {Math.round(sig.widthPercent)}% W
                              </span>
                              <button
                                onClick={() => handleScaleStep(sig.id, 4)}
                                title="Scale up (+4%)"
                                className="p-0.5 hover:text-brand text-ink/80 transition-colors"
                              >
                                <ZoomIn size={12} />
                              </button>

                              <div className="h-3 w-[1px] bg-ink/15 mx-0.5" />

                              {/* Rotate 90° CCW / CW */}
                              <button
                                onClick={() => handleRotateStep(sig.id, -90)}
                                title="Rotate 90° Counter-Clockwise"
                                className="p-1 hover:text-brand text-ink/80 transition-colors"
                              >
                                <RotateCcw size={12} />
                              </button>
                              <button
                                onClick={() => handleRotateStep(sig.id, 90)}
                                title="Rotate 90° Clockwise (R)"
                                className="p-1 hover:text-brand text-ink/80 transition-colors"
                              >
                                <RotateCw size={12} />
                              </button>

                              {/* If rotated, show angle and reset button */}
                              {rotAngle !== 0 && (
                                <button
                                  onClick={() => handleResetRotation(sig.id)}
                                  title="Reset rotation to 0°"
                                  className="px-1 py-0.5 text-[8px] font-black uppercase bg-amber-400 text-canvas rounded hover:bg-amber-300 transition-colors"
                                >
                                  {rotAngle}° (Reset)
                                </button>
                              )}

                              <div className="h-3 w-[1px] bg-ink/15 mx-0.5" />

                              {/* Clear Background Toggle */}
                              <button
                                onClick={() => updateSignature(sig.id, { removeWhiteBg: !sig.removeWhiteBg })}
                                title="Toggle Transparent White Background"
                                className={cn(
                                  "px-1 py-0.5 text-[8px] uppercase font-bold transition-colors",
                                  sig.removeWhiteBg ? "text-amber-400 font-black" : "text-ink/70 hover:text-ink"
                                )}
                              >
                                Clear BG
                              </button>

                              {/* Duplicate */}
                              <button
                                onClick={() => duplicateSignature(sig)}
                                title="Duplicate Signature"
                                className="p-1 hover:text-brand text-ink/80 transition-colors"
                              >
                                <Copy size={12} />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => removeSignature(sig.id)}
                                title="Delete Signature (Del)"
                                className="p-1 text-red-400 hover:text-red-300 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>

                              <div className="h-3 w-[1px] bg-ink/15 mx-0.5" />

                              {/* DESELECT / DONE BUTTON */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSigId(null);
                                }}
                                title="Unselect Signature (Esc)"
                                className="px-1.5 py-0.5 bg-ink/15 hover:bg-ink/80 hover:text-canvas text-ink rounded text-[8px] font-bold uppercase flex items-center gap-0.5 transition-colors"
                              >
                                <Check size={10} />
                                <span>Done</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Page indicator below */}
                <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink/60 px-2">
                  <span>Page {currentPage + 1} of {pageCount}</span>
                  <span className="text-brand">
                    {activePageSignatures.length} {activePageSignatures.length === 1 ? 'Signature' : 'Signatures'} on this page
                  </span>
                </div>
              </div>
            ) : null}

            {/* Bottom Floating Helper Bar when a signature is selected */}
            <AnimatePresence>
              {activeSignature && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className="theme-dark fixed bottom-6 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur text-ink border border-line rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-xl shadow-black/10 z-40 text-[10px] font-bold uppercase tracking-wider"
                >
                  <span className="flex items-center gap-1.5 text-amber-400 font-black">
                    <Sliders size={13} />
                    {activeSignature.name || 'Selected Overlay'}
                  </span>

                  <span className="opacity-30">|</span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleRotateStep(activeSignature.id, 90)}
                      className="px-2 py-0.5 bg-ink/10 hover:bg-ink/20 text-ink text-[9px] rounded flex items-center gap-1"
                      title="Rotate 90 degrees (R)"
                    >
                      <RotateCw size={11} />
                      Rotate 90°
                    </button>

                    <button
                      onClick={() => handleScaleStep(activeSignature.id, -4)}
                      className="px-1.5 py-0.5 bg-ink/10 hover:bg-ink/20 text-ink text-[9px] rounded"
                      title="Scale down"
                    >
                      -
                    </button>
                    <span className="text-[9px] text-ink/80">{Math.round(activeSignature.widthPercent)}%</span>
                    <button
                      onClick={() => handleScaleStep(activeSignature.id, 4)}
                      className="px-1.5 py-0.5 bg-ink/10 hover:bg-ink/20 text-ink text-[9px] rounded"
                      title="Scale up"
                    >
                      +
                    </button>
                  </div>

                  <span className="opacity-30 hidden md:inline">|</span>

                  <span className="text-[9px] text-ink/70 font-medium hidden md:inline">
                    Drag corners to resize • Top handle to rotate • Esc to unselect
                  </span>

                  <button 
                    onClick={() => setSelectedSigId(null)}
                    className="ml-2 px-3 py-1 bg-brand text-canvas text-[9px] font-black uppercase rounded-md hover:bg-ink/80 hover:text-canvas transition-colors flex items-center gap-1 shadow-sm active:translate-y-0.5"
                  >
                    <Check size={12} />
                    Unselect (Esc)
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Draw Signature Modal */}
      <AnimatePresence>
        {isDrawModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setIsDrawModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-line w-full max-w-lg shadow-xl shadow-black/10 overflow-hidden flex flex-col rounded-2xl"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-subtle">
                <div className="flex items-center gap-2">
                  <PenTool className="text-brand" size={18} />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em]">Draw Your Signature</h3>
                </div>
                <button 
                  onClick={() => setIsDrawModalOpen(false)}
                  className="p-1 hover:bg-ink/80 hover:text-canvas transition-colors border border-line bg-card rounded-md"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 bg-canvas">
                <p className="text-[10px] uppercase font-bold text-ink/70">
                  Use your finger, mouse, or stylus to write your signature below:
                </p>

                {/* Drawing Canvas */}
                <div className="border border-line bg-paper relative rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={700}
                    height={300}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-56 cursor-crosshair touch-none bg-paper block"
                  />
                  {/* Baseline guide */}
                  <div className="absolute bottom-12 left-8 right-8 border-b border-dashed border-black/20 pointer-events-none flex justify-between text-[9px] font-bold uppercase text-black/40 pb-1">
                    <span>Sign on this line</span>
                    <span>X</span>
                  </div>
                </div>

                {/* Pen Tools */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase opacity-60">Color:</span>
                    {['#111111', '#1e3a8a', '#78350f'].map((c) => (
                      <button
                        key={c}
                        onClick={() => setPenColor(c)}
                        style={{ backgroundColor: c }}
                        className={cn(
                          "w-6 h-6 rounded-full border-2 transition-all",
                          penColor === c ? "border-brand scale-110 shadow-sm" : "border-ink/20"
                        )}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase opacity-60">Width:</span>
                    {[2, 3, 5].map((w) => (
                      <button
                        key={w}
                        onClick={() => setPenWidth(w)}
                        className={cn(
                          "px-2 py-0.5 text-[9px] font-bold border transition-colors rounded-md",
                          penWidth === w ? "bg-ink text-canvas border-line" : "bg-subtle border-ink/20"
                        )}
                      >
                        {w === 2 ? 'Fine' : w === 3 ? 'Medium' : 'Thick'}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={clearCanvas}
                    className="text-[9px] font-bold uppercase underline underline-offset-4 hover:text-red-600 transition-colors"
                  >
                    Clear
                  </button>
                </div>

                {/* Modal Actions */}
                <div className="flex gap-3 pt-4 border-t border-ink/10">
                  <button
                    onClick={() => setIsDrawModalOpen(false)}
                    className="px-4 h-11 border border-line font-bold uppercase text-[10px] tracking-widest hover:bg-subtle transition-colors rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInsertDrawnSignature}
                    disabled={!hasDrawnSomething}
                    className="flex-1 h-11 bg-brand text-canvas font-bold uppercase text-[10px] tracking-widest hover:bg-ink/80 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <Check size={16} />
                    Insert Signature
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
