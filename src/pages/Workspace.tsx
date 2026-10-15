import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone, type DropzoneOptions } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileImage, 
  Trash2, 
  RotateCw, 
  Crop, 
  Download, 
  GripVertical, 
  X, 
  ArrowRight,
  PlusCircle,
  FileText,
  Sliders,
  Scissors,
  FileUp,
  Layers,
  CheckCircle2,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Zap,
  FileBox,
  FileCode,
  Table,
  FileType,
  PenTool,
  Upload,
  RotateCcw,
  Check,
  Copy
} from 'lucide-react';
import Cropper, { type Point, type Area } from 'react-easy-crop';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn, imageToCanvas, rotateImage, cropImage } from '@/src/lib/utils';
import { getPdfMetadata, extractPdfPages, imagesToPdf } from '@/src/lib/pdfUtils';
import { pdfToDocx, csvToExcel, jsonToExcel, jsonToCsv, textToPdf } from '@/src/lib/convUtils';
import { processFileForImageUpload, isHeicFile } from '@/src/lib/heicUtils';
import { DocumentSigner, type DocumentSignerRef } from '@/src/components/DocumentSigner';
import { SignatureItem, embedSignaturesIntoPdf } from '@/src/lib/signerUtils';
import { saveAs } from 'file-saver';
import { Logo, GitHubMark } from '@/src/components/brand';
import { GITHUB_URL, TOOLS, type ToolId } from '@/src/lib/site';
import { navigate } from '@/src/lib/router';

// --- Types ---

type ToolType = ToolId;
type ConversionMode = 'pdf-to-docx' | 'csv-to-excel' | 'json-to-excel' | 'json-to-csv' | 'text-to-pdf';

interface ImageData {
  id: string;
  url: string;
  name: string;
  type: string;
  width: number;
  height: number;
  size: number;
}

// --- Components ---

interface SortableImageProps {
  image: ImageData;
  index: number;
  onRemove: (id: string) => void;
  onEdit: (image: ImageData) => void;
  onRotate: (id: string) => Promise<void>;
  key?: React.Key;
}

function SortableImage({ image, index, onRemove, onEdit, onRotate }: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "bg-card border border-line p-4 flex flex-col relative group transition-all duration-300 rounded-lg",
        isDragging ? " ring-1 ring-brand" : "hover:border-brand"
      )}
    >
      <div className="absolute top-6 left-6 z-10 bg-brand text-canvas text-[10px] px-2 py-1 font-bold">
        {String(index + 1).padStart(2, '0')}
      </div>

      <div 
        {...attributes} 
        {...listeners}
        className="flex-1 bg-subtle flex items-center justify-center border border-ink/10 aspect-square overflow-hidden cursor-grab active:cursor-grabbing rounded-lg"
      >
        <img 
          src={image.url} 
          alt={image.name} 
          className="w-full h-full object-cover select-none group-hover:scale-105 transition-transform duration-500"
        />
      </div>

      <div className="mt-4 flex justify-between items-center gap-2">
        <span className="text-[10px] font-bold uppercase truncate max-w-[100px]">{image.name}</span>
        <div className="flex gap-3 shrink-0">
          <button 
            onClick={() => onRotate(image.id)}
            className="text-[10px] uppercase font-bold underline underline-offset-4 decoration-1 hover:text-brand transition-colors"
          >
            Rotate
          </button>
          <button 
            onClick={() => onEdit(image)}
            className="text-[10px] uppercase font-bold underline underline-offset-4 decoration-1 hover:text-brand transition-colors"
          >
            Crop
          </button>
          <button 
            onClick={() => onRemove(image.id)}
            className="text-[10px] uppercase font-bold underline underline-offset-4 decoration-1 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function Workspace({ tool }: { tool: ToolId }) {
  const activeTool = tool;
  const [images, setImages] = useState<ImageData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  const [quality, setQuality] = useState(0.85);
  const [editingImage, setEditingImage] = useState<ImageData | null>(null);
  
  // PDF Splitter State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviews, setPdfPreviews] = useState<string[]>([]);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [viewingPageIndex, setViewingPageIndex] = useState<number | null>(null);
  
  // Converter State
  const [conversionMode, setConversionMode] = useState<ConversionMode>('pdf-to-docx');
  const [convFile, setConvFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convResult, setConvResult] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  
  // Cropper State
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // PDF Naming Modal State
  const [isNamingModalOpen, setIsNamingModalOpen] = useState(false);
  const [customPdfName, setCustomPdfName] = useState('');
  const [namingActionType, setNamingActionType] = useState<'image-to-pdf' | 'pdf-splitter' | 'text-to-pdf' | 'sign-pdf' | null>(null);

  // Sign Document State
  const [signDocBytes, setSignDocBytes] = useState<Uint8Array | null>(null);
  const [signFilename, setSignFilename] = useState<string>('document.pdf');
  const [signSignatures, setSignSignatures] = useState<SignatureItem[]>([]);
  const [signSelectedSigId, setSignSelectedSigId] = useState<string | null>(null);
  const [isSigningPdf, setIsSigningPdf] = useState(false);
  const documentSignerRef = useRef<DocumentSignerRef | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [imageProcessingText, setImageProcessingText] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: any[] = []) => {
    const validRejectedFiles = (fileRejections || [])
      .map((r: any) => r?.file)
      .filter((file: File) => {
        if (!file) return false;
        const name = file.name ? file.name.toLowerCase() : '';
        const type = (file.type || '').toLowerCase();
        return (
          isHeicFile(file) ||
          type.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif|tiff|svg)$/i.test(name)
        );
      });

    const targetFiles = [...acceptedFiles, ...validRejectedFiles];
    if (!targetFiles || targetFiles.length === 0) return;
    setIsProcessingImages(true);

    const hasHeic = targetFiles.some(isHeicFile);
    if (hasHeic) {
      setImageProcessingText('Converting HEIC image files...');
    } else {
      setImageProcessingText('Loading assets...');
    }

    try {
      const processedFiles: File[] = [];
      for (let i = 0; i < targetFiles.length; i++) {
        const file = targetFiles[i];
        if (isHeicFile(file)) {
          setImageProcessingText(`Converting HEIC image ${i + 1} of ${targetFiles.length}...`);
        }
        const processed = await processFileForImageUpload(file);
        processedFiles.push(processed);
      }

      const newImages = await Promise.all(
        processedFiles.map(async (file) => {
          const url = URL.createObjectURL(file);
          return new Promise<ImageData>((resolve) => {
            const img = new Image();
            img.onload = () => {
              resolve({
                id: Math.random().toString(36).substring(7),
                url,
                name: file.name,
                type: file.type,
                width: img.width,
                height: img.height,
                size: file.size
              });
            };
            img.onerror = () => {
              resolve({
                id: Math.random().toString(36).substring(7),
                url,
                name: file.name,
                type: file.type || 'image/jpeg',
                width: 800,
                height: 600,
                size: file.size
              });
            };
            img.src = url;
          });
        })
      );
      setImages(prev => [...prev, ...newImages]);
    } catch (err) {
      console.error("Error processing dropped images", err);
    } finally {
      setIsProcessingImages(false);
      setImageProcessingText(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.bmp', '.HEIC', '.HEIF', '.JPG', '.JPEG', '.PNG'],
      'image/heic': ['.heic', '.HEIC'],
      'image/heif': ['.heif', '.HEIF'],
      'image/x-heic': ['.heic', '.HEIC'],
      'application/octet-stream': ['.heic', '.HEIC', '.heif', '.HEIF']
    },
    multiple: true
  } as any);

  const { getRootProps: getPdfRootProps, getInputProps: getPdfInputProps, isDragActive: isPdfDragActive } = useDropzone({
    onDrop: (files) => handlePdfDrop(files),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  const handlePdfDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessingPdf(true);
    setPdfFile(file);
    setSelectedPages([]);
    
    try {
      const metadata = await getPdfMetadata(file);
      setPdfPageCount(metadata.pageCount);
      setPdfPreviews(metadata.previews);
    } catch (err) {
      console.error("PDF processing error", err);
    } finally {
      setIsProcessingPdf(false);
    }
  }, []);

  const togglePageSelection = (index: number) => {
    setSelectedPages(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index) 
        : [...prev, index].sort((a, b) => a - b)
    );
  };

  const openNamingModal = (type: 'image-to-pdf' | 'pdf-splitter' | 'text-to-pdf' | 'sign-pdf') => {
    let defaultBase = '';
    if (type === 'image-to-pdf') {
      defaultBase = `snap-pdf-${new Date().getTime()}`;
    } else if (type === 'pdf-splitter') {
      defaultBase = `split-${pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'document'}`;
    } else if (type === 'text-to-pdf') {
      defaultBase = convFile ? convFile.name.replace(/\.txt$/i, '') : 'converted';
    } else if (type === 'sign-pdf') {
      const base = signFilename ? signFilename.replace(/\.[^/.]+$/, '') : 'document';
      defaultBase = `${base}-signed`;
    }
    setCustomPdfName(defaultBase);
    setNamingActionType(type);
    setIsNamingModalOpen(true);
  };

  const getDefaultPdfName = (type: 'image-to-pdf' | 'pdf-splitter' | 'text-to-pdf' | 'sign-pdf' | null) => {
    if (type === 'image-to-pdf') {
      return `snap-pdf-${new Date().getTime()}.pdf`;
    }
    if (type === 'pdf-splitter') {
      return `split-${pdfFile?.name || 'document.pdf'}`;
    }
    if (type === 'text-to-pdf') {
      return `${convFile?.name.replace(/\.txt$/i, '') || 'converted'}.pdf`;
    }
    if (type === 'sign-pdf') {
      const base = signFilename ? signFilename.replace(/\.[^/.]+$/, '') : 'document';
      return `${base}-signed.pdf`;
    }
    return 'document.pdf';
  };

  const handleConfirmCustomName = (useDefault: boolean) => {
    setIsNamingModalOpen(false);

    let finalName = '';
    if (useDefault || !customPdfName.trim()) {
      finalName = getDefaultPdfName(namingActionType);
    } else {
      let raw = customPdfName.trim();
      if (!raw.toLowerCase().endsWith('.pdf')) {
        raw += '.pdf';
      }
      finalName = raw;
    }

    if (namingActionType === 'image-to-pdf') {
      generatePDF(finalName);
    } else if (namingActionType === 'pdf-splitter') {
      handleSplitPdf(finalName);
    } else if (namingActionType === 'text-to-pdf') {
      handleConversion(finalName);
    } else if (namingActionType === 'sign-pdf') {
      handleDownloadSignedPdf(finalName);
    }
  };

  const handleDownloadSignedPdf = async (customFilename?: string) => {
    if (!signDocBytes) return;
    setIsSigningPdf(true);
    const finalName = customFilename || getDefaultPdfName('sign-pdf');

    try {
      const signedBytes = await embedSignaturesIntoPdf(signDocBytes, signSignatures);
      const blob = new Blob([signedBytes], { type: 'application/pdf' });
      saveAs(blob, finalName);
    } catch (err) {
      console.error("Failed to embed signatures and save PDF:", err);
    } finally {
      setIsSigningPdf(false);
    }
  };

  const handleSplitPdf = async (customFilename?: string) => {
    if (!pdfFile || selectedPages.length === 0) return;
    setIsGenerating(true);

    const finalName = customFilename || `split-${pdfFile.name}`;

    try {
      const pdfBytes = await extractPdfPages(pdfFile, selectedPages);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = finalName;
      link.click();
    } catch (err) {
      console.error("Split error", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const { getRootProps: getConvRootProps, getInputProps: getConvInputProps, isDragActive: isConvDragActive } = useDropzone({
    onDrop: async (files) => {
      const file = files[0];
      if (!file) return;
      setConvFile(file);
      setConvResult(null);
      
      if (conversionMode === 'pdf-to-docx' && file.type === 'application/pdf') {
        setIsProcessingPdf(true);
        try {
          const { pageCount, previews } = await getPdfMetadata(file);
          setPdfPageCount(pageCount);
          setPdfPreviews(previews);
          setSelectedPages([]); // Reset selection if any
        } catch (err) {
          console.error("PDF processing error", err);
        } finally {
          setIsProcessingPdf(false);
        }
      }
    },
    accept: conversionMode === 'pdf-to-docx' 
      ? { 'application/pdf': ['.pdf'] } 
      : conversionMode === 'csv-to-excel' 
      ? { 'text/csv': ['.csv'] }
      : conversionMode === 'text-to-pdf'
      ? { 'text/plain': ['.txt'] }
      : { 'application/json': ['.json'] },
    multiple: false
  } as any);

  const handleConversion = async (customFilename?: string) => {
    if (!convFile) return;
    setIsConverting(true);
    try {
      let blobResult: Blob | Uint8Array;
      let filename: string;

      switch(conversionMode) {
        case 'pdf-to-docx':
          blobResult = await pdfToDocx(convFile);
          filename = convFile.name.replace(/\.pdf$/i, '') + '.docx';
          break;
        case 'csv-to-excel':
          blobResult = await csvToExcel(convFile);
          filename = convFile.name.replace(/\.csv$/i, '') + '.xlsx';
          break;
        case 'json-to-excel':
          blobResult = await jsonToExcel(convFile);
          filename = convFile.name.replace(/\.json$/i, '') + '.xlsx';
          break;
        case 'json-to-csv':
          blobResult = await jsonToCsv(convFile);
          filename = convFile.name.replace(/\.json$/i, '') + '.csv';
          break;
        case 'text-to-pdf':
          blobResult = await textToPdf(convFile);
          if (customFilename && customFilename.trim()) {
            filename = customFilename.trim().toLowerCase().endsWith('.pdf')
              ? customFilename.trim()
              : `${customFilename.trim()}.pdf`;
          } else {
            filename = convFile.name.replace(/\.txt$/i, '') + '.pdf';
          }
          break;
        default:
          throw new Error("Mode not supported");
      }
      
      const blob = new Blob([blobResult]);
      const url = URL.createObjectURL(blob);
      setConvResult({ blob, url, name: filename });
    } catch (err) {
      console.error("Conversion error", err);
    } finally {
      setIsConverting(false);
    }
  };

  const handleRemove = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleRotate = async (id: string) => {
    const img = images.find(i => i.id === id);
    if (!img) return;

    try {
      const canvas = await imageToCanvas(img.url);
      const newUrl = await rotateImage(canvas, 90);
      setImages(prev => prev.map(i => i.id === id ? { ...i, url: newUrl } : i));
    } catch (err) {
      console.error("Rotate error", err);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApplyCrop = async () => {
    if (!editingImage || !croppedAreaPixels) return;

    try {
      const newUrl = await cropImage(editingImage.url, croppedAreaPixels);
      setImages(prev => prev.map(i => i.id === editingImage.id ? { ...i, url: newUrl } : i));
      setEditingImage(null);
    } catch (err) {
      console.error("Crop error", err);
    }
  };

  const generatePDF = async (customFilename?: string) => {
    if (images.length === 0) return;
    setIsGenerating(true);
    setPdfProgress({ current: 0, total: images.length });

    const finalName = customFilename || `snap-pdf-${new Date().getTime()}.pdf`;

    try {
      const pdfBytes = await imagesToPdf(images, quality, (current, total) => {
        setPdfProgress({ current, total });
      });

      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      saveAs(blob, finalName);
    } catch (error) {
      console.error("PDF generation error", error);
    } finally {
      setIsGenerating(false);
      setPdfProgress(null);
    }
  };

  const resetAll = () => {
    setImages([]);
    setConvFile(null);
    setConvResult(null);
    setPdfFile(null);
    setPdfPreviews([]);
    setPdfPageCount(0);
    setSelectedPages([]);
    setIsConverting(false);
    setIsGenerating(false);
    setIsSigningPdf(false);
    setSignSelectedSigId(null);
  };

  // The URL owns the active tool, so deep links and back/forward switch tools too.
  const changeTool = (tool: ToolType) => {
    if (tool !== activeTool) navigate(`/app/${tool}`);
  };

  useEffect(() => {
    resetAll();
  }, [activeTool]);

  const sessionStatus =
    activeTool === 'image-to-pdf'
      ? `${images.length} image${images.length === 1 ? '' : 's'}`
      : activeTool === 'pdf-splitter'
      ? `${selectedPages.length} page${selectedPages.length === 1 ? '' : 's'} selected`
      : activeTool === 'sign-pdf'
      ? signDocBytes ? `${signSignatures.length} signature${signSignatures.length === 1 ? '' : 's'}` : 'No document'
      : convFile ? '1 file' : 'No file';

  const handlePrimaryAction = () => {
    if (activeTool === 'image-to-pdf') {
      openNamingModal('image-to-pdf');
    } else if (activeTool === 'pdf-splitter') {
      openNamingModal('pdf-splitter');
    } else if (activeTool === 'sign-pdf') {
      openNamingModal('sign-pdf');
    } else if (activeTool === 'converter' && conversionMode === 'text-to-pdf') {
      openNamingModal('text-to-pdf');
    } else {
      handleConversion();
    }
  };

  const isPrimaryDisabled =
    (activeTool === 'image-to-pdf'
      ? images.length === 0
      : activeTool === 'pdf-splitter'
      ? selectedPages.length === 0
      : activeTool === 'sign-pdf'
      ? !signDocBytes
      : !convFile) || isGenerating || isConverting || isSigningPdf;

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-50 h-16 border-b border-line bg-canvas/90 backdrop-blur-xl">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a href="#/" aria-label="SnapPDF home" className="shrink-0 rounded-md">
              <Logo />
            </a>
            <span
              className="hidden lg:inline-flex items-center gap-2 rounded-full bg-subtle px-3 py-1 text-[12px] text-ink/60"
              title="Nothing is uploaded or saved. Download your file before you close this tab."
            >
              <span className="size-1.5 rounded-full bg-lime ring-2 ring-lime/30" />
              Quick mode · files stay in this tab
            </span>
          </div>

          <nav aria-label="Tools" className="hidden md:flex items-center gap-0.5 rounded-xl bg-ink p-1">
            {TOOLS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => changeTool(id)}
                aria-current={activeTool === id ? 'page' : undefined}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  activeTool === id ? "bg-canvas text-ink" : "text-canvas/60 hover:text-canvas"
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="hidden xl:block text-right leading-tight mr-1">
              <p className="text-[11px] text-ink/40">Session</p>
              <p className="text-[13px] text-ink/80">{sessionStatus}</p>
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="SnapPDF on GitHub"
              className="hidden sm:flex size-9 items-center justify-center rounded-xl bg-subtle text-ink hover:bg-line transition-colors"
            >
              <GitHubMark />
            </a>
            <button
              onClick={handlePrimaryAction}
              disabled={isPrimaryDisabled}
              className="h-9 px-4 rounded-xl bg-brand text-canvas text-[14px] font-medium hover:bg-ink/80 transition-colors disabled:bg-subtle disabled:text-ink/35 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
            >
              {isGenerating ? (
                pdfProgress ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="animate-spin" size={14} />
                    {`Processing ${pdfProgress.current}/${pdfProgress.total} (${Math.round((pdfProgress.current / pdfProgress.total) * 100)}%)`}
                  </span>
                ) : "Processing..."
              ) : isConverting ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="animate-spin" size={14} />
                  Converting...
                </span>
              ) : isSigningPdf ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="animate-spin" size={14} />
                  Signing PDF...
                </span>
              ) : activeTool === 'image-to-pdf' ? (
                "Generate PDF"
              ) : activeTool === 'pdf-splitter' ? (
                "Split PDF"
              ) : activeTool === 'sign-pdf' ? (
                "Download PDF"
              ) : (
                "Convert Now"
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Tool Selector for Mobile */}
      <nav aria-label="Tools" className="md:hidden border-b border-line bg-canvas px-4 py-2.5">
        <div className="flex gap-0.5 rounded-xl bg-ink p-1">
          {TOOLS.map(({ id, label, short }) => (
            <button
              key={id}
              onClick={() => changeTool(id)}
              aria-current={activeTool === id ? 'page' : undefined}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                activeTool === id ? "bg-canvas text-ink" : "text-canvas/60"
              )}
            >
              {short ?? label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-subtle">
        {/* Workspace */}
        <section className="flex-1 p-6 md:p-10 bg-subtle overflow-y-auto styled-scrollbar min-h-[500px]">
          {activeTool === 'image-to-pdf' ? (
            images.length === 0 ? (
              <motion.div 
                {...getRootProps()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  "h-full border-2 border-dashed border-ink/20 flex flex-col items-center justify-center hover:bg-card/50 transition-all cursor-pointer rounded-lg p-10 relative",
                  isDragActive && "border-brand bg-card/50"
                )}
              >
                <input {...getInputProps()} />
                {isProcessingImages ? (
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="animate-spin text-brand" size={40} />
                    <h3 className="text-sm font-black uppercase tracking-widest text-center">{imageProcessingText || 'Processing images...'}</h3>
                    <p className="text-[10px] uppercase font-bold text-brand tracking-wider">Converting formats for optimal PDF rendering</p>
                  </div>
                ) : (
                  <>
                    <span className="text-5xl font-light mb-4 text-brand">+</span>
                    <h3 className="text-sm md:text-base font-bold uppercase tracking-widest text-center">Drag & Drop Assets</h3>
                    <p className="text-[10px] uppercase font-medium opacity-50 mt-2">JPG, PNG, HEIC, WEBP, GIF, BMP allowed</p>
                  </>
                )}
              </motion.div>
            ) : (
              <div className="space-y-6">
                {isProcessingImages && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border-2 border-brand p-4 flex items-center gap-4 rounded-lg"
                  >
                    <RefreshCw className="animate-spin text-brand flex-shrink-0" size={24} />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest">{imageProcessingText || 'Processing image uploads...'}</h4>
                      <p className="text-[10px] font-bold text-brand uppercase">Converting HEIC/Apple formats & optimizing resolution</p>
                    </div>
                  </motion.div>
                )}
                {pdfProgress && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border-2 border-brand p-6 relative rounded-2xl"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Zap className="text-brand animate-pulse" size={24} />
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-widest">Generating High-Speed PDF</h4>
                          <p className="text-[10px] font-bold text-brand uppercase">
                            Optimized Chunked Memory • Page {pdfProgress.current} of {pdfProgress.total}
                          </p>
                        </div>
                      </div>
                      <span className="text-lg font-black tracking-tight text-brand">
                        {Math.round((pdfProgress.current / pdfProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-subtle h-3 border border-line overflow-hidden p-0.5 rounded-md">
                      <div 
                        className="bg-brand h-full transition-all duration-200"
                        style={{ width: `${(pdfProgress.current / pdfProgress.total) * 100}%` }}
                      />
                    </div>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={images} strategy={rectSortingStrategy}>
                    <AnimatePresence mode="popLayout">
                      {images.map((image, idx) => (
                        <SortableImage 
                          key={image.id} 
                          image={image} 
                          index={idx}
                          onRemove={handleRemove}
                          onEdit={setEditingImage}
                          onRotate={handleRotate}
                        />
                      ))}
                    </AnimatePresence>
                  </SortableContext>
                </DndContext>
                
                <div 
                  {...getRootProps()}
                  className="border-2 border-dashed border-ink/20 aspect-[3/4.5] flex flex-col items-center justify-center hover:bg-card/50 transition-colors cursor-pointer group rounded-lg"
                >
                  <input {...getInputProps()} />
                  <span className="text-3xl font-light mb-2 group-hover:scale-110 transition-transform">+</span>
                  <span className="text-[10px] uppercase font-bold tracking-widest px-4 text-center">Add More Assets</span>
                </div>
              </div>
            </div>
          )
          ) : activeTool === 'pdf-splitter' ? (
            /* PDF Splitter Workspace */
            <div className="h-full flex flex-col">
              {!pdfFile ? (
                <motion.div 
                  {...getPdfRootProps()}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "flex-1 border-2 border-dashed border-ink/20 flex flex-col items-center justify-center hover:bg-card/50 transition-all cursor-pointer rounded-lg p-10",
                    isPdfDragActive && "border-brand bg-card/50"
                  )}
                >
                  <input {...getPdfInputProps()} />
                  <FileUp className="text-brand mb-4" size={48} strokeWidth={1} />
                  <h3 className="text-sm md:text-base font-bold uppercase tracking-widest text-center">Upload Source PDF</h3>
                  <p className="text-[10px] uppercase font-medium opacity-50 mt-2">Maximum clarity for extraction</p>
                </motion.div>
              ) : (
                <div className="space-y-8">
                  <div className="flex items-center justify-between bg-card border border-line p-4 rounded">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-subtle border border-ink/10 rounded">
                        <FileText size={20} className="text-brand" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-tight truncate max-w-[200px] md:max-w-md">{pdfFile.name}</p>
                        <p className="text-[10px] uppercase opacity-50">{(pdfFile.size / (1024 * 1024)).toFixed(2)} MB • {pdfPageCount} Pages</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setPdfFile(null); setPdfPreviews([]); setSelectedPages([]); }}
                      className="text-[10px] font-bold uppercase underline underline-offset-4 hover:text-brand"
                    >
                      Change File
                    </button>
                  </div>

                  {isProcessingPdf ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                      <div className="w-10 h-10 border-4 border-subtle border-t-brand rounded-full animate-spin" />
                      <p className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Rendering Pages...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {Array.from({ length: pdfPageCount }).map((_, idx) => {
                        const preview = pdfPreviews[idx];
                        const isSelected = selectedPages.includes(idx);
                        return (
                          <motion.div
                            key={idx}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onClick={() => togglePageSelection(idx)}
                            className={cn(
                              "relative aspect-[3/4.2] bg-card border border-line p-2 cursor-pointer transition-all duration-300 group rounded-lg",
                              isSelected ? "ring-4 ring-brand" : "hover:border-brand opacity-70 hover:opacity-100"
                            )}
                          >
                            <div className="absolute top-0 left-0 w-full h-full z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-ink/5">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingPageIndex(idx);
                                }}
                                className="bg-card border border-line p-2 rounded hover:bg-subtle transition-all transform hover:-translate-y-1"
                              >
                                <Eye size={18} className="text-brand" />
                              </button>
                            </div>

                            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-1",
                                isSelected ? "bg-brand text-canvas" : "bg-subtle text-ink"
                              )}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              {isSelected && <CheckCircle2 size={14} className="text-brand" />}
                            </div>
                            <div className="w-full h-full bg-subtle overflow-hidden border border-ink/10 flex items-center justify-center rounded-lg">
                              {preview ? (
                                <img src={preview} alt={`Page ${idx + 1}`} className="w-full h-full object-contain" />
                              ) : (
                                <div className="flex flex-col items-center gap-2 opacity-20">
                                  <FileText size={40} strokeWidth={1} />
                                  <span className="text-[10px] font-bold uppercase">Page {idx + 1}</span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTool === 'sign-pdf' ? (
            /* Document Signer Workspace */
            <DocumentSigner 
              ref={documentSignerRef}
              selectedSigId={signSelectedSigId}
              onSelectSigId={setSignSelectedSigId}
              onDocumentChange={(bytes, name, sigs, selectedId) => {
                setSignDocBytes(bytes);
                setSignFilename(name);
                setSignSignatures(sigs);
                if (selectedId !== undefined) {
                  setSignSelectedSigId(selectedId);
                }
              }}
              onTriggerDownloadModal={(sourceBytes, sigs, filename) => {
                setSignDocBytes(sourceBytes);
                setSignSignatures(sigs);
                setSignFilename(filename);
                openNamingModal('sign-pdf');
              }}
              isDownloading={isSigningPdf}
            />
          ) : (
            /* Converter Workspace */
            <div className="h-full flex flex-col">
              {!convFile ? (
                <motion.div 
                  {...getConvRootProps()}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "flex-1 border-2 border-dashed border-ink/20 flex flex-col items-center justify-center hover:bg-card/50 transition-all cursor-pointer rounded-lg p-10",
                    isConvDragActive && "border-brand bg-card/50"
                  )}
                >
                  <input {...getConvInputProps()} />
                  <FileUp className="text-brand mb-4" size={48} strokeWidth={1} />
                  <h3 className="text-sm md:text-base font-bold uppercase tracking-widest text-center">
                    Upload {conversionMode.split('-')[0].toUpperCase()} File
                  </h3>
                  <p className="text-[10px] uppercase font-medium opacity-50 mt-2">
                    {conversionMode === 'pdf-to-docx' ? 'Fast & secure PDF to Word conversion' : 
                     conversionMode === 'csv-to-excel' ? 'Convert spreadsheets to Excel format' :
                     conversionMode === 'json-to-excel' ? 'Transform JSON data to Excel tables' :
                     conversionMode === 'json-to-csv' ? 'Convert structured JSON to flat CSV' :
                     'Quickly turn text files into polished PDFs'}
                  </p>
                </motion.div>
              ) : (
                <div className="max-w-2xl mx-auto w-full space-y-8">
                  {convResult ? (
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-card border-2 border-brand p-10 shadow-xl shadow-black/10 text-center relative overflow-hidden rounded-2xl"
                    >
                      <div className="absolute top-0 right-0 p-4">
                        <CheckCircle2 className="text-brand" size={40} />
                      </div>
                      
                      <div className="mb-8">
                        <div className="w-24 h-24 bg-subtle rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-canvas shadow-xl">
                          <Zap className="text-brand" size={40} />
                        </div>
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Conversion Success!</h2>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">{convResult.name}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
                        <button 
                          onClick={() => saveAs(convResult.blob, convResult.name)}
                          className="h-16 bg-brand text-canvas font-black uppercase text-xs tracking-[0.2em] hover:bg-ink/80 transition-all flex items-center justify-center gap-3 active:translate-y-1"
                        >
                          <Download size={20} />
                          Download File
                        </button>
                        {conversionMode === 'pdf-to-docx' && pdfPreviews.length > 0 && (
                          <button 
                            onClick={() => setViewingPageIndex(0)}
                            className="h-16 bg-card border border-line text-ink font-black uppercase text-xs tracking-[0.2em] hover:bg-subtle transition-all flex items-center justify-center gap-3 active:translate-y-1 rounded-lg"
                          >
                            <Eye size={20} />
                            View Pages
                          </button>
                        )}
                        <button 
                          onClick={() => { setConvFile(null); setConvResult(null); }}
                          className={cn(
                            "h-16 border border-line font-black uppercase text-xs tracking-[0.1em] hover:bg-subtle transition-all flex items-center justify-center gap-3 rounded-lg",
                            (conversionMode !== 'pdf-to-docx' || pdfPreviews.length === 0) ? "sm:col-span-2" : ""
                          )}
                        >
                          Convert Another
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="bg-card border border-line p-8 shadow-xl shadow-black/10 relative rounded-2xl">
                      <div className="absolute -top-4 -right-4 w-12 h-12 bg-brand flex items-center justify-center text-canvas border border-line rounded-lg">
                        <Zap size={24} />
                      </div>
                      
                      <div className="flex items-center gap-6 mb-8">
                        <div className="w-20 h-20 bg-subtle border border-ink/10 rounded-xl flex items-center justify-center shadow-inner">
                          {conversionMode === 'pdf-to-docx' ? <FileText size={32} className="text-brand" /> : <Table size={32} className="text-brand" />}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-black uppercase tracking-widest mb-1">{convFile.name}</h3>
                          <p className="text-[10px] font-bold text-brand uppercase">READY FOR CONVERSION • {(convFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-ink/10 pt-8 mt-8">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase opacity-40">Source Format</p>
                          <p className="text-xs font-black uppercase tracking-widest">
                            {conversionMode === 'pdf-to-docx' ? 'PDF (Portable Document)' : 
                             conversionMode === 'csv-to-excel' ? 'CSV (Comma Separated)' :
                             conversionMode === 'json-to-excel' || conversionMode === 'json-to-csv' ? 'JSON (JavaScript Object)' :
                             'TXT (Plain Text)'}
                          </p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-[10px] font-bold uppercase opacity-40">Target Format</p>
                          <p className="text-xs font-black uppercase tracking-widest text-brand">
                            {conversionMode === 'pdf-to-docx' ? 'DOCX (Microsoft Word)' : 
                             conversionMode === 'csv-to-excel' || conversionMode === 'json-to-excel' ? 'XLSX (Microsoft Excel)' :
                             conversionMode === 'json-to-csv' ? 'CSV (Flat Table)' :
                             'PDF (Digital Document)'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 flex gap-4">
                        <button 
                          onClick={() => { setConvFile(null); setConvResult(null); }}
                          className="flex-1 h-12 border border-line font-bold uppercase text-[10px] tracking-widest hover:bg-subtle transition-colors rounded-lg"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => {
                            if (conversionMode === 'text-to-pdf') {
                              openNamingModal('text-to-pdf');
                            } else {
                              handleConversion();
                            }
                          }}
                          disabled={isConverting}
                          className="flex-[2] h-12 bg-ink text-canvas font-bold uppercase text-[10px] tracking-widest hover:bg-brand/80 transition-colors disabled:opacity-50"
                        >
                          {isConverting ? "Converting..." : "Start Conversion"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-subtle/50 border border-ink/10 p-6 flex items-start gap-4 italic opacity-60 rounded-2xl">
                    <div className="mt-1"><Zap size={14} /></div>
                    <p className="text-[10px] font-medium leading-relaxed">
                      Privacy Note: Your files are processed entirely in your browser. We never upload your documents to a server, ensuring 100% data security and confidentiality.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="theme-dark lg:w-85 bg-card text-ink rounded-2xl mx-3 mb-3 lg:m-3 lg:ml-0 p-6 md:p-8 flex flex-col justify-between shrink-0 overflow-y-auto styled-scrollbar lg:h-[calc(100vh-136px)]">
          <div className="space-y-12">
            {activeTool === 'image-to-pdf' ? (
              <>
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Export Settings</h3>
                  <div className="space-y-8 pt-4">
                    <div className="space-y-4">
                      <label className="flex justify-between text-[10px] font-bold uppercase">
                        <span>Quality Control</span>
                        <span className="text-brand">{Math.round(quality * 100)}%</span>
                      </label>
                      <div className="relative h-6 flex items-center">
                        <input 
                          type="range" 
                          min="0.1" 
                          max="1" 
                          step="0.05" 
                          value={quality}
                          onChange={(e) => setQuality(parseFloat(e.target.value))}
                          className="w-full h-1 bg-subtle appearance-none cursor-pointer accent-brand z-10"
                        />
                        <div className="absolute top-[11.5px] left-0 h-1 bg-brand pointer-events-none" style={{ width: `${quality * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] uppercase font-bold opacity-30">
                        <span>Small File</span>
                        <span>Hi-Res</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest">Document Layout</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button className="border border-line py-2 text-[10px] font-bold uppercase bg-ink text-canvas rounded-lg">Portrait</button>
                        <button className="border border-line py-2 text-[10px] font-bold uppercase hover:bg-canvas transition-colors opacity-50 cursor-not-allowed rounded-lg">Landscape</button>
                      </div>
                      <p className="text-[9px] italic opacity-40 uppercase">Landscape mode coming soon</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Summary</h3>
                  <div className="space-y-3 text-[10px] font-medium uppercase">
                    <div className="flex justify-between">
                      <span className="opacity-60">Total Assets:</span>
                      <span className="font-bold">{images.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-60">Raw Data Transfer:</span>
                      <span className="font-bold">
                        {(images.reduce((acc, img) => acc + img.size, 0) / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-60">Est. Final PDF:</span>
                      <span className="font-bold">
                        {(images.reduce((acc, img) => acc + img.size, 0) * (quality * 0.7) / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-ink/10 pt-2 text-brand font-bold">
                      <span>Target Format:</span>
                      <span>A4 PDF (72 DPI)</span>
                    </div>
                  </div>
                </div>
              </>
            ) : activeTool === 'pdf-splitter' ? (
              /* PDF Splitter Sidebar Content */
              <>
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Extraction Tools</h3>
                  <div className="space-y-6 pt-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase">Quick Selection</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          disabled={!pdfFile}
                          onClick={() => {
                            const allPages = [];
                            for (let i = 0; i < pdfPageCount; i++) allPages.push(i);
                            setSelectedPages(allPages);
                          }}
                          className="text-center border border-ink/20 p-2 text-[9px] uppercase font-bold hover:bg-subtle disabled:opacity-30 transition-all rounded-md"
                        >
                          Select All
                        </button>
                        <button 
                          disabled={!pdfFile || selectedPages.length === 0}
                          onClick={() => setSelectedPages([])}
                          className="text-center border border-ink/20 p-2 text-[9px] uppercase font-bold hover:bg-subtle disabled:opacity-30 transition-all rounded-md"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase">Select Range</p>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          placeholder="From" 
                          className="w-full border border-ink/20 bg-subtle p-2 text-[10px] font-bold outline-none focus:border-brand rounded-lg"
                          id="rangeStart"
                        />
                        <input 
                          type="number" 
                          placeholder="To" 
                          className="w-full border border-ink/20 bg-subtle p-2 text-[10px] font-bold outline-none focus:border-brand rounded-lg"
                          id="rangeEnd"
                        />
                        <button 
                          onClick={() => {
                            const startInput = document.getElementById('rangeStart') as HTMLInputElement;
                            const endInput = document.getElementById('rangeEnd') as HTMLInputElement;
                            const start = parseInt(startInput?.value) - 1;
                            const end = parseInt(endInput?.value) - 1;
                            if (isNaN(start) || isNaN(end) || start < 0 || end >= pdfPageCount || start > end) return;
                            const range = [];
                            for (let i = start; i <= end; i++) range.push(i);
                            setSelectedPages(prev => Array.from(new Set([...prev, ...range])).sort((a, b) => a - b));
                          }}
                          className="bg-brand text-canvas px-3 text-[10px] font-bold"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-subtle border border-ink/10 space-y-2 rounded-lg">
                      <p className="text-[9px] font-black uppercase tracking-tighter">Current Selection</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedPages.length === 0 ? (
                          <span className="text-[9px] italic opacity-40 uppercase">None selected</span>
                        ) : (
                          selectedPages.map(p => (
                            <span key={p} className="bg-brand text-canvas text-[8px] px-1.5 py-0.5 rounded-sm">
                              {p + 1}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Technical Info</h3>
                  <div className="space-y-3 text-[10px] font-medium uppercase">
                    <div className="flex justify-between">
                      <span className="opacity-60">Source File:</span>
                      <span className="font-bold truncate max-w-[120px]">{pdfFile?.name || '--'}</span>
                    </div>
                    <div className="flex justify-between border-t border-ink/10 pt-2 text-brand font-bold">
                      <span>Pages to Extract:</span>
                      <span>{selectedPages.length}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : activeTool === 'sign-pdf' ? (
              /* Sign Document Sidebar */
              <>
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Signature & Stamp</h3>
                  <div className="space-y-4 pt-2">
                    <p className="text-[10px] uppercase font-medium text-ink/70 leading-relaxed">
                      Upload your signature or signature photo, resize it freely with the corner handle, and position it directly onto your document.
                    </p>

                    <button
                      onClick={() => {
                        const btn = document.getElementById('upload-signature-btn');
                        if (btn) btn.click();
                      }}
                      className="w-full h-11 bg-brand text-canvas font-bold uppercase text-[10px] tracking-widest hover:bg-ink/80 transition-colors flex items-center justify-center gap-2"
                    >
                      <Upload size={14} />
                      Upload Signature
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Placed Overlays ({signSignatures.length})</h3>
                    {signSelectedSigId && (
                      <button 
                        onClick={() => documentSignerRef.current?.setSelectedSigId(null)}
                        className="text-[9px] font-black uppercase text-brand hover:underline"
                      >
                        Unselect All
                      </button>
                    )}
                  </div>

                  {signSignatures.length === 0 ? (
                    <div className="p-4 bg-subtle text-center border border-ink/10 rounded-lg">
                      <p className="text-[9px] uppercase font-bold text-ink/40">No signatures placed yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {signSignatures.map((sig, idx) => {
                        const isSelected = signSelectedSigId === sig.id;
                        return (
                          <div 
                            key={sig.id} 
                            onClick={() => documentSignerRef.current?.setSelectedSigId(isSelected ? null : sig.id)}
                            className={cn(
                              "p-2.5 border transition-all flex items-center justify-between text-[10px] font-bold cursor-pointer select-none rounded-lg",
                              isSelected 
                                ? "bg-card border-brand ring-2 ring-brand/40 shadow-sm" 
                                : "bg-subtle border-ink/20 hover:border-ink/50"
                            )}
                            title={isSelected ? "Click to unselect" : "Click to select this signature"}
                          >
                            <div className="flex items-center gap-2 truncate max-w-[125px]">
                              <img src={sig.url} alt="" className="w-6 h-6 object-contain bg-paper rounded-sm p-0.5" />
                              <div className="truncate">
                                <span className="truncate block">{sig.name || `Signature #${idx + 1}`}</span>
                                {isSelected && (
                                  <span className="text-[8px] font-black uppercase text-brand">Selected</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[8px] bg-card border border-ink/20 px-1 py-0.5 uppercase rounded-md">
                                P.{sig.pageIndex + 1}
                              </span>
                              <span className="text-[8px] bg-card border border-ink/20 px-1 py-0.5 uppercase rounded-md">
                                {Math.round(sig.widthPercent)}%
                              </span>
                              {(sig.rotation || 0) !== 0 && (
                                <span className="text-[8px] bg-amber-400/10 text-amber-300 border border-amber-400/30 px-1 py-0.5 uppercase font-black rounded-md">
                                  {sig.rotation}°
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Selected Signature Fine-Tuning Controls */}
                {(() => {
                  const activeSig = signSignatures.find(s => s.id === signSelectedSigId);
                  if (!activeSig) return null;
                  return (
                    <div className="p-3 bg-subtle border border-line space-y-3 rounded-lg">
                      <div className="flex items-center justify-between border-b border-ink/20 pb-2">
                        <span className="text-[10px] font-black uppercase text-ink flex items-center gap-1">
                          <Sliders size={12} className="text-brand" />
                          Overlay Controls
                        </span>
                        <button
                          onClick={() => documentSignerRef.current?.setSelectedSigId(null)}
                          className="text-[9px] font-black uppercase px-2 py-0.5 bg-card border border-line hover:bg-ink/80 hover:text-canvas transition-colors rounded-md"
                        >
                          Unselect (Esc)
                        </button>
                      </div>

                      {/* Rotation Controls */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-bold uppercase text-ink/70">
                          <span>Rotate:</span>
                          <span className="text-brand font-black">{activeSig.rotation || 0}°</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          <button
                            onClick={() => documentSignerRef.current?.rotateSignature(activeSig.id, -90)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[9px] font-bold flex items-center justify-center gap-0.5 rounded-md"
                            title="Rotate 90° CCW"
                          >
                            <RotateCcw size={10} /> -90°
                          </button>
                          <button
                            onClick={() => documentSignerRef.current?.rotateSignature(activeSig.id, 90)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[9px] font-bold flex items-center justify-center gap-0.5 rounded-md"
                            title="Rotate 90° CW (R)"
                          >
                            <RotateCw size={10} /> +90°
                          </button>
                          <button
                            onClick={() => documentSignerRef.current?.rotateSignature(activeSig.id, 15)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[9px] font-bold text-center rounded-md"
                            title="Rotate +15°"
                          >
                            +15°
                          </button>
                          <button
                            onClick={() => documentSignerRef.current?.updateSignature(activeSig.id, { rotation: 0 })}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[9px] font-bold text-center rounded-md"
                            title="Reset to 0°"
                          >
                            0° Reset
                          </button>
                        </div>
                      </div>

                      {/* Resize & Preset Size Controls */}
                      <div className="space-y-1.5 border-t border-ink/10 pt-2">
                        <div className="flex justify-between text-[9px] font-bold uppercase text-ink/70">
                          <span>Resize / Scale:</span>
                          <span className="text-brand font-black">{Math.round(activeSig.widthPercent)}% Width</span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          <button
                            onClick={() => documentSignerRef.current?.scaleSignature(activeSig.id, -4)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[10px] font-black text-center rounded-lg"
                            title="Scale smaller"
                          >
                            -
                          </button>
                          <button
                            onClick={() => documentSignerRef.current?.scaleSignature(activeSig.id, 4)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[10px] font-black text-center rounded-lg"
                            title="Scale larger"
                          >
                            +
                          </button>
                          <button
                            onClick={() => documentSignerRef.current?.setPresetSize(activeSig.id, 16)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[9px] font-bold text-center rounded-md"
                          >
                            Small
                          </button>
                          <button
                            onClick={() => documentSignerRef.current?.setPresetSize(activeSig.id, 26)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[9px] font-bold text-center rounded-md"
                          >
                            Med
                          </button>
                          <button
                            onClick={() => documentSignerRef.current?.setPresetSize(activeSig.id, 40)}
                            className="p-1.5 bg-card border border-line hover:bg-subtle text-[9px] font-bold text-center rounded-md"
                          >
                            Large
                          </button>
                        </div>
                      </div>

                      {/* Remove Overlay Button */}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => documentSignerRef.current?.updateSignature(activeSig.id, { removeWhiteBg: !activeSig.removeWhiteBg })}
                          className={cn(
                            "flex-1 py-1.5 border border-line text-[9px] font-bold uppercase transition-colors rounded-md",
                            activeSig.removeWhiteBg ? "bg-amber-400/10 text-amber-300 border-amber-400/40" : "bg-card hover:bg-canvas"
                          )}
                        >
                          {activeSig.removeWhiteBg ? "✓ Clean BG On" : "Clear White BG"}
                        </button>
                        <button
                          onClick={() => documentSignerRef.current?.removeSignature(activeSig.id)}
                          className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-bold uppercase transition-colors flex items-center gap-1 rounded-md"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Document Details</h3>
                  <div className="space-y-3 text-[10px] font-medium uppercase">
                    <div className="flex justify-between">
                      <span className="opacity-60">Document:</span>
                      <span className="font-bold truncate max-w-[120px]">{signFilename || '--'}</span>
                    </div>
                    <div className="flex justify-between border-t border-ink/10 pt-2 text-brand font-bold">
                      <span>Status:</span>
                      <span>{signDocBytes ? 'Ready to Export' : 'Awaiting Upload'}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => openNamingModal('sign-pdf')}
                  disabled={!signDocBytes || isSigningPdf}
                  className="w-full h-12 bg-ink text-canvas font-bold uppercase text-[10px] tracking-widest hover:bg-brand/80 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Download size={14} />
                  Download Signed PDF
                </button>
              </>
            ) : (
              /* Converter Sidebar Content */
              <>
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Conversion Type</h3>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase opacity-50">Select Module</p>
                      <div className="grid grid-cols-1 gap-3">
                        <button 
                          onClick={() => { setConversionMode('pdf-to-docx'); setConvFile(null); }}
                          className={cn(
                            "flex items-center gap-4 p-4 border transition-all text-left rounded-lg",
                            conversionMode === 'pdf-to-docx' ? "bg-ink text-canvas border-line" : "bg-card border-ink/10 hover:border-brand"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 flex items-center justify-center border shrink-0 rounded-lg",
                            conversionMode === 'pdf-to-docx' ? "border-canvas/20 bg-canvas/10" : "border-ink/10 bg-subtle"
                          )}>
                            <FileBox size={20} />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-black uppercase leading-tight truncate">PDF to DOCX</p>
                            <p className="text-[8px] font-medium opacity-60 mt-1 truncate">Convert PDF to Word</p>
                          </div>
                        </button>

                        <button 
                          onClick={() => { setConversionMode('csv-to-excel'); setConvFile(null); }}
                          className={cn(
                            "flex items-center gap-4 p-4 border transition-all text-left rounded-lg",
                            conversionMode === 'csv-to-excel' ? "bg-ink text-canvas border-line" : "bg-card border-ink/10 hover:border-brand"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 flex items-center justify-center border shrink-0 rounded-lg",
                            conversionMode === 'csv-to-excel' ? "border-canvas/20 bg-canvas/10" : "border-ink/10 bg-subtle"
                          )}>
                            <Table size={20} />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-black uppercase leading-tight truncate">CSV to EXCEL</p>
                            <p className="text-[8px] font-medium opacity-60 mt-1 truncate">Convert CSV to Excel</p>
                          </div>
                        </button>

                        <button 
                          onClick={() => { setConversionMode('json-to-excel'); setConvFile(null); }}
                          className={cn(
                            "flex items-center gap-4 p-4 border transition-all text-left rounded-lg",
                            conversionMode === 'json-to-excel' ? "bg-ink text-canvas border-line" : "bg-card border-ink/10 hover:border-brand"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 flex items-center justify-center border shrink-0 rounded-lg",
                            conversionMode === 'json-to-excel' ? "border-canvas/20 bg-canvas/10" : "border-ink/10 bg-subtle"
                          )}>
                            <FileCode size={20} />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-black uppercase leading-tight truncate">JSON to EXCEL</p>
                            <p className="text-[8px] font-medium opacity-60 mt-1 truncate">Transform JSON</p>
                          </div>
                        </button>

                        <button 
                          onClick={() => { setConversionMode('json-to-csv'); setConvFile(null); }}
                          className={cn(
                            "flex items-center gap-4 p-4 border transition-all text-left rounded-lg",
                            conversionMode === 'json-to-csv' ? "bg-ink text-canvas border-line" : "bg-card border-ink/10 hover:border-brand"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 flex items-center justify-center border shrink-0 rounded-lg",
                            conversionMode === 'json-to-csv' ? "border-canvas/20 bg-canvas/10" : "border-ink/10 bg-subtle"
                          )}>
                            <FileType size={20} />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-black uppercase leading-tight truncate">JSON to CSV</p>
                            <p className="text-[8px] font-medium opacity-60 mt-1 truncate">Convert to CSV</p>
                          </div>
                        </button>

                        <button 
                          onClick={() => { setConversionMode('text-to-pdf'); setConvFile(null); }}
                          className={cn(
                            "flex items-center gap-4 p-4 border transition-all text-left rounded-lg",
                            conversionMode === 'text-to-pdf' ? "bg-ink text-canvas border-line" : "bg-card border-ink/10 hover:border-brand"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 flex items-center justify-center border shrink-0 rounded-lg",
                            conversionMode === 'text-to-pdf' ? "border-canvas/20 bg-canvas/10" : "border-ink/10 bg-subtle"
                          )}>
                            <FileText size={20} />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-black uppercase leading-tight truncate">TEXT to PDF</p>
                            <p className="text-[8px] font-medium opacity-60 mt-1 truncate">Create PDFs</p>
                          </div>
                        </button>

                        <button 
                          disabled
                          className="flex items-center gap-4 p-4 border border-ink/10 bg-canvas transition-all text-left opacity-30 grayscale cursor-not-allowed group rounded-lg"
                        >
                          <div className="w-10 h-10 flex items-center justify-center border border-ink/10 bg-subtle shrink-0 rounded-lg">
                            <FileType size={20} />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase leading-tight">OCR to TEXT</p>
                            <p className="text-[8px] font-medium opacity-60 mt-1">Coming Soon</p>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4 pt-8">
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] border-b border-line pb-2">Technical Info</h3>
                      <div className="space-y-3 text-[10px] font-medium uppercase">
                        <div className="flex justify-between">
                          <span className="opacity-60">Engine:</span>
                          <span className="font-bold">Client-Side WASM</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-60">Max File Size:</span>
                          <span className="font-bold">50 MB</span>
                        </div>
                        <div className="flex justify-between border-t border-ink/10 pt-2 text-brand font-bold">
                          <span>Security:</span>
                          <span>In-Browser Encryption</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-12 lg:mt-0 flex flex-col gap-3">
            <div className="p-4 bg-canvas border border-ink/10 text-[10px] leading-relaxed italic opacity-80 border-l-4 border-l-brand rounded-lg">
              <p>
                {activeTool === 'image-to-pdf' 
                  ? "Tip: Drag and drop cards in the left panel to reorder pages in your final document."
                  : activeTool === 'pdf-splitter'
                  ? "Tip: Select the pages you want to keep. The new document will only contain your selection in its original order."
                  : activeTool === 'sign-pdf'
                  ? "Tip: Click any signature to select it (Esc or click outside to unselect). Drag corners to resize, drag the top knob to rotate, and use Arrow keys to nudge."
                  : "Tip: Larger documents may take a few seconds to process. All data remains in your browser for maximum privacy."}
              </p>
            </div>
            {activeTool === 'image-to-pdf' && (
              <button className="w-full h-12 border border-line font-bold uppercase text-[10px] tracking-widest hover:bg-canvas transition-colors rounded-lg">
                Save as Template
              </button>
            )}
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-canvas px-4 md:px-6 py-3 md:py-0 md:h-12 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-ink/45">
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-lime ring-2 ring-lime/30" />
          Processed on your device. Nothing is uploaded.
        </span>
        <div className="flex items-center gap-5">
          <a href="#/" className="hover:text-ink transition-colors">Home</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink transition-colors">GitHub</a>
          <span className="font-mono">v1.2.0-alpha</span>
        </div>
      </footer>

      {/* Cropper Modal - Styled for Theme */}
      <AnimatePresence mode="wait">
        {editingImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
          >
            <div className="bg-card border border-line w-full max-w-4xl flex flex-col h-full max-h-[90vh] overflow-hidden shadow-xl shadow-black/10 rounded-2xl">
              <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-subtle">
                <h3 className="text-xs font-black uppercase tracking-[0.2em]">Geometric Crop</h3>
                <button onClick={() => setEditingImage(null)} className="p-2 hover:bg-ink/80 hover:text-canvas transition-colors border border-line rounded-lg">
                  <X size={16} />
                </button>
              </div>

              <div className="relative flex-grow bg-ink">
                <Cropper
                  image={editingImage.url}
                  crop={crop}
                  zoom={zoom}
                  aspect={undefined}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              <div className="p-6 md:p-10 border-t border-line bg-card">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1 w-full space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-60">Zoom Magnification</label>
                    <div className="relative h-6 flex items-center">
                      <input 
                        type="range" 
                        min="1" 
                        max="3" 
                        step="0.01" 
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="w-full h-1 bg-subtle appearance-none cursor-pointer accent-brand z-10"
                      />
                      <div className="absolute top-[11.5px] left-0 h-1 bg-brand pointer-events-none" style={{ width: `${((zoom - 1) / 2) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <button 
                      onClick={() => setEditingImage(null)}
                      className="flex-1 md:w-40 py-3 border border-line font-bold uppercase text-[10px] tracking-widest hover:bg-subtle transition-colors rounded-lg"
                    >
                      Discard
                    </button>
                    <button 
                      onClick={handleApplyCrop}
                      className="flex-1 md:w-40 py-3 bg-brand text-canvas font-bold uppercase text-[10px] tracking-widest hover:bg-ink/80 transition-colors"
                    >
                      Save Crop
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Page Viewer Modal */}
      <AnimatePresence>
        {viewingPageIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 md:p-10"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' && viewingPageIndex < pdfPageCount - 1) setViewingPageIndex(v => v! + 1);
              if (e.key === 'ArrowLeft' && viewingPageIndex > 0) setViewingPageIndex(v => v! - 1);
              if (e.key === 'Escape') setViewingPageIndex(null);
            }}
            tabIndex={0}
          >
            <div className="bg-canvas w-full max-w-5xl h-full max-h-[90vh] overflow-hidden flex flex-col border border-line shadow-xl shadow-black/10 rounded-2xl">
              <div className="h-16 border-b border-line flex items-center justify-between px-6 bg-card z-10">
                <div className="flex items-center gap-4">
                   <div className="bg-brand text-canvas text-[10px] font-bold px-3 py-1.5 rounded">
                    PAGE {viewingPageIndex + 1} OF {pdfPageCount}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-ink hidden sm:inline-block">Document Inspection</span>
                </div>
                <div className="flex items-center gap-3">
                  {activeTool === 'pdf-splitter' && (
                    <button 
                      onClick={() => togglePageSelection(viewingPageIndex!)}
                      className={cn(
                        "px-4 py-2 text-[10px] font-bold uppercase border transition-all flex items-center gap-2 rounded-lg",
                        selectedPages.includes(viewingPageIndex!) 
                          ? "bg-brand text-canvas border-brand" 
                          : "bg-card text-ink border-line hover:bg-subtle"
                      )}
                    >
                      {selectedPages.includes(viewingPageIndex!) ? <CheckCircle2 size={14} /> : <PlusCircle size={14} />}
                      {selectedPages.includes(viewingPageIndex!) ? "Deselect" : "Select Page"}
                    </button>
                  )}
                  <button 
                    onClick={() => setViewingPageIndex(null)}
                    className="w-10 h-10 flex items-center justify-center border border-line hover:bg-subtle transition-colors bg-card rounded-lg"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              <div className="relative flex-1 bg-subtle/30 overflow-hidden flex items-center justify-center p-4">
                {/* Navigation Arrows */}
                <button 
                  onClick={(e) => { e.stopPropagation(); if (viewingPageIndex! > 0) setViewingPageIndex(v => v! - 1); }}
                  disabled={viewingPageIndex === 0}
                  className="absolute left-4 z-20 w-12 h-12 rounded-full bg-card border border-line flex items-center justify-center shadow-lg hover:bg-subtle disabled:opacity-20 transition-all"
                >
                  <ChevronLeft size={24} />
                </button>

                <div className="w-full h-full flex items-center justify-center">
                  <motion.div
                    key={viewingPageIndex}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full h-full max-w-2xl bg-paper text-neutral-900 shadow-xl shadow-black/10 rounded-sm relative"
                  >
                    {pdfPreviews[viewingPageIndex!] ? (
                      <img 
                        src={pdfPreviews[viewingPageIndex!]} 
                        alt={`Page ${viewingPageIndex! + 1}`} 
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 opacity-30">
                        <FileText size={80} strokeWidth={0.5} />
                        <p className="text-sm font-bold uppercase">Page Rendering...</p>
                      </div>
                    )}
                  </motion.div>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); if (viewingPageIndex! < pdfPageCount - 1) setViewingPageIndex(v => v! + 1); }}
                  disabled={viewingPageIndex === pdfPageCount - 1}
                  className="absolute right-4 z-20 w-12 h-12 rounded-full bg-card border border-line flex items-center justify-center shadow-lg hover:bg-subtle disabled:opacity-20 transition-all"
                >
                  <ChevronRight size={24} />
                </button>
              </div>

              <div className="h-16 p-6 bg-card border-t border-line flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase opacity-50 tracking-widest">
                  Use arrow keys • Esc to close
                </span>
                <div className="flex gap-2">
                  {activeTool === 'pdf-splitter' && selectedPages.length > 0 && (
                    <span className="text-[10px] font-black italic text-brand uppercase mr-4 self-center">
                      {selectedPages.length} pages in selection
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* PDF Naming Modal */}
      <AnimatePresence>
        {isNamingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
            onClick={() => setIsNamingModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-line w-full max-w-lg shadow-xl shadow-black/10 flex flex-col overflow-hidden rounded-2xl"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-line flex justify-between items-center bg-subtle">
                <div className="flex items-center gap-2">
                  <FileText className="text-brand" size={18} />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em]">Name Your PDF Document</h3>
                </div>
                <button 
                  onClick={() => setIsNamingModalOpen(false)} 
                  className="p-1.5 hover:bg-ink/80 hover:text-canvas transition-colors border border-line bg-card rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 md:p-8 space-y-6 bg-canvas">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-ink mb-2">
                    Save File As
                  </p>
                  <p className="text-[10px] uppercase font-medium text-ink/60 leading-relaxed mb-4">
                    Enter a custom name for your generated PDF document, or download directly using the default system name.
                  </p>

                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={customPdfName}
                      onChange={(e) => setCustomPdfName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleConfirmCustomName(false);
                        }
                      }}
                      placeholder="Enter filename (e.g. My_Document)"
                      autoFocus
                      className="w-full border border-line bg-card p-3 pr-16 text-xs font-bold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all rounded-lg"
                    />
                    <span className="absolute right-3 text-[10px] font-black uppercase text-brand bg-subtle px-2 py-1 border border-ink/20 pointer-events-none rounded-lg">
                      .pdf
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-subtle border border-ink/10 flex items-start gap-3 rounded-lg">
                  <Zap className="text-brand shrink-0 mt-0.5" size={14} />
                  <p className="text-[9px] font-bold uppercase text-ink/70 leading-normal">
                    Default Name: <span className="text-brand font-mono">{getDefaultPdfName(namingActionType)}</span>
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-ink/10">
                  <button
                    onClick={() => setIsNamingModalOpen(false)}
                    className="px-4 h-11 border border-line font-bold uppercase text-[10px] tracking-widest hover:bg-subtle transition-colors rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConfirmCustomName(true)}
                    className="px-4 h-11 border border-ink/40 bg-subtle font-bold uppercase text-[10px] tracking-widest hover:bg-card transition-colors rounded-lg"
                  >
                    Use Default Name
                  </button>
                  <button
                    onClick={() => handleConfirmCustomName(false)}
                    className="flex-1 h-11 bg-brand text-canvas font-bold uppercase text-[10px] tracking-widest hover:bg-ink/80 transition-all flex items-center justify-center gap-2 active:translate-y-0.5"
                  >
                    <Download size={14} />
                    Download PDF
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
