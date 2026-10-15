import { useEffect, useState } from 'react';
import { TOOLS, type ToolId } from '@/src/lib/site';

// Hash routing keeps deep links working on any static host without server rewrites.
// `#/` (or any in-page anchor like `#faq`) is the landing page; `#/app/<tool>` is the workspace.

export type Route = { name: 'landing' } | { name: 'app'; tool: ToolId };

export function parseHash(hash: string): Route {
  const match = hash.match(/^#\/app(?:\/([\w-]+))?/);
  if (!match) return { name: 'landing' };
  const tool = TOOLS.find((t) => t.id === match[1])?.id ?? 'image-to-pdf';
  return { name: 'app', tool };
}

export function toolHref(tool: ToolId) {
  return `#/app/${tool}`;
}

export function navigate(path: string) {
  window.location.hash = path;
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
