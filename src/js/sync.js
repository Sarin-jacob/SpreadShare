// src/js/sync.js
import { CONFIG } from './config.js';
import { getAccessToken } from './auth.js';
import { openDatabase } from './db.js';

async function googleFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error("Sync engine stalled: Invalid context session.");

  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloud Core Exception [${response.status}]: ${error}`);
  }
  return response.json();
}

export async function getOrCreateRootFolder() {
  const query = encodeURIComponent(`name='${CONFIG.APP_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const result = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`);
  
  if (result.files && result.files.length > 0) return result.files[0].id;

  const folderMeta = { name: CONFIG.APP_DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' };
  const newFolder = await googleFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    body: JSON.stringify(folderMeta)
  });
  return newFolder.id;
}

export async function createGroupSpreadsheet(groupName, parentFolderId) {
  const sheetMeta = {
    properties: { title: groupName },
    sheets: [{ properties: { title: 'transaction_ledger' } }]
  };
  
  const spreadsheet = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify(sheetMeta)
  });
  
  const spreadsheetId = spreadsheet.spreadsheetId;
  await googleFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}`, { method: 'PATCH' });
  
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/transaction_ledger!A1:E1:append?valueInputOption=USER_ENTERED`;
  const headerPayload = { values: [['timestamp', 'event_id', 'event_type', 'actor_identity', 'payload_json']] };
  await googleFetch(appendUrl, { method: 'POST', body: JSON.stringify(headerPayload) });
  
  return spreadsheetId;
}

/**
 * ─── ISOLATED USER CONFIG REGISTRY ENGINE ───
 * Manages the user's cross-device workspace tracking configuration database file.
 */
export async function syncUserConfigRegistry(groupDirectoryArray) {
  console.log("Synchronizing isolated workspace directory index map to Drive...");
  const configFileName = '.spreadshare_user_config';
  const query = encodeURIComponent(`name='${configFileName}' and mimeType='application/json' and trashed=false`);
  const searchResult = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
  
  const payloadBlob = new Blob([JSON.stringify(groupDirectoryArray)], { type: 'application/json' });
  
  // Use simple upload metadata endpoints
  if (searchResult.files && searchResult.files.length > 0) {
    const fileId = searchResult.files[0].id;
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${getAccessToken()}` },
      body: payloadBlob
    });
  } else {
    // Structural Initialization Sequence
    const meta = { name: configFileName, mimeType: 'application/json' };
    const initialFile = await googleFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      body: JSON.stringify(meta)
    });
    
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${initialFile.id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${getAccessToken()}` },
      body: payloadBlob
    });
  }
}

/**
 * ─── BACKGROUND WRITE WORKER QUEUE PROCESSOR ───
 * Iterates over local IndexedDB queues and flushes transactions out via atomic batch requests.
 */
export async function processOfflineQueue(onSyncProgress) {
  const db = await openDatabase();
  const tx = db.transaction('offline_sync_queue', 'readwrite');
  const store = tx.objectStore('offline_sync_queue');
  const allQueuedRequests = await new Promise((resolve) => {
    store.getAll().onsuccess = (e) => resolve(e.target.result);
  });

  if (allQueuedRequests.length === 0) return;
  if (onSyncProgress) onSyncProgress(true);

  for (const queuedItem of allQueuedRequests) {
    if (queuedItem.action === 'APPEND_ROW') {
      const record = queuedItem.payload;
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${queuedItem.spreadsheetId}/values/transaction_ledger!A:E:append?valueInputOption=USER_ENTERED`;
      
      const payloadData = {
        values: [[
          record.timestamp,
          record.eventId,
          record.event_type,
          record.actor_identity,
          JSON.stringify(record.payload_json)
        ]]
      };

      try {
        await googleFetch(appendUrl, { method: 'POST', body: JSON.stringify(payloadData) });
        // Delete item from queue store processing task successfully
        const cleanupTx = db.transaction('offline_sync_queue', 'readwrite');
        cleanupTx.objectStore('offline_sync_queue').delete(queuedItem.id);
      } catch (err) {
        console.error(`Failed pushing row append task index token [${queuedItem.id}]:`, err);
        break; // Stop loop sequence processing to prevent out-of-order execution if network dropped
      }
    }
  }
  if (onSyncProgress) onSyncProgress(false);
}