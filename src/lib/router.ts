import { useEffect, useState } from 'react';
import { TOOLS, type ToolId } from '@/src/lib/site';

// Hash routing keeps deep links working on any static host without server rewrites.
// `#/` (or any in-page anchor like `#faq`) is the landing page, `#/app` lists every tool and
// `#/app/<tool>` opens that tool's editor. An unknown tool falls back to the list.

export type Route = { name: 'landing' } | { name: 'tools' } | { name: 'tool'; tool: ToolId };

export const APP_HREF = '#/app';

export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/app(?:\/([\w-]+))?/);
  if (!match) return { name: 'landing' };
  const tool = TOOLS.find((t) => t.id === match[1]);
  return tool ? { name: 'tool', tool: tool.id } : { name: 'tools' };
}

export function toolHref(tool: ToolId) {
  return `#/app/${tool}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
