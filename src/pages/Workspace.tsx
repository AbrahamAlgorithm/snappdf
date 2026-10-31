import type { ToolId } from '@/lib/site';
import ConvertFile from '@/pages/workspace/ConvertFile';
import ImageToPdf from '@/pages/workspace/ImageToPdf';
import MergePdf from '@/pages/workspace/MergePdf';
import SignPdf from '@/pages/workspace/SignPdf';
import SplitPdf from '@/pages/workspace/SplitPdf';
import TextToPdf from '@/pages/workspace/TextToPdf';
import CompressPdf from '@/pages/workspace/CompressPdf';
import WordToPdf from '@/pages/workspace/WordToPdf';
import RedactPdf from '@/pages/workspace/RedactPdf';

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
    case 'compress-pdf':
      return <CompressPdf />;
    case 'word-to-pdf':
      return <WordToPdf />;
    case 'redact-pdf':
      return <RedactPdf />;
    default:
      return <ConvertFile mode={tool} />;
  }
}
