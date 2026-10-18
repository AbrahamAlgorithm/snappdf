import type { ToolId } from '@/lib/site';
import ConvertFile from '@/pages/workspace/ConvertFile';
import ImageToPdf from '@/pages/workspace/ImageToPdf';
import SignPdf from '@/pages/workspace/SignPdf';
import SplitPdf from '@/pages/workspace/SplitPdf';

// one page per tool, App remounts it so state doesn't leak between tools
export default function Workspace({ tool }: { tool: ToolId }) {
  switch (tool) {
    case 'image-to-pdf':
      return <ImageToPdf />;
    case 'pdf-splitter':
      return <SplitPdf />;
    case 'sign-pdf':
      return <SignPdf />;
    default:
      return <ConvertFile mode={tool} />;
  }
}
