import { lazy, Suspense, useEffect, useRef } from 'react';
import { MotionConfig } from 'motion/react';
import { LogoMark } from '@/src/components/brand';
import { useRoute } from '@/src/lib/router';
import Landing from '@/src/pages/Landing';
import Tools from '@/src/pages/Tools';

// The workspace pulls in pdf.js, pdf-lib, docx, xlsx and HEIC decoders; keep them out of the landing bundle.
const Workspace = lazy(() => import('@/src/pages/Workspace'));

function WorkspaceFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-subtle">
      <LogoMark className="h-8 animate-pulse text-ink" />
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const page = route.name === 'tool' ? route.tool : route.name;
  const previousPage = useRef(page);

  // Start each page at the top, but leave in-page anchors (#faq) and the initial load alone.
  useEffect(() => {
    if (previousPage.current !== page) window.scrollTo({ top: 0, behavior: 'instant' });
    previousPage.current = page;
  }, [page]);

  return (
    <MotionConfig reducedMotion="user">
      {route.name === 'tool' ? (
        <Suspense fallback={<WorkspaceFallback />}>
          <Workspace key={route.tool} tool={route.tool} />
        </Suspense>
      ) : route.name === 'tools' ? (
        <Tools />
      ) : (
        <Landing />
      )}
    </MotionConfig>
  );
}
