// src/main.js
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { boot, captureInvite } from './lib/app.svelte.js';
import { syncThemeColor, applyBrandLinks } from './lib/settings.svelte.js';
import { initOcrOffline } from './lib/ocrOffline.svelte.js';

captureInvite();
syncThemeColor();
applyBrandLinks();

const app = mount(App, { target: document.getElementById('app') });
boot();
initOcrOffline();

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
    });
  } else {
    // A worker left over from a production build or the old app would serve stale dev modules.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  }
}

export default app;
