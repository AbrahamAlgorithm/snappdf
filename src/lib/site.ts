import { Braces, FileOutput, FileSpreadsheet, FileText, FileType, Images, Merge, Minimize2, Scissors, Signature, Table2, type LucideIcon } from 'lucide-react';
export const GITHUB_REPO = 'AbrahamAlgorithm/snappdf';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

export type ToolId =
  | 'image-to-pdf'
  | 'merge-pdf'
  | 'pdf-splitter'
  | 'sign-pdf'
  | 'text-to-pdf'
  | 'compress-pdf'
  | 'pdf-to-word'
  | 'word-to-pdf'
  | 'csv-to-excel'
  | 'json-to-excel'
  | 'json-to-csv';

export type ToolGroup = 'Create and edit' | 'Convert';

export type Tool = {
  id: ToolId;
  name: string;
  description: string;
  group: ToolGroup;
  icon: LucideIcon;
  color: string;
};

// every tool is listed here, the tools page, router and editors all read from it
export const TOOLS: Tool[] = [
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    description: 'Turn photos, screenshots and scans into one PDF.',
    group: 'Create and edit',
    icon: Images,
    color: '#e8590c',
  },
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    description: 'Combine several PDFs into one, in the order you choose.',
    group: 'Create and edit',
    icon: Merge,
    color: '#dc2626',
  },
  {
    id: 'pdf-splitter',
    name: 'Split PDF',
    description: 'Pick the pages you need and save them as a new PDF.',
    group: 'Create and edit',
    icon: Scissors,
    color: '#2f6fed',
  },
  {
    id: 'sign-pdf',
    name: 'Sign PDF',
    description: 'Draw or upload your signature and place it on any page.',
    group: 'Create and edit',
    icon: Signature,
    color: '#1d8348',
  },
  {
    id: 'text-to-pdf',
    name: 'Text to PDF',
    description: 'Type, paste or open some text and save it as a tidy PDF.',
    group: 'Create and edit',
    icon: FileText,
    color: '#0891b2',
  },
    {
    id: 'compress-pdf',
    name: 'Compress PDF',
    description: 'Shrink a PDF to fit email and upload limits, or to a size you choose.',
    group: 'Create and edit',
    icon: Minimize2,
    color: '#4f46e5',
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    description: 'Turn a PDF into a Word file that looks just like it, with every word editable.',
    group: 'Convert',
    icon: FileType,
    color: '#7c3aed',
  },
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    description: 'Turn a Word document into a PDF that looks just like it, and see every page first.',
    group: 'Convert',
    icon: FileOutput,
    color: '#185abd',
  },
  {
    id: 'csv-to-excel',
    name: 'CSV to Excel',
    description: 'Open CSV data as an Excel spreadsheet.',
    group: 'Convert',
    icon: FileSpreadsheet,
    color: '#0f766e',
  },
  {
    id: 'json-to-excel',
    name: 'JSON to Excel',
    description: 'Turn JSON data into an Excel table.',
    group: 'Convert',
    icon: Braces,
    color: '#b7791f',
  },
  {
    id: 'json-to-csv',
    name: 'JSON to CSV',
    description: 'Flatten JSON data into a CSV file.',
    group: 'Convert',
    icon: Table2,
    color: '#db2777',
  },
];

export const TOOL_GROUPS: ToolGroup[] = ['Create and edit', 'Convert'];

// the "new" pill above the landing page headline. point it at whatever shipped last, or set it to null to hide it
export const WHATS_NEW: { text: string; href: string } | null = {
  text: 'Word to PDF has been added',
  href: '/app/word-to-pdf',
};

export function getTool(id: ToolId): Tool {
  return TOOLS.find((t) => t.id === id)!;
}
