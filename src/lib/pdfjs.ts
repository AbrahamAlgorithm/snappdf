import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';

// pdf.js worker from unpkg, same version as the package
GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

export { getDocument };
