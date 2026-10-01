// SpreadShare service worker.
// - Content-hashed build output (assets/, icons/): cache-first — a new deploy means new URLs.
// - Everything else on this origin (index.html, manifests): network-first, cache as offline fallback.
// - Receipt reader (PaddleOCR code, ONNX runtime, OCR models): cache-first in its own cache so the
//   ~67 MB download survives app updates and scanning works offline. Every URL is version-pinned.
// - Other cross-origin requests (Google APIs, exchange rates) are never intercepted.
const CACHE = 'spreadshare-v5';
// Keep in sync with src/lib/ocrOffline.svelte.js. Bump when the vendored PaddleOCR version changes.
const OCR_CACHE = 'spreadshare-ocr-paddle-0.4.2';
const SHELL = ['./', './index.html'];
const IMMUTABLE = /\/(assets|icons)\//;

/** Version-pinned packages on jsDelivr ("/npm/name@1.2.3/…") and the PaddleOCR model bucket. */
function isOcrAsset(url) {
  if (url.hostname === 'paddle-model-ecology.bj.bcebos.com') return true;
  return url.hostname === 'cdn.jsdelivr.net' && /^\/npm\/(@[^/]+\/)?[^/@]+@\d[^/]*\//.test(url.pathname);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req, cacheKey = req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Download progress for the receipt reader, so the page can show a progress bar.
const progress = new BroadcastChannel('ss-ocr-download');

function counted(body, url) {
  let loaded = 0;
  let last = 0;
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        const now = Date.now();
        if (now - last > 250) {
          last = now;
          progress.postMessage({ url, loaded });
        }
        controller.enqueue(chunk);
      },
      flush() {
        progress.postMessage({ url, loaded, done: true });
      },
    })
  );
}

async function ocrAsset(event) {
  const req = event.request;
  const cache = await caches.open(OCR_CACHE);
  const cached = await cache.match(req.url);
  if (cached) return cached;
  const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
  if (res.ok && res.body) {
    const copy = res.clone();
    const stored = new Response(counted(copy.body, req.url), {
      status: copy.status,
      statusText: copy.statusText,
      headers: copy.headers,
    });
    event.waitUntil(cache.put(req.url, stored).catch(() => {}));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (isOcrAsset(url)) event.respondWith(ocrAsset(event));
    return;
  }

  if (req.mode === 'navigate') {
    // Invite links carry ?invite=…; serve the same cached shell for any navigation.
    event.respondWith(networkFirst(req, './index.html'));
  } else if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});
