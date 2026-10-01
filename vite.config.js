import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the build works both at a domain root and under /SpreadShare/ on GitHub Pages
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 8080,
    host: '0.0.0.0',
  },
  plugins: [svelte(), tailwindcss()],
});
