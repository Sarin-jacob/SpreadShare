// SpreadShare service worker.
// - Content-hashed build output (assets/, icons/): cache-first — a new deploy means new URLs.
// - Everything else on this origin (index.html, manifests): network-first, cache as offline fallback.
// - Cross-origin requests (Google APIs, exchange rates) are never intercepted.
const CACHE = 'spreadshare-v4';
const SHELL = ['./', './index.html'];
const IMMUTABLE = /\/(assets|icons)\//;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Invite links carry ?invite=…; serve the same cached shell for any navigation.
    event.respondWith(networkFirst(req, './index.html'));
  } else if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});
