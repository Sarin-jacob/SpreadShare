// build/build-info.js
// Vite plugin: gives every build a unique ID.
//  - The app gets __APP_VERSION__, __BUILD_ID__ and __BUILD_TIME__ (shown in Settings).
//  - dist/sw.js gets the same ID in place of '__BUILD_ID__', so every deploy changes the service
//    worker's bytes. That's what makes browsers notice an update and lets the app offer it.
//  - dist/sw.js also gets the list of built JS/CSS files in place of '__PRECACHE__', so a new
//    version installs with all its code, including lazy chunks (receipt reader glue, pdf.js) that
//    would otherwise only be cached once used online.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
}

export default function buildInfo() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const time = new Date();
  const id = `${pkg.version}-${gitSha()}-${time.getTime().toString(36)}`;
  let outDir = 'dist';

  return {
    name: 'spreadshare-build-info',
    config: () => ({
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __BUILD_ID__: JSON.stringify(id),
        __BUILD_TIME__: JSON.stringify(time.toISOString()),
      },
    }),
    configResolved(config) {
      outDir = config.build.outDir;
    },
    // Runs after Vite has copied public/ into the output folder.
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      if (!existsSync(sw)) return;
      const assets = existsSync(join(outDir, 'assets')) ? readdirSync(join(outDir, 'assets')).map((f) => `./assets/${f}`) : [];
      writeFileSync(
        sw,
        readFileSync(sw, 'utf8')
          .replaceAll('__BUILD_ID__', id)
          .replace("['__PRECACHE__']", JSON.stringify(['./manifest.webmanifest', ...assets.sort()]))
      );
    },
  };
}
