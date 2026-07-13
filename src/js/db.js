// js/db.js
const DB_NAME = 'SpreadShareDB';
const DB_VERSION = 1;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Raw event ledger cache (Composite key: spreadsheetId + eventId)
      if (!db.objectStoreNames.contains('group_events_cache')) {
        db.createObjectStore('group_events_cache', { keyPath: ['spreadsheetId', 'eventId'] });
      }

      // 2. Pre-computed balance matrix state cache
      if (!db.objectStoreNames.contains('reconstructed_state')) {
        db.createObjectStore('reconstructed_state', { keyPath: 'spreadsheetId' });
      }

      // 3. Outbound synchronization pipeline queue
      if (!db.objectStoreNames.contains('offline_sync_queue')) {
        db.createObjectStore('offline_sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Helper utility to write out mutation frames dynamically
export async function writeToStore(storeName, data) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}