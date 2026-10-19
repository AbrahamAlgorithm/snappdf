import { Activity, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { LogoMark } from '@/components/brand';
import { useRoute } from '@/lib/router';
import type { ToolId } from '@/lib/site';
import Landing from '@/pages/Landing';
import NotFound from '@/pages/NotFound';
import Privacy from '@/pages/Privacy';
import Report from '@/pages/Report';
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

  // scroll to top when the page changes, or to the section a link like /#faq points at. not on first load
  useEffect(() => {
    if (previousPage.current !== page) {
      const section = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (section) section.scrollIntoView();
      else window.scrollTo({ top: 0, behavior: 'instant' });
    }
    previousPage.current = page;
  }, [page]);

  return (
    <MotionConfig reducedMotion="user">
      {route.name === 'tools' && <Tools />}
      {route.name === 'landing' && <Landing />}
      {route.name === 'privacy' && <Privacy />}
      {route.name === 'report' && <Report />}
      {route.name === 'not-found' && <NotFound />}
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
