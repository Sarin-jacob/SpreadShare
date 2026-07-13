import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server:{
    port:8080
  },
  plugins: [
    tailwindcss(),
  ],
});