// build/build-info.js
// Vite plugin: gives every build a unique ID.
//  - The app gets __APP_VERSION__, __BUILD_ID__ and __BUILD_TIME__ (shown in Settings).
//  - dist/sw.js gets the same ID in place of '__BUILD_ID__', so every deploy changes the service
//    worker's bytes. That's what makes browsers notice an update and lets the app offer it.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
      writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', id));
    },
  };
}
