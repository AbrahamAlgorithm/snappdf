import { useEffect, useState } from 'react';
import { TOOLS, type ToolId } from '@/lib/site';

// / is the landing, /app lists the tools, /app/<tool> opens one, anything else is the 404 page
// (nginx.conf serves index.html for these, with a 404 status for the rest)
export type Route =
  | { name: 'landing' }
  | { name: 'tools' }
  | { name: 'tool'; tool: ToolId }
  | { name: 'privacy' }
  | { name: 'report' }
  | { name: 'not-found' };

export const APP_HREF = '/app';

const PAGES: Record<string, Route> = {
  '/': { name: 'landing' },
  '/index.html': { name: 'landing' },
  '/app': { name: 'tools' },
  '/privacy': { name: 'privacy' },
  '/report': { name: 'report' },
};

export function parseRoute(pathname: string): Route {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (PAGES[path]) return PAGES[path];
  const tool = TOOLS.find((t) => path === `/app/${t.id}`);
  return tool ? { name: 'tool', tool: tool.id } : { name: 'not-found' };
}

export function toolHref(tool: ToolId) {
  return `/app/${tool}`;
}

const NAVIGATED = 'snappdf:navigated';

function navigate(to: string) {
  history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAVIGATED));
}

// switch pages without a reload, leave anchors, new tabs and downloads to the browser
function interceptLinkClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = (e.target as Element | null)?.closest('a');
  if (!link || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname));

  useEffect(() => {
    const update = () => setRoute(parseRoute(location.pathname));
    window.addEventListener('popstate', update);
    window.addEventListener(NAVIGATED, update);
    document.addEventListener('click', interceptLinkClick);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(NAVIGATED, update);
      document.removeEventListener('click', interceptLinkClick);
    };
  }, []);

  return route;
}
