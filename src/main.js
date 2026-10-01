// src/main.js
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { boot, captureInvite } from './lib/app.svelte.js';
import { syncThemeColor, applyBrandLinks } from './lib/settings.svelte.js';

captureInvite();
syncThemeColor();
applyBrandLinks();

const app = mount(App, { target: document.getElementById('app') });
boot();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

export default app;
