export const GITHUB_REPO = 'AbrahamAlgorithm/snappdf';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

export type ToolId = 'image-to-pdf' | 'pdf-splitter' | 'converter' | 'sign-pdf';

export const TOOLS: { id: ToolId; label: string; short?: string }[] = [
  { id: 'image-to-pdf', label: 'Image to PDF', short: 'Images' },
  { id: 'pdf-splitter', label: 'Split' },
  { id: 'converter', label: 'Convert' },
  { id: 'sign-pdf', label: 'Sign' },
];
