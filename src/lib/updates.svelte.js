// src/lib/updates.svelte.js
// App updates. Every build ships a service worker with a unique ID (build/build-info.js), so a
// deploy installs in the background and waits. The app then offers "Update", which activates it
// and reloads. "Reinstall" is the heavy option: drop the service worker and cached app files and
// load everything fresh (data, unsynced entries and the receipt reader are kept).

export const APP_VERSION = __APP_VERSION__;
export const BUILD_ID = __BUILD_ID__;
export const BUILD_TIME = __BUILD_TIME__;

const CHECK_EVERY_MS = 30 * 60 * 1000;
// Kept by "Reinstall": the 67 MB receipt reader and anything shared into the app.
const KEEP_CACHES = (name) => name.startsWith('spreadshare-ocr') || name === 'spreadshare-share';

export const updates = $state({
  supported: 'serviceWorker' in navigator && import.meta.env.PROD,
  available: false, // a new version is installed and waiting
  dismissed: false, // banner hidden for this session
  checking: false,
  applying: false,
  lastChecked: 0,
});

let reg = null;

function watchInstalling(worker) {
  worker?.addEventListener('statechange', () => {
    // "installed" with an existing controller = an update (not the first install).
    if (worker.state === 'installed' && navigator.serviceWorker.controller) updates.available = true;
  });
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) {
    // A worker left over from a production build or the old app would serve stale dev modules.
    (await navigator.serviceWorker.getRegistrations()).forEach((r) => r.unregister());
    return;
  }
  try {
    reg = await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.warn('SW registration failed', err);
    return;
  }
  if (reg.waiting && navigator.serviceWorker.controller) updates.available = true;
  watchInstalling(reg.installing);
  reg.addEventListener('updatefound', () => watchInstalling(reg.installing));

  // Reload once the new version takes over, but only when the user asked for it.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updates.applying && !reloading) {
      reloading = true;
      location.reload();
    }
  });

  // Look for new versions when the app comes back to the foreground, and every half hour.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - updates.lastChecked > CHECK_EVERY_MS) checkForUpdates();
  });
  setInterval(() => checkForUpdates(), CHECK_EVERY_MS);
}

/** Asks the server for a newer version. Resolves true when one is ready to apply. */
export async function checkForUpdates() {
  if (!reg || updates.checking || !navigator.onLine) return updates.available;
  updates.checking = true;
  try {
    await reg.update();
    // If a new worker is downloading, wait (up to 15s) for it to finish installing.
    const w = reg.installing;
    if (w) {
      await new Promise((resolve) => {
        const done = () => ['installed', 'activated', 'redundant'].includes(w.state) && resolve();
        w.addEventListener('statechange', done);
        setTimeout(resolve, 15000);
        done();
      });
    }
    if (reg.waiting && navigator.serviceWorker.controller) updates.available = true;
  } catch (err) {
    console.warn('Update check failed', err);
  } finally {
    updates.lastChecked = Date.now();
    updates.checking = false;
  }
  return updates.available;
}

/** Switches to the waiting version and reloads. */
export function applyUpdate() {
  updates.applying = true;
  const waiting = reg?.waiting;
  if (!waiting) return location.reload();
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Safety net if controllerchange never fires.
  setTimeout(() => location.reload(), 5000);
}

/**
 * Reinstalls the app's code: unregisters the service worker, clears cached app files and reloads,
 * so everything is downloaded fresh. Local data (groups, unsynced entries, settings) is untouched.
 */
export async function reinstallApp() {
  if (!navigator.onLine) throw new Error('You need to be online to reinstall.');
  updates.applying = true;
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const name of await caches.keys()) if (!KEEP_CACHES(name)) await caches.delete(name);
  } finally {
    location.reload();
  }
}
