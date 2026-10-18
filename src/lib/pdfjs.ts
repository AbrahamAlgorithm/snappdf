import { getDocument, GlobalWorkerOptions, version, type PDFDocumentProxy } from 'pdfjs-dist';

// pdf.js worker from unpkg, same version as the package
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

// one open pdf per file while a tool uses it, so pages render without re-reading the file
const openDocs = new Map<File | Uint8Array, Promise<PDFDocumentProxy>>();

export function openPdf(source: File | Uint8Array) {
  let doc = openDocs.get(source);
  if (!doc) {
    // pdf.js takes over the bytes it's given, so it gets a copy
    const data = source instanceof File ? source.arrayBuffer() : Promise.resolve(source.slice());
    doc = data.then((bytes) => getDocument({ data: bytes }).promise);
    openDocs.set(source, doc);
  }
  return doc;
}

export function closePdf(source: File | Uint8Array | null) {
  if (!source) return;
  openDocs.get(source)?.then(
    (doc) => doc.destroy(),
    () => {},
  );
  openDocs.delete(source);
}
