import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

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

export default defineConfig({
  plugins: [react(), tailwindcss(), offline()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
