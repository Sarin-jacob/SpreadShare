// src/lib/db.js
// Thin promise wrapper over IndexedDB. Schema is unchanged from the original app so
// existing local caches and unsynced queues survive the upgrade.

const DB_NAME = 'SpreadShareDB';
const DB_VERSION = 1;

export const STORES = {
  events: 'group_events_cache', // keyPath [spreadsheetId, eventId]
  queue: 'offline_sync_queue', // autoIncrement id
};

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('group_events_cache')) {
        db.createObjectStore('group_events_cache', { keyPath: ['spreadsheetId', 'eventId'] });
      }
      if (!db.objectStoreNames.contains('reconstructed_state')) {
        db.createObjectStore('reconstructed_state', { keyPath: 'spreadsheetId' });
      }
      if (!db.objectStoreNames.contains('offline_sync_queue')) {
        db.createObjectStore('offline_sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const put = (storeName, value) => tx(storeName, 'readwrite', (s) => s.put(value));
export const get = (storeName, key) => tx(storeName, 'readonly', (s) => s.get(key));
export const getAll = (storeName) => tx(storeName, 'readonly', (s) => s.getAll());
export const remove = (storeName, key) => tx(storeName, 'readwrite', (s) => s.delete(key));
export const clear = (storeName) => tx(storeName, 'readwrite', (s) => s.clear());

export const putMany = (storeName, values) =>
  tx(storeName, 'readwrite', (s) => {
    values.forEach((v) => s.put(v));
  });

export const removeMany = (storeName, keys) =>
  tx(storeName, 'readwrite', (s) => {
    keys.forEach((k) => s.delete(k));
  });

/** All cached events for one group (uses the compound-key prefix range). */
export const getGroupEvents = (spreadsheetId) =>
  tx(STORES.events, 'readonly', (s) => s.getAll(IDBKeyRange.bound([spreadsheetId], [spreadsheetId, []])));
