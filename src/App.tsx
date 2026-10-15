import { lazy, Suspense, useEffect, useRef } from 'react';
import { MotionConfig } from 'motion/react';
import { LogoMark } from '@/src/components/brand';
import { useRoute } from '@/src/lib/router';
import Landing from '@/src/pages/Landing';

// The workspace pulls in pdf.js, pdf-lib, docx, xlsx and HEIC decoders; keep them out of the landing bundle.
const Workspace = lazy(() => import('@/src/pages/Workspace'));

function WorkspaceFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <LogoMark className="h-8 animate-pulse text-ink" />
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const previousRoute = useRef(route.name);

  // Start each page at the top, but leave in-page anchors (#faq) and the initial load alone.
  useEffect(() => {
    if (previousRoute.current !== route.name) window.scrollTo({ top: 0, behavior: 'instant' });
    previousRoute.current = route.name;
  }, [route.name]);

  return (
    <MotionConfig reducedMotion="user">
      {route.name === 'app' ? (
        <Suspense fallback={<WorkspaceFallback />}>
          <Workspace tool={route.tool} />
        </Suspense>
      ) : (
        <Landing />
      )}
    </MotionConfig>
  );
}
