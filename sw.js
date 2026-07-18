// sw.js
const CACHE_NAME = 'spreadshare-shell-v1';

// The core files required to boot the app offline
const APP_SHELL = [
  '/',
  '/index.html',
  '/src/css/style.css',
  '/src/main.js',
  '/src/js/config.js',
  '/src/js/db.js',
  '/src/js/store.js',
  '/src/js/auth.js',
  '/src/js/calculator.js',
  '/src/js/engine.js',
  '/src/js/router.js',
  '/src/js/services/LedgerService.js',
  '/src/js/services/CurrencyService.js',
  '/src/js/services/InsightsService.js',
  '/src/js/components/GroupDirectory.js',
  '/src/js/components/GroupDetail.js',
  '/src/js/components/ExpenseForm.js',
  '/src/js/components/ExpenseDetail.js',
  '/src/js/components/Settings.js',
  '/src/js/components/GlobalInsights.js'
];

// 1. Install Event: Cache the App Shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell');
      return cache.addAll(APP_SHELL);
    })
  );
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// 3. Fetch Event: Stale-While-Revalidate strategy for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude Google API calls — our LedgerService IndexedDB queue handles these
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) {
    return; 
  }

  // Exclude third-party currency API calls
  if (url.hostname.includes('er-api.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Cache the dynamically fetched file for future offline use
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Network failed, we rely on the cached response
      });

      // Return the cached response immediately if available, while updating it in the background
      return cachedResponse || fetchPromise;
    })
  );
});