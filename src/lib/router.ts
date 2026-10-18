import { useEffect, useState } from 'react';
import { TOOLS, type ToolId } from '@/lib/site';

// / is the landing, /app lists the tools, /app/<tool> opens one (the host has to serve index.html for these)
export type Route = { name: 'landing' } | { name: 'tools' } | { name: 'tool'; tool: ToolId };

export const APP_HREF = '/app';

export function parseRoute(pathname: string): Route {
  const match = pathname.match(/^\/app(?:\/([\w-]+))?\/?$/);
  if (!match) return { name: 'landing' };
  const tool = TOOLS.find((t) => t.id === match[1]);
  return tool ? { name: 'tool', tool: tool.id } : { name: 'tools' };
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
