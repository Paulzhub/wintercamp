import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import config from './site.config.js';

const base = process.env.WC_BASE || config.site.basePath;

export default defineConfig({
  base,
  server: { port: 5173, host: true },
  preview: { port: 4173 },
  build: {
    target: 'es2020',
    // Nothing is inlined as a data: URI, so the Content Security Policy can stay strict.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        privacy: resolve(import.meta.dirname, 'privacy/index.html'),
      },
    },
  },
});
