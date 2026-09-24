import { build } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await build({
  configFile: false,
  root,
  publicDir: false,
  build: {
    outDir: resolve(root, 'site'),
    emptyOutDir: false,
    minify: true,
    rollupOptions: {
      input: resolve(root, 'site/app-entry.js'),
      output: { format: 'es', entryFileNames: 'site-app.js', chunkFileNames: 'site-app-[hash].js' }
    }
  }
});
