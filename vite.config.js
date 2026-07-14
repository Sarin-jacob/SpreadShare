import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server:{
    port:8080,
    host:'0.0.0.0',
  },
  plugins: [
    tailwindcss(),
  ],
});