import type { ToolId } from '@/lib/site';
import ConvertFile from '@/pages/workspace/ConvertFile';
import ImageToPdf from '@/pages/workspace/ImageToPdf';
import MergePdf from '@/pages/workspace/MergePdf';
import SignPdf from '@/pages/workspace/SignPdf';
import SplitPdf from '@/pages/workspace/SplitPdf';
import TextToPdf from '@/pages/workspace/TextToPdf';

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
    case 'text-to-pdf':
      return <TextToPdf />;
    default:
      return <ConvertFile mode={tool} />;
  }
}
