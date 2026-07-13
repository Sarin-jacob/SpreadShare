// js/sync.js
import { CONFIG } from './config.js';
import { getAccessToken } from './auth.js';

/**
 * Standardized Google API helper that automatically injects the active OAuth token.
 */
async function googleFetch(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw new Error("Synchronization halted: Missing Google OAuth Access Token.");

  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google API Error [${response.status}]: ${errorBody}`);
  }
  return response.json();
}

/**
 * Step 1: Locates or creates the root application folder in the user's Google Drive.
 */
export async function getOrCreateRootFolder() {
  console.log("Scanning Drive for workspace folder...");
  const query = encodeURIComponent(`name='${CONFIG.APP_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  
  const searchResult = await googleFetch(searchUrl);
  
  if (searchResult.files && searchResult.files.length > 0) {
    console.log(`Workspace folder found. ID: ${searchResult.files[0].id}`);
    return searchResult.files[0].id;
  }

  // Create it if it doesn't exist
  console.log("Root directory absent. Provisioning new Drive folder instance...");
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const folderMeta = {
    name: CONFIG.APP_DRIVE_FOLDER,
    mimeType: 'application/vnd.google-apps.folder'
  };
  
  const newFolder = await googleFetch(createUrl, {
    method: 'POST',
    body: JSON.stringify(folderMeta)
  });
  
  return newFolder.id;
}

/**
 * Step 2: Creates a new Group Spreadsheet inside the SpreadShare root folder
 * and initializes the transactional append ledger sheets headers.
 */
export async function createGroupSpreadsheet(groupName, parentFolderId) {
  console.log(`Provisioning Spreadsheet for group: "${groupName}"...`);
  
  // 1. Setup the spreadsheet shell
  const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const sheetMeta = {
    properties: { title: groupName },
    sheets: [{ properties: { title: 'transaction_ledger' } }]
  };
  
  const spreadsheet = await googleFetch(createUrl, {
    method: 'POST',
    body: JSON.stringify(sheetMeta)
  });
  
  const spreadsheetId = spreadsheet.spreadsheetId;
  
  // 2. Move the spreadsheet into our specific App Drive Folder
  const moveUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}`;
  await googleFetch(moveUrl, { method: 'PATCH' });
  
  // 3. Populate baseline transactional DB structural headers (Row 1)
  console.log("Initializing ledger database structures...");
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/transaction_ledger!A1:E1:append?valueInputOption=USER_ENTERED`;
  const headerPayload = {
    values: [['timestamp', 'event_id', 'event_type', 'actor_identity', 'payload_json']]
  };
  
  await googleFetch(appendUrl, {
    method: 'POST',
    body: JSON.stringify(headerPayload)
  });
  
  return spreadsheetId;
}

/**
 * Step 3: Read Optimization — Index-Bounded Delta Lookup.
 * Pulls only the transaction rows after the client's last known index.
 */
export async function fetchLedgerDelta(spreadsheetId, lastKnownRowIndex) {
  // If lastKnownRowIndex is 0 (uninitialized), we want to read everything from row 2 downwards
  const targetStartRow = lastKnownRowIndex + 2; 
  const range = `transaction_ledger!A${targetStartRow}:E`;
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  
  console.log(`Executing Delta Request. Scope: ${range}`);
  
  try {
    const data = await googleFetch(readUrl);
    return data.values || []; // Returns empty array if no new rows are present
  } catch (error) {
    // Gracefully check if error is due to an out-of-bounds target range (empty sheet tail)
    console.warn("Delta fetch caught up or reached spreadsheet boundaries.", error);
    return [];
  }
}