// build/brand-icons.js
// Vite plugin: generates the app icon for every accent palette defined in src/app.css.
//   icons/<accent>.svg                 favicon (modern browsers)
//   icons/<accent>-{192,512}.png       manifest icons
//   icons/<accent>-maskable-512.png    Android adaptive icon
//   icons/<accent>-180.png             apple-touch-icon
//   manifest-<accent>.webmanifest      one manifest per accent (+ manifest.webmanifest = default)
// The page swaps its <link> tags to the current accent (see src/lib/settings.svelte.js).
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { brandIconSvg } from '../src/lib/brandIcon.js';

const DEFAULT_ACCENT = 'indigo';
const SHADES = [100, 200, 300, 500, 600, 700, 800];

/** Parses `html[data-accent="x"] { --accent-500: #...; }` blocks out of the stylesheet. */
export function readPalettes(cssPath) {
  const css = readFileSync(cssPath, 'utf8');
  const palettes = {};
  for (const [, name, body] of css.matchAll(/html\[data-accent="(\w+)"\]\s*\{([^}]*)\}/g)) {
    const shades = {};
    for (const [, n, hex] of body.matchAll(/--accent-(\d+):\s*(#[0-9a-fA-F]{3,8})/g)) shades[n] = hex;
    if (SHADES.every((n) => shades[n])) palettes[name] = shades;
  }
  if (!palettes[DEFAULT_ACCENT]) throw new Error(`brand-icons: no "${DEFAULT_ACCENT}" palette found in ${cssPath}`);
  return palettes;
}

const png = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng();

function manifest(accent) {
  return JSON.stringify(
    {
      id: './',
      name: 'SpreadShare',
      short_name: 'SpreadShare',
      description: 'Serverless group expense splitting backed by your own Google Sheets.',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#0f172a',
      // Lets the installed app receive receipt photos / screenshots and payment messages from the
      // OS share sheet. Handled by public/sw.js, then the #/share screen.
      share_target: {
        action: './share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['image/*', 'application/pdf', '.pdf'] }] },
      },
      icons: [
        { src: `icons/${accent}.svg`, sizes: 'any', type: 'image/svg+xml' },
        { src: `icons/${accent}-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `icons/${accent}-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `icons/${accent}-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2
  );
}

/** @returns {Map<string, { body: Buffer|string, type: string }>} path (no leading slash) → file */
export function generateBrandFiles(cssPath) {
  const files = new Map();
  for (const [accent, shades] of Object.entries(readPalettes(cssPath))) {
    const svg = brandIconSvg(shades);
    const maskable = brandIconSvg(shades, { maskable: true });
    files.set(`icons/${accent}.svg`, { body: svg, type: 'image/svg+xml' });
    files.set(`icons/${accent}-192.png`, { body: png(svg, 192), type: 'image/png' });
    files.set(`icons/${accent}-512.png`, { body: png(svg, 512), type: 'image/png' });
    files.set(`icons/${accent}-maskable-512.png`, { body: png(maskable, 512), type: 'image/png' });
    files.set(`icons/${accent}-180.png`, { body: png(maskable, 180), type: 'image/png' });
    files.set(`manifest-${accent}.webmanifest`, { body: manifest(accent), type: 'application/manifest+json' });
  }
  files.set('manifest.webmanifest', { body: manifest(DEFAULT_ACCENT), type: 'application/manifest+json' });
  return files;
}

export default function brandIcons({ css = 'src/app.css' } = {}) {
  let files = null;
  const get = () => (files ??= generateBrandFiles(css));

  return {
    name: 'spreadshare-brand-icons',

    configureServer(server) {
      server.watcher.add(css);
      server.watcher.on('change', (file) => {
        if (file.replace(/\\/g, '/').endsWith(css)) files = null;
      });
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
        const file = get().get(path);
        if (!file) return next();
        res.setHeader('Content-Type', file.type);
        res.end(file.body);
      });
    },

    generateBundle() {
      for (const [fileName, { body }] of get()) {
        this.emitFile({ type: 'asset', fileName, source: body });
      }
    },
  };
}
