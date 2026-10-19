import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// worker is served from our own domain, no third-party scripts
GlobalWorkerOptions.workerSrc = workerUrl;

// one open pdf per file while a tool uses it, so pages render without re-reading the file
const openDocs = new Map<File | Uint8Array, Promise<PDFDocumentLoadingTask>>();

export function openPdf(source: File | Uint8Array) {
  let task = openDocs.get(source);
  if (!task) {
    // pdf.js takes over the bytes it's given, so it gets a copy
    const data = source instanceof File ? source.arrayBuffer() : Promise.resolve(source.slice());
    task = data.then((bytes) => getDocument({ data: bytes }));
    openDocs.set(source, task);
  }
  return task.then((t) => t.promise);
}

export function closePdf(source: File | Uint8Array | null) {
  if (!source) return;
  openDocs.get(source)?.then(
    (task) => task.destroy(),
    () => {},
  );
  openDocs.delete(source);
}
