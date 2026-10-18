import { Activity, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { LogoMark } from '@/components/brand';
import { useRoute } from '@/lib/router';
import type { ToolId } from '@/lib/site';
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

  // once opened, a tool stays alive (just hidden) so its work survives switching tools until the tab closes
  const [opened, setOpened] = useState<ToolId[]>([]);
  if (route.name === 'tool' && !opened.includes(route.tool)) setOpened([...opened, route.tool]);

  // scroll to top when the page changes, but not on first load or #anchors
  useEffect(() => {
    if (previousPage.current !== page) window.scrollTo({ top: 0, behavior: 'instant' });
    previousPage.current = page;
  }, [page]);

  return (
    <MotionConfig reducedMotion="user">
      {route.name === 'tools' && <Tools />}
      {route.name === 'landing' && <Landing />}
      {opened.map((tool) => (
        <Activity key={tool} mode={tool === page ? 'visible' : 'hidden'}>
          <Suspense fallback={<WorkspaceFallback />}>
            <Workspace tool={tool} />
          </Suspense>
        </Activity>
      ))}
    </MotionConfig>
  );
}
