// src/lib/ocrOffline.svelte.js
// Keeps the receipt reader (PaddleOCR + models, ~67 MB) on the device so scanning feels native
// and works offline. The service worker stores the files in OCR_CACHE as they're fetched;
// this module decides when to fetch them and reports progress.
import { pwa } from './pwa.svelte.js';

// Keep in sync with public/sw.js.
const OCR_CACHE = 'spreadshare-ocr-paddle-0.4.2';
const EXPECTED_BYTES = 67 * 1024 * 1024;
const AUTO_KEY = 'ss_ocr_auto_downloaded';
const MANIFEST_KEY = 'ss_ocr_files'; // exact URLs this device's reader needs

/** Same rule as isOcrAsset() in public/sw.js. */
const isOcrUrl = (href) => {
  const url = new URL(href);
  if (url.hostname === 'paddle-model-ecology.bj.bcebos.com') return true;
  return url.hostname === 'cdn.jsdelivr.net' && /^\/npm\/(@[^/]+\/)?[^/@]+@\d[^/]*\//.test(url.pathname);
};

function readManifest() {
  try {
    return JSON.parse(localStorage.getItem(MANIFEST_KEY) || 'null');
  } catch {
    return null;
  }
}

export const ocrOffline = $state({
  /** 'unsupported' | 'checking' | 'missing' | 'downloading' | 'ready' | 'error' */
  status: 'checking',
  progress: 0, // 0..1 while downloading
  bytes: 0, // size on disk once ready
  error: null,
});

const supported = () => 'serviceWorker' in navigator && 'caches' in window && import.meta.env.PROD;

/** Models + a runtime binary present = everything a scan needs is cached. */
async function cachedEntries() {
  if (!(await caches.has(OCR_CACHE))) return [];
  const cache = await caches.open(OCR_CACHE);
  return cache.keys();
}

function isComplete(keys) {
  const urls = new Set(keys.map((r) => r.url));
  const manifest = readManifest();
  if (manifest?.length) return manifest.every((u) => urls.has(u));
  // No manifest yet (e.g. cached by a scan): models + a runtime binary + the module entry.
  const list = [...urls];
  return list.filter((u) => /_onnx_infer\.tar$/.test(u)).length >= 2 && list.some((u) => /\.wasm$/.test(u)) && list.some((u) => /paddleocr-js@/.test(u));
}

/**
 * Makes sure every reader file this page loaded is in the offline cache. Needed because the
 * browser may serve already-loaded modules from memory without asking the service worker.
 */
async function storeUsedFiles() {
  const used = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter(isOcrUrl))];
  if (!used.length) return;
  const cache = await caches.open(OCR_CACHE);
  for (const url of used) {
    if (!(await cache.match(url))) await cache.add(new Request(url, { mode: 'cors', credentials: 'omit' }));
  }
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(used));
  } catch {}
}

/** Re-reads the cache. While a download runs, status stays 'downloading' unless `force`. */
export async function checkOcrOffline({ force = false } = {}) {
  if (!supported()) {
    ocrOffline.status = 'unsupported';
    return ocrOffline.status;
  }
  if (ocrOffline.status === 'downloading' && !force) return ocrOffline.status;
  try {
    const keys = await cachedEntries();
    if (isComplete(keys)) {
      ocrOffline.status = 'ready';
      ocrOffline.bytes = await sizeOf(keys);
    } else {
      ocrOffline.status = 'missing';
    }
  } catch {
    ocrOffline.status = 'missing';
  }
  return ocrOffline.status;
}

async function sizeOf(keys) {
  if (navigator.storage?.estimate) {
    // Cheap and good enough: the OCR cache is by far the biggest thing this origin stores.
    const { usageDetails, usage } = await navigator.storage.estimate();
    if (usageDetails?.caches) return usageDetails.caches;
    if (usage) return usage;
  }
  return keys.length ? EXPECTED_BYTES : 0;
}

/** Resolves once a service worker controls this page (fetches before that bypass the cache). */
async function swControl() {
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;
  await new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    setTimeout(resolve, 5000);
  });
}

let running = null;

/** Downloads the reader for offline use. Safe to call repeatedly. */
export function downloadOcr() {
  if (!supported()) return Promise.resolve(false);
  running ??= (async () => {
    ocrOffline.status = 'downloading';
    ocrOffline.progress = 0;
    try {
      localStorage.setItem(AUTO_KEY, 'started');
    } catch {}
    ocrOffline.error = null;
    const loaded = new Map();
    const channel = new BroadcastChannel('ss-ocr-download');
    channel.onmessage = ({ data }) => {
      loaded.set(data.url, data.loaded);
      const total = [...loaded.values()].reduce((s, v) => s + v, 0);
      ocrOffline.progress = Math.min(0.99, total / EXPECTED_BYTES);
    };
    try {
      await swControl();
      // Ask the browser not to evict ~67 MB when storage gets tight.
      navigator.storage?.persist?.().catch(() => {});
      performance.setResourceTimingBufferSize?.(1000);
      const receipt = await import('./receipt/index.js');
      await receipt.warmUp();
      await storeUsedFiles();
      // PDF bills too: pdf.js is same-origin, so loading it once lets the service worker keep it.
      await import('./receipt/pdf.js').then((m) => m.warmPdf()).catch(() => {});
      // Cache writes finish slightly after the last byte reaches the page.
      for (let i = 0; i < 60 && !isComplete(await cachedEntries()); i++) await new Promise((r) => setTimeout(r, 500));
      await checkOcrOffline({ force: true });
      if (ocrOffline.status !== 'ready') throw new Error('The download finished but could not be saved for offline use.');
      ocrOffline.progress = 1;
      return true;
    } catch (e) {
      console.warn('Receipt reader download failed', e);
      ocrOffline.status = 'error';
      ocrOffline.error = navigator.onLine ? e.message || 'Download failed' : 'You’re offline';
      return false;
    } finally {
      channel.close();
      running = null;
    }
  })();
  return running;
}

/** After a scan downloaded the reader, keep it for offline use too (unless the user removed it). */
export async function keepAfterScan() {
  if (!supported() || ocrOffline.status === 'ready' || ocrOffline.status === 'downloading') return;
  try {
    if (localStorage.getItem(AUTO_KEY) === 'removed') return;
    await storeUsedFiles();
    await checkOcrOffline();
  } catch {}
}

export async function removeOcr() {
  await caches.delete(OCR_CACHE);
  try {
    localStorage.removeItem(MANIFEST_KEY);
    localStorage.setItem(AUTO_KEY, 'removed');
  } catch {}
  ocrOffline.bytes = 0;
  await checkOcrOffline();
}

/**
 * Installed app → fetch the reader in the background, like a native app's bundled assets.
 * Skipped on Data Saver / offline, and never repeated after the user removes it.
 */
export async function autoDownloadIfInstalled() {
  if ((await checkOcrOffline()) !== 'missing' || !pwa.installed) return;
  if (!navigator.onLine || navigator.connection?.saveData) return;
  let prior = null;
  try {
    prior = localStorage.getItem(AUTO_KEY);
  } catch {}
  if (prior === 'removed') return;
  try {
    localStorage.setItem(AUTO_KEY, 'started');
  } catch {}
  // Let the app finish starting up and syncing first.
  setTimeout(() => downloadOcr(), 8000);
}

export function initOcrOffline() {
  checkOcrOffline().then(() => autoDownloadIfInstalled());
  window.addEventListener('appinstalled', () => autoDownloadIfInstalled());
  window.addEventListener('online', () => autoDownloadIfInstalled());
}
