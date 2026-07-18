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

export async function fetchLedgerDelta(spreadsheetId, lastKnownRowIndex) {
  const targetStartRow = lastKnownRowIndex + 2; 
  const range = `transaction_ledger!A${targetStartRow}:E`;
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  try {
    const data = await googleFetch(readUrl);
    return data.values || [];
  } catch (error) {
    console.warn("Delta fetch caught up or reached boundaries.", error);
    return [];
  }
}

export async function syncUserConfigRegistry(groupDirectoryArray) {
  const configFileName = '.spreadshare_user_config';
  const query = encodeURIComponent(`name='${configFileName}' and trashed=false`);
  const searchResult = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
  const payloadBlob = new Blob([JSON.stringify(groupDirectoryArray)], { type: 'application/json' });
  
  if (searchResult.files && searchResult.files.length > 0) {
    const fileId = searchResult.files[0].id;
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${getAccessToken()}` },
      body: payloadBlob
    });
  } else {
    const meta = { name: configFileName, mimeType: 'application/json' };
    const initialFile = await googleFetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: JSON.stringify(meta) });
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${initialFile.id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${getAccessToken()}` },
      body: payloadBlob
    });
  }
}

/**
 * ─── NEW CRITICAL CROSS-DEVICE SYNC READ ENGINE ───
 * Reads the hidden global group directory database from Drive on refresh.
 */
export async function fetchUserConfigRegistry() {
  const configFileName = '.spreadshare_user_config';
  const query = encodeURIComponent(`name='${configFileName}' and trashed=false`);
  const searchResult = await googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
  
  if (searchResult.files && searchResult.files.length > 0) {
    const fileId = searchResult.files[0].id;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    if (res.ok) return await res.json();
  }
  return [];
}

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
        values: [[record.timestamp, record.eventId, record.event_type, record.actor_identity, JSON.stringify(record.payload_json)]]
      };
      try {
        await googleFetch(appendUrl, { method: 'POST', body: JSON.stringify(payloadData) });
        const cleanupTx = db.transaction('offline_sync_queue', 'readwrite');
        cleanupTx.objectStore('offline_sync_queue').delete(queuedItem.id);
      } catch (err) {
        console.error(`Failed pushing row append task [${queuedItem.id}]:`, err);
        break; 
      }
    }
  }
  if (onSyncProgress) onSyncProgress(false);
}

/**
 * Adjusts the Google Drive file permissions so that anyone with the unique link 
 * can act as a reader/writer node for serverless collaboration.
 * @param {string} fileId - The spreadsheet's unique file ID token
 */
export async function enableLedgerPublicLinkSharing(fileId) {
  console.log("Modifying file permissions for secure link sharing...");
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
  
  const permissionMeta = {
    role: 'writer',
    type: 'anyone',
    allowFileDiscovery: false // Prevents the ledger from showing up in public search results
  };

  const token = getAccessToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(permissionMeta)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to initialize file sharing states: ${err}`);
  }
  return response.json();
}