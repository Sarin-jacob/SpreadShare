// src/js/services/LedgerService.js
import { CONFIG } from '../config.js';
import { AuthService } from '../auth.js';
import { store } from '../store.js';
import { writeToStore, getAllFromStore, deleteFromStore } from '../db.js';

class SpreadsheetLedgerService {
  
  // ─── INTERNAL NETWORK ENGINE ───

  async _googleFetch(url, options = {}) {
    const token = AuthService.getAccessToken();
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

  // ─── INFRASTRUCTURE PROVISIONING ───

  async getOrCreateRootFolder() {
    const query = encodeURIComponent(`name='${CONFIG.APP_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const result = await this._googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`);
    if (result.files && result.files.length > 0) return result.files[0].id;

    const folderMeta = { name: CONFIG.APP_DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' };
    const newFolder = await this._googleFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      body: JSON.stringify(folderMeta)
    });
    return newFolder.id;
  }

  async createGroupSpreadsheet(groupName, parentFolderId) {
    const sheetMeta = {
      properties: { title: groupName },
      sheets: [{ properties: { title: 'transaction_ledger' } }]
    };
    const spreadsheet = await this._googleFetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify(sheetMeta)
    });
    
    const spreadsheetId = spreadsheet.spreadsheetId;
    await this._googleFetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${parentFolderId}`, { method: 'PATCH' });
    
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/transaction_ledger!A1:E1:append?valueInputOption=USER_ENTERED`;
    const headerPayload = { values: [['timestamp', 'event_id', 'event_type', 'actor_identity', 'payload_json']] };
    await this._googleFetch(appendUrl, { method: 'POST', body: JSON.stringify(headerPayload) });
    
    return spreadsheetId;
  }

  async enableLedgerPublicLinkSharing(fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
    const permissionMeta = { role: 'writer', type: 'anyone', allowFileDiscovery: false };
    return await this._googleFetch(url, { method: 'POST', body: JSON.stringify(permissionMeta) });
  }

  async makeFilePubliclyReadable(fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
    const permissionMeta = { role: 'reader', type: 'anyone', allowFileDiscovery: false };
    return await this._googleFetch(url, { method: 'POST', body: JSON.stringify(permissionMeta) });
  }

  // ─── CONFIG REGISTRY (CROSS-DEVICE SYNC) ───

  async syncUserConfigRegistry(groupDirectoryArray) {
    const configFileName = '.spreadshare_user_config';
    const query = encodeURIComponent(`name='${configFileName}' and trashed=false`);
    const searchResult = await this._googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
    const payloadBlob = new Blob([JSON.stringify(groupDirectoryArray)], { type: 'application/json' });
    
    const token = AuthService.getAccessToken();
    if (searchResult.files && searchResult.files.length > 0) {
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${searchResult.files[0].id}?uploadType=media`, {
        method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }, body: payloadBlob
      });
    } else {
      const meta = { name: configFileName, mimeType: 'application/json' };
      const initialFile = await this._googleFetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', body: JSON.stringify(meta) });
      await fetch(`https://www.googleapis.com/upload/drive/v3/files/${initialFile.id}?uploadType=media`, {
        method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }, body: payloadBlob
      });
    }
  }

  async fetchUserConfigRegistry() {
    const configFileName = '.spreadshare_user_config';
    const query = encodeURIComponent(`name='${configFileName}' and trashed=false`);
    const searchResult = await this._googleFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`);
    
    if (searchResult.files && searchResult.files.length > 0) {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${searchResult.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${AuthService.getAccessToken()}` }
      });
      if (res.ok) return await res.json();
    }
    return [];
  }

  // ─── CORE LEDGER OPERATIONS ───

  async syncWorkspace(spreadsheetId) {
    store.setState({ syncStatus: 'syncing' });
    try {
      const currentState = store.getState();
      const lastKnownRowIndex = currentState.groupEvents.length;
      const targetStartRow = lastKnownRowIndex + 2; 
      const range = `transaction_ledger!A${targetStartRow}:E`;
      const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
      
      const data = await this._googleFetch(readUrl);
      const newRows = data.values || [];

      if (newRows.length > 0) {
        const parsedEvents = newRows.map(row => ({
          spreadsheetId: spreadsheetId,
          timestamp: row[0],
          eventId: row[1],
          event_type: row[2],
          actor_identity: row[3],
          payload_json: JSON.parse(row[4])
        }));

        for (const ev of parsedEvents) {
          await writeToStore('group_events_cache', ev);
        }

        store.setState({ groupEvents: [...currentState.groupEvents, ...parsedEvents] });
      }
    } catch (err) {
      console.warn("Delta update loop deferred offline:", err);
    } finally {
      store.setState({ syncStatus: 'synced' });
    }
  }

  async appendLocalEvent(spreadsheetId, eventType, payload) {
    const state = store.getState();
    const trueActor = payload.override_actor_identity || state.userProfile.email;
    if (payload.override_actor_identity) {
      delete payload.override_actor_identity;
    }

    const eventRecord = {
      spreadsheetId: spreadsheetId,
      eventId: crypto.randomUUID(),
      timestamp: payload.custom_timestamp || new Date().toISOString(),
      event_type: eventType,
      actor_identity: trueActor, // Applies the intercepted sender
      payload_json: payload
    };

    // 1. Burn into local cache immediately
    await writeToStore('group_events_cache', eventRecord);
    
    // 2. Queue for offline sync transmission
    await writeToStore('offline_sync_queue', { 
      action: 'APPEND_ROW', 
      spreadsheetId: spreadsheetId, 
      payload: eventRecord 
    });

    // 3. Update active store instantly for zero-latency UI interaction
    store.setState({ groupEvents: [...state.groupEvents, eventRecord] });

    // 4. Fire background network push
    this.processOfflineQueue();
  }

  async processOfflineQueue() {
    const allQueuedRequests = await getAllFromStore('offline_sync_queue');
    if (allQueuedRequests.length === 0) return;

    store.setState({ syncStatus: 'syncing' });

    for (const queuedItem of allQueuedRequests) {
      if (queuedItem.action === 'APPEND_ROW') {
        const record = queuedItem.payload;

        // ─── CRITICAL FIX: INTERCEPT BASE64 RECEIPTS AND OFFLOAD TO GOOGLE DRIVE ───
        if (record.payload_json.receipt_local_url && record.payload_json.receipt_local_url.startsWith('data:image')) {
          try {
            const folderId = await this.getOrCreateRootFolder();
            
            // 1. Create file metadata in Drive
            const meta = { 
              name: `receipt_${record.eventId}.jpg`, 
              parents: [folderId],
              mimeType: 'image/jpeg' 
            };
            const fileRes = await this._googleFetch('https://www.googleapis.com/drive/v3/files', { 
              method: 'POST', 
              body: JSON.stringify(meta) 
            });

            // 2. Convert base64 back to raw binary blob
            const res = await fetch(record.payload_json.receipt_local_url);
            const blob = await res.blob();

            // 3. Upload the media bytes directly into the new Drive file
            const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileRes.id}?uploadType=media`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${AuthService.getAccessToken()}` },
              body: blob
            });

            if (!uploadRes.ok) throw new Error("Media payload rejected by Google Drive.");

            // 4. Ensure group members can view the receipt link
            await this.makeFilePubliclyReadable(fileRes.id);

            // 5. Swap the 2-million character Base64 string for a 50 character Drive URL
            record.payload_json.receipt_local_url = `https://drive.google.com/uc?id=${fileRes.id}`;
            
          } catch (err) {
            console.error(`Failed to offload receipt to Drive for task [${queuedItem.id}] - pausing queue:`, err);
            break; // Stop queue processing if the Drive upload fails, preventing the 50k char crash
          }
        }

        // ─── STANDARD PUSH TO GOOGLE SHEETS ───
        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${queuedItem.spreadsheetId}/values/transaction_ledger!A:E:append?valueInputOption=USER_ENTERED`;
        const payloadData = {
          values: [[record.timestamp, record.eventId, record.event_type, record.actor_identity, JSON.stringify(record.payload_json)]]
        };
        
        try {
          await this._googleFetch(appendUrl, { method: 'POST', body: JSON.stringify(payloadData) });
          await deleteFromStore('offline_sync_queue', queuedItem.id);
        } catch (err) {
          console.error(`Failed pushing row append task [${queuedItem.id}] - pausing queue:`, err);
          break; 
        }
      }
    }
    
    store.setState({ syncStatus: 'synced' });
  }
}

export const LedgerService = new SpreadsheetLedgerService();