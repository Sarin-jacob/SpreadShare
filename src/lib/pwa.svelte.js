// src/lib/pwa.svelte.js
// Install prompt + home-screen badge for unsynced entries.

const standaloneQuery = matchMedia('(display-mode: standalone)');
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const pwa = $state({
  installed: standaloneQuery.matches || navigator.standalone === true,
  canPrompt: false,
  /** iOS Safari has no install prompt; show "Share → Add to Home Screen" instead. */
  showIosHint: false,
});
pwa.showIosHint = isIos && !pwa.installed;

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  pwa.canPrompt = true;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  pwa.canPrompt = false;
  pwa.installed = true;
});

standaloneQuery.addEventListener('change', (e) => (pwa.installed = e.matches));

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  pwa.canPrompt = false;
  return outcome === 'accepted';
}

/** Shows the number of not-yet-synced entries on the installed app's icon (where supported). */
export function setBadge(count) {
  if (!('setAppBadge' in navigator)) return;
  (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}
