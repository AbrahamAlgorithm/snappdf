import type { ToolId } from '@/src/lib/site';
import ConvertFile from '@/src/pages/workspace/ConvertFile';
import ImageToPdf from '@/src/pages/workspace/ImageToPdf';
import MergePdf from '@/src/pages/workspace/MergePdf';
import SignPdf from '@/src/pages/workspace/SignPdf';
import SplitPdf from '@/src/pages/workspace/SplitPdf';

// Each tool is its own page; App remounts this per tool, so no state leaks from one tool to the next.
export default function Workspace({ tool }: { tool: ToolId }) {
  switch (tool) {
    case 'image-to-pdf':
      return <ImageToPdf />;
    case 'merge-pdf':
      return <MergePdf />;
    case 'pdf-splitter':
      return <SplitPdf />;
    case 'sign-pdf':
      return <SignPdf />;
    default:
      return <ConvertFile mode={tool} />;
  }
}
