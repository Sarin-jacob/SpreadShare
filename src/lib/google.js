// src/lib/google.js
// Raw Google Drive / Sheets calls. No app state here , see app.svelte.js for orchestration.
import { CONFIG } from './config.js';
import { AuthService, AuthRequiredError } from './auth.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const LEDGER_SHEET = 'transaction_ledger';
const CONFIG_FILE = '.spreadshare_user_config';
export const LEDGER_HEADER = ['timestamp', 'event_id', 'event_type', 'actor_identity', 'payload_json'];

let emailHint = null;
export const setEmailHint = (email) => (emailHint = email);

export class GoogleApiError extends Error {
  constructor(status, body) {
    super(`Google API error ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

async function gfetch(url, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const token = await AuthService.ensureValidToken(emailHint);
  const isJson = body !== undefined && typeof body !== 'string' && !(body instanceof Blob);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: isJson ? JSON.stringify(body) : body,
  });
  if (res.status === 401) {
    AuthService.invalidate();
    throw new AuthRequiredError();
  }
  if (!res.ok) throw new GoogleApiError(res.status, await res.text());
  return raw ? res : res.status === 204 ? null : res.json();
}

const q = (s) => encodeURIComponent(s);
const escapeQ = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findFile(query) {
  const r = await gfetch(`${DRIVE}?q=${q(query)}&fields=files(id,name)&spaces=drive`);
  return r.files?.[0]?.id || null;
}

// ─── Provisioning ───

let rootFolderId = null;
export async function getOrCreateRootFolder() {
  if (rootFolderId) return rootFolderId;
  const name = escapeQ(CONFIG.APP_DRIVE_FOLDER);
  rootFolderId = await findFile(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  if (!rootFolderId) {
    const folder = await gfetch(DRIVE, {
      method: 'POST',
      body: { name: CONFIG.APP_DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' },
    });
    rootFolderId = folder.id;
  }
  return rootFolderId;
}

export async function createGroupSpreadsheet(groupName) {
  const folderId = await getOrCreateRootFolder();
  const sheet = await gfetch(SHEETS, {
    method: 'POST',
    body: {
      properties: { title: `SpreadShare · ${groupName}` },
      sheets: [{ properties: { title: LEDGER_SHEET, gridProperties: { frozenRowCount: 1 } } }],
    },
  });
  const id = sheet.spreadsheetId;
  await gfetch(`${DRIVE}/${id}?addParents=${folderId}&fields=id`, { method: 'PATCH', body: {} });
  await gfetch(`${SHEETS}/${id}/values/${q(`${LEDGER_SHEET}!A1:E1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: { values: [LEDGER_HEADER] },
  });
  return id;
}

/** Anyone with the link can edit , this is how invited members get access to the ledger. */
export const shareWithLink = (fileId, role = 'writer') =>
  gfetch(`${DRIVE}/${fileId}/permissions`, {
    method: 'POST',
    body: { role, type: 'anyone', allowFileDiscovery: false },
  });

// ─── Per-user group directory (synced across devices via a Drive file) ───

let configFileId = null;
async function getConfigFileId() {
  configFileId ??= await findFile(`name='${CONFIG_FILE}' and trashed=false`);
  return configFileId;
}

export async function readDirectory() {
  const id = await getConfigFileId();
  if (!id) return [];
  const res = await gfetch(`${DRIVE}/${id}?alt=media`, { raw: true });
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function writeDirectory(directory) {
  let id = await getConfigFileId();
  if (!id) {
    const file = await gfetch(DRIVE, { method: 'POST', body: { name: CONFIG_FILE, mimeType: 'application/json' } });
    id = configFileId = file.id;
  }
  const clean = directory.map(({ id, name }) => ({ id, name }));
  await gfetch(`${UPLOAD}/${id}?uploadType=media`, {
    method: 'PATCH',
    body: new Blob([JSON.stringify(clean)], { type: 'application/json' }),
  });
}

// ─── Ledger rows ───

export async function readLedgerRows(spreadsheetId) {
  const range = q(`${LEDGER_SHEET}!A2:E`);
  const data = await gfetch(`${SHEETS}/${spreadsheetId}/values/${range}`);
  return data.values || [];
}

export async function getSpreadsheetTitle(spreadsheetId) {
  const data = await gfetch(`${SHEETS}/${spreadsheetId}?fields=properties.title`);
  return data.properties?.title || null;
}

export function appendLedgerRow(spreadsheetId, record) {
  const range = q(`${LEDGER_SHEET}!A:E`);
  return gfetch(`${SHEETS}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: {
      values: [[
        record.timestamp,
        record.eventId,
        record.event_type,
        record.actor_identity,
        JSON.stringify(record.payload_json),
      ]],
    },
  });
}

// ─── Receipts ───

/** Uploads an image blob to the app folder and returns a URL that renders for anyone with the link. */
export async function uploadReceipt(blob, name) {
  const folderId = await getOrCreateRootFolder();
  const boundary = `ss-${crypto.randomUUID()}`;
  const meta = { name, parents: [folderId], mimeType: blob.type };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const file = await gfetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  await shareWithLink(file.id, 'reader');
  // The thumbnail endpoint avoids the tracking-protection blocks that hit drive.google.com/uc
  return `https://drive.google.com/thumbnail?id=${file.id}&sz=w1600`;
}
