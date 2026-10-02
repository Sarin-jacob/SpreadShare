import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import brandIcons from './build/brand-icons.js';

export default defineConfig({
  // Relative base so the build works both at a domain root and under /SpreadShare/ on GitHub Pages
  base: './',
  resolve: {
    alias: {
      // Vendored receipt code imports PaddleOCR from a CDN at load time; defer that download
      // until OCR is actually used (see src/lib/receipt/paddle-lazy.js).
      'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm': fileURLToPath(new URL('./src/lib/receipt/paddle-lazy.js', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 8080,
    host: '0.0.0.0',
  },
  plugins: [svelte(), tailwindcss(), brandIcons()],
});
