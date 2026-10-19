import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
// plain javascript, shared with the server
import { createReportHandler } from './server/report.mjs';

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
  plugins: [react(), tailwindcss(), offline(), reportApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
