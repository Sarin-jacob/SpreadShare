// SpreadShare service worker.
// - Content-hashed build output (assets/, icons/): cache-first , a new deploy means new URLs.
// - Everything else on this origin (index.html, manifests): network-first, cache as offline fallback.
// - Receipt reader (PaddleOCR code, ONNX runtime, OCR models): cache-first in its own cache so the
//   ~67 MB download survives app updates and scanning works offline. Every URL is version-pinned.
// - Other cross-origin requests (Google APIs, exchange rates) are never intercepted.
// Replaced with a unique ID on every build (build/build-info.js), so each deploy is a new worker.
const BUILD = '0.1.0-eba3f39-mv3oc24y';
const CACHE = `spreadshare-app-${BUILD}`;
// Holds the last thing shared into the app (see receiveShare) until the #/share screen picks it up.
const SHARE_CACHE = 'spreadshare-share';
// Reminder schedule written by the page (src/lib/notify.svelte.js) and which ones were shown.
const NOTIFY_CACHE = 'spreadshare-notify';
// Keep in sync with src/lib/ocrOffline.svelte.js. Bump when the vendored PaddleOCR version changes.
const OCR_CACHE = 'spreadshare-ocr-paddle-0.4.2';
const SHELL = ['./', './index.html'];
// Every built JS/CSS file, filled in by build/build-info.js. Precached so the whole app, including
// the receipt scanner's lazy chunks, works offline right after an update.
const PRECACHE = ["./manifest.webmanifest","./icons/badge-96.png","./assets/index-Cpx5aPUR.css","./assets/index-DqdR4S7x.js","./assets/pdf-BlcXMlPs.js","./assets/pdf.worker.min-Dswkl-cV.mjs","./assets/qrcode-DQBCZAED.js","./assets/receipt-CgxJuEr4.js"];
const IMMUTABLE = /\/(assets|icons)\//;

/** Version-pinned packages on jsDelivr ("/npm/name@1.2.3/…") and the PaddleOCR model bucket. */
function isOcrAsset(url) {
  if (url.hostname === 'paddle-model-ecology.bj.bcebos.com') return true;
  return url.hostname === 'cdn.jsdelivr.net' && /^\/npm\/(@[^/]+\/)?[^/@]+@\d[^/]*\//.test(url.pathname);
}

// A new version installs in the background and then waits, so the app can offer "Update" instead
// of swapping code under someone mid-entry. (The very first install activates straight away.)
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Content-hashed files that didn't change are copied from the previous version's cache;
      // the rest are downloaded. Best effort: one failed file must not block the update.
      const files = PRECACHE.filter((u) => u !== '__PRECACHE__');
      await Promise.allSettled(
        files.map(async (u) => {
          const url = new URL(u, self.registration.scope).href;
          const old = IMMUTABLE.test(url) ? await caches.match(url) : null;
          if (old) return cache.put(url, old);
          const res = await fetch(url, { cache: 'no-cache' });
          if (res.ok) await cache.put(url, res);
        })
      );
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.ports?.[0]?.postMessage({ build: BUILD });
  if (event.data?.type === 'CHECK_REMINDERS') event.waitUntil(showDueReminders());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![CACHE, OCR_CACHE, SHARE_CACHE, NOTIFY_CACHE].includes(k)).map((k) => caches.delete(k))))
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

// ─── Notifications ───

async function readJson(cache, key, fallback) {
  try {
    return (await (await cache.match(key))?.json()) ?? fallback;
  } catch {
    return fallback;
  }
}

async function updateBadge() {
  if (!self.navigator.setAppBadge) return;
  const count = (await self.registration.getNotifications()).length;
  await (count ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge()).catch(() => {});
}

/** Shows reminders that are due and haven't been shown yet (each one once). */
async function showDueReminders() {
  if (self.Notification?.permission !== 'granted') return;
  const cache = await caches.open(NOTIFY_CACHE);
  const { items = [] } = await readJson(cache, 'schedule', {});
  const shown = await readJson(cache, 'shown', []);
  const now = Date.now();
  const due = items.filter((r) => r.at <= now && r.at > now - 2 * 86_400_000 && !shown.includes(r.id));
  for (const r of due) {
    await self.registration.showNotification(r.title, { body: r.body, icon: r.icon, badge: r.badge, tag: r.id, data: { url: r.url } });
    shown.push(r.id);
  }
  if (due.length) {
    await cache.put('shown', new Response(JSON.stringify(shown.slice(-200)), { headers: { 'Content-Type': 'application/json' } }));
    await updateBadge();
  }
}

// Android (installed app): Chrome wakes the worker about once a day when it sees fit.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'ss-reminders') event.waitUntil(showDueReminders());
});

// Tapping a notification opens the app at the entry or group (reusing an open window).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(`./${event.notification.data?.url || ''}`, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((w) => w.url.startsWith(self.registration.scope));
      if (win) {
        await win.focus();
        await win.navigate(target).catch(() => win.postMessage({ type: 'OPEN', url: event.notification.data?.url }));
      } else {
        await self.clients.openWindow(target);
      }
      await updateBadge();
    })()
  );
});

self.addEventListener('notificationclose', (event) => event.waitUntil(updateBadge()));

// Web Share Target: the OS posts shared files / text here. Park them in SHARE_CACHE and open the app.
async function receiveShare(req) {
  const scope = self.registration.scope;
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter((f) => f && typeof f !== 'string' && f.size > 0);
    const text = ['title', 'text', 'url']
      .map((k) => form.get(k))
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all((await cache.keys()).map((k) => cache.delete(k)));
    const meta = { at: Date.now(), text, files: files.map((f, i) => ({ key: `__share/${i}`, name: f.name, type: f.type })) };
    await Promise.all(
      files.map((f, i) => cache.put(new URL(`__share/${i}`, scope).href, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } })))
    );
    await cache.put(new URL('__share/meta', scope).href, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch (err) {
    console.warn('Share target failed', err);
  }
  return Response.redirect(new URL('./#/share', scope).href, 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;

  if (url.origin !== self.location.origin) {
    if (isOcrAsset(url)) event.respondWith(ocrAsset(event));
    return;
  }

  if (req.mode === 'navigate' && !/\.html?$/.test(url.pathname.replace(/\/index\.html$/, '/'))) {
    // The app (invite links carry ?invite=…): one cached shell for any navigation to it.
    event.respondWith(networkFirst(req, './index.html'));
  } else if (req.mode === 'navigate') {
    // Other pages (privacy.html, terms.html) are cached under their own URL.
    event.respondWith(networkFirst(req));
  } else if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});
