// after `vite build` and the ssr build of src/prerender.tsx, puts the rendered pages into their html. the app then
// draws the same page over it in the browser, so nothing changes for visitors
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const server = path.join(root, 'dist-ssr');
// react's production build, like the browser gets
process.env.NODE_ENV = 'production';
const { render } = await import(pathToFileURL(path.join(server, 'prerender.js')).href);

// tool pages load the pdf and office engines, which need a browser, so they keep the guide the build writes for them
const pages = { '/': 'index.html', '/app': 'app.html', '/privacy': 'privacy.html', '/report': 'report.html', '/404': '404.html' };

for (const [url, file] of Object.entries(pages)) {
  const target = path.join(dist, file);
  const html = readFileSync(target, 'utf8');
  if (!html.includes('<div id="root"></div>')) throw new Error(`prerender: ${file} has no empty root`);
  const page = render(url);
  if (!page.includes('<h1')) throw new Error(`prerender: ${url} rendered without a heading`);
  // the page itself has the links and words now, so the no javascript copy of them goes
  const out = html
    .replace('<div id="root"></div>', () => `<div id="root">${page}</div>`)
    .replace(/<noscript><main[\s\S]*?<\/main><\/noscript>/, '<noscript><p style="text-align:center;padding:1rem">snappdf runs in your browser, so it needs JavaScript turned on.</p></noscript>');
  writeFileSync(target, out);
  console.log(`prerender: ${url} → ${file} (${Math.round(page.length / 1024)} KB)`);
}
rmSync(server, { recursive: true, force: true });
