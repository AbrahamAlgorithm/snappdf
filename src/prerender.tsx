// the pages that don't need a browser, rendered to html at build time so search engines and link previews read the
// whole page without running any javascript. scripts/prerender.mjs writes it into each page's html
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export function render(path: string) {
  // the router and a few pages read where they are from location, which only browsers have
  globalThis.location = new URL(path, 'https://snappdf.local') as unknown as Location;
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
