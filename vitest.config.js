import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()], // compiles runes in *.svelte.js modules that lib code imports
  resolve: {
    alias: {
      // The receipt OCR wrapper imports PaddleOCR from a CDN; tests only use its pure helpers.
      'https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm': fileURLToPath(new URL('./tests/stubs/paddleocr.js', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
});
