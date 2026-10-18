import { Braces, FileSpreadsheet, FileText, FileType, Images, Scissors, Signature, Table2, type LucideIcon } from 'lucide-react';

export const GITHUB_REPO = 'AbrahamAlgorithm/snappdf';
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

export type ToolId =
  | 'image-to-pdf'
  | 'pdf-splitter'
  | 'sign-pdf'
  | 'text-to-pdf'
  | 'pdf-to-word'
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

// The one place a tool is registered: the tools page, the router and each editor's header read from here.
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
    description: 'Turn a plain text file into a tidy PDF.',
    group: 'Create and edit',
    icon: FileText,
    color: '#0891b2',
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    description: 'Get the text out of a PDF as an editable Word file.',
    group: 'Convert',
    icon: FileType,
    color: '#7c3aed',
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

export function getTool(id: ToolId): Tool {
  return TOOLS.find((t) => t.id === id)!;
}
