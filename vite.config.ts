import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
// plain javascript, shared with the server
import { createReportHandler } from './server/report.mjs';
import { NOT_FOUND, PAGES, SITE_URL, structuredData, TOOL_GUIDES, type PageMeta } from './src/lib/seo';
import { TOOLS } from './src/lib/site';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function headTags(page: PageMeta) {
  const url = SITE_URL + page.path;
  const tags = [`<title>${esc(page.title)}</title>`, `<meta name="description" content="${esc(page.description)}" />`];
  if (page.noindex) {
    tags.push('<meta name="robots" content="noindex" />');
  } else {
    tags.push(
      `<link rel="canonical" href="${url}" />`,
      '<meta property="og:type" content="website" />',
      '<meta property="og:site_name" content="snappdf" />',
      `<meta property="og:url" content="${url}" />`,
      `<meta property="og:title" content="${esc(page.title)}" />`,
      `<meta property="og:description" content="${esc(page.description)}" />`,
      `<meta property="og:image" content="${SITE_URL}/og.jpg" />`,
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta property="og:image:alt" content="snappdf: PDF tools that never upload your files" />',
      '<meta name="twitter:card" content="summary_large_image" />',
    );
  }
  const data = structuredData(page);
  // < escaped so nothing in the data can close the script tag
  if (data) tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n    ');
}

// the same words for crawlers and browsers that don't run javascript, with links to every page
function fallbackBody(page: PageMeta) {
  const guide = page.tool && TOOL_GUIDES[page.tool];
  const parts = [`<h1>${esc(page.heading)}</h1>`, `<p>${esc(page.description)}</p>`];
  if (guide) {
    parts.push(
      `<h2>${esc(guide.howTo)}</h2>`,
      `<ol>${guide.steps.map((s) => `<li><strong>${esc(s.title)}.</strong> ${esc(s.text)}</li>`).join('')}</ol>`,
      '<h2>Common questions</h2>',
      ...guide.faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`),
    );
  }
  const links = [{ name: 'Home', path: '/' }, { name: 'All tools', path: '/app' }, ...TOOLS.map((t) => ({ name: t.name, path: `/app/${t.id}` }))];
  parts.push(
    '<p>snappdf runs in your browser, so it needs JavaScript turned on.</p>',
    `<ul>${links.map((l) => `<li><a href="${l.path}">${esc(l.name)}</a></li>`).join('')}</ul>`,
  );
  return `<noscript><main style="max-width:40rem;margin:0 auto;padding:4rem 1rem;line-height:1.6">${parts.join('')}</main></noscript>`;
}

function renderPage(html: string, page: PageMeta) {
  const head = /<!-- seo:head[^>]*-->/;
  const body = '<!-- seo:body -->';
  if (!head.test(html) || !html.includes(body)) throw new Error('seo: index.html is missing its seo markers');
  return html.replace(head, () => headTags(page)).replace(body, () => fallbackBody(page));
}

// gives every page its own html with its own title, description, link preview and structured data, plus the sitemap
function seo(): Plugin {
  return {
    name: 'snappdf-seo',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      // builds do every page in generateBundle, while developing fill in the page being opened
      if (!ctx.server) return html;
      const path = new URL(ctx.originalUrl ?? '/', 'http://localhost').pathname.replace(/(.)\/+$/, '$1');
      return renderPage(html, PAGES.find((p) => p.path === path) ?? NOT_FOUND);
    },
    generateBundle(_, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset') throw new Error('seo: index.html is missing from the build');
      const template = String(index.source);
      for (const page of PAGES) {
        if (page.path === '/') index.source = renderPage(template, page);
        else this.emitFile({ type: 'asset', fileName: `${page.path.slice(1)}.html`, source: renderPage(template, page) });
      }
      this.emitFile({ type: 'asset', fileName: '404.html', source: renderPage(template, NOT_FOUND) });

      const urls = PAGES.map((p) => `  <url><loc>${SITE_URL}${p.path}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n` });
    },
  };
}

// writes /sw.js with the list of every built file, and a version that changes whenever any of them do
function offline(): Plugin {
  let publicDir = '';
  return {
    name: 'snappdf-offline',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const hash = createHash('sha256');
      const files: string[] = [];
      for (const [name, item] of Object.entries(bundle)) {
        files.push(name);
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const name of readdirSync(publicDir, { recursive: true, encoding: 'utf8' })) {
        const file = path.join(publicDir, name);
        if (!statSync(file).isFile()) continue;
        files.push(name.split(path.sep).join('/'));
        hash.update(name).update(readFileSync(file));
      }
      if (!files.includes('index.html')) throw new Error('offline: index.html is missing from the build');

      const source = readFileSync(path.resolve(__dirname, 'src/sw.js'), 'utf8')
        .replace('__FILES__', JSON.stringify(files.sort().map((name) => `/${name}`)))
        .replace('__VERSION__', hash.digest('hex').slice(0, 12));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// /api/report while developing, running the same code as the server. the resend key is read from .env
// here, on this machine, and never goes into the app the browser loads
function reportApi(): Plugin {
  let handle: (req: unknown, res: unknown) => void = () => {};
  return {
    name: 'snappdf-report-api',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '');
      handle = createReportHandler({ apiKey: env.RESEND_API_KEY, to: env.REPORT_TO, from: env.REPORT_FROM || undefined });
    },
    configureServer(server) {
      server.middlewares.use('/api/report', (req, res) => handle(req, res));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/report', (req, res) => handle(req, res));
    },
  };
}

export default defineConfig({
  // seo before offline, so the pages it writes are saved for offline use too
  plugins: [react(), tailwindcss(), seo(), offline(), reportApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
