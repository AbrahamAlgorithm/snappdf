import { lazy, Suspense, useEffect, useRef } from 'react';
import { MotionConfig } from 'motion/react';
import { LogoMark } from '@/components/brand';
import { useRoute } from '@/lib/router';
import Landing from '@/pages/Landing';
import Tools from '@/pages/Tools';

// lazy load the editors, they pull in the heavy pdf and office libs
const Workspace = lazy(() => import('@/pages/Workspace'));

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

  // scroll to top when the page changes, but not on first load or #anchors
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
