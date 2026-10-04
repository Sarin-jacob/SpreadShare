// src/main.js
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { boot, captureInvite } from './lib/app.svelte.js';
import { syncThemeColor, applyBrandLinks } from './lib/settings.svelte.js';
import { initOcrOffline } from './lib/ocrOffline.svelte.js';
import { registerServiceWorker } from './lib/updates.svelte.js';
import { initLock } from './lib/lock.svelte.js';

captureInvite();
syncThemeColor();
applyBrandLinks();

const app = mount(App, { target: document.getElementById('app') });
boot();
initOcrOffline();
initLock();

window.addEventListener('load', () => registerServiceWorker());

export default app;
