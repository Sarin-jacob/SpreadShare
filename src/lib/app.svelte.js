// src/lib/app.svelte.js
// Global app state + orchestration of local cache (IndexedDB), outbound queue and Google APIs.
//
// Data flow:
//   write → IndexedDB events cache + outbound queue → UI updates instantly → queue pushes to Sheets
//   read  → IndexedDB cache shown immediately → full sheet read merged with still-pending local events
import { SvelteSet } from 'svelte/reactivity';
import { CONFIG } from './config.js';
import { AuthService, AuthRequiredError } from './auth.js';
import * as db from './db.js';
import * as google from './google.js';
import { dataUrlToBlob } from './image.js';
import { toast } from './toast.svelte.js';
import { syncPrefs, clearPrefs } from './prefs.svelte.js';
import { computeLedgerState } from './engine.js';
import { tagsOf } from './tags.js';

const PROFILE_KEY = 'ss_profile';
const DIRECTORY_KEY = 'ss_directory_cache';
const GROUP_SYNC_KEY = 'ss_group_synced_at';
const BACKGROUND_REFRESH_MS = 2 * 60 * 1000;
const SYNC_CONCURRENCY = 3;

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const app = $state({
  booted: false,
  user: null, // { email, name, picture }
  directory: [], // [{ id, name, unsynced? }]
  groupId: null,
  events: [], // raw events for the active group
  groupLoading: false,
  /** Bumped whenever the IndexedDB events cache changes; views that read the cache depend on it. */
  cacheVersion: 0,
  /** groupId → timestamp of the last successful download from Sheets */
  groupSyncedAt: readJson(GROUP_SYNC_KEY, {}),
  sync: {
    online: navigator.onLine,
    busy: 0,
    authExpired: false, // no usable Google token right now; changes wait in the queue
    needsSignIn: false, // a silent refresh failed: only the Reconnect button can help
    reconnecting: false, // silent refresh in progress
    error: null,
    lastSyncedAt: null,
    progress: null, // { done, total } while refreshing all groups
  },
});

const bumpCache = () => app.cacheVersion++;

/** eventIds that exist locally but haven't reached Google Sheets yet. */
export const pendingIds = new SvelteSet();

const isAuthError = (e) => e instanceof AuthRequiredError;

async function track(fn) {
  app.sync.busy++;
  try {
    return await fn();
  } finally {
    app.sync.busy--;
  }
}

function handleError(err, context) {
  if (isAuthError(err)) {
    app.sync.authExpired = true;
    if (err.needsUser) app.sync.needsSignIn = true;
    return;
  }
  if (!navigator.onLine) return; // offline: the queue will retry
  console.error(context, err);
  app.sync.error = `${context}: ${err.message}`;
}

// ─── Boot & session ───

export async function boot() {
  await db.openDatabase();
  await refreshPending();

  const profile = readJson(PROFILE_KEY, null);
  if (profile) {
    setUser(profile);
    app.directory = readJson(DIRECTORY_KEY, []);
  }

  // Show local data right away. Google's sign-in script loads in the background; only signing
  // in (or refreshing an expired token) needs it, and those wait for it themselves.
  AuthService.init(CONFIG.GOOGLE_CLIENT_ID).catch((e) => console.warn(e.message));

  app.booted = true;

  if (profile) {
    if (AuthService.cachedToken()) {
      onConnected();
    } else {
      // Expired since last time (tokens last an hour). Local data is usable right away; the next
      // tap gets a new token without any prompt (see refreshOnInteraction).
      app.sync.authExpired = true;
    }
  }
  window.addEventListener('click', refreshOnInteraction, true);
  window.addEventListener('keydown', refreshOnInteraction, true);

  window.addEventListener('online', () => {
    app.sync.online = true;
    syncAll();
  });
  window.addEventListener('offline', () => (app.sync.online = false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncAll({ staleOnly: true });
  });
  setInterval(() => processQueue(), 20_000);
}

function setUser(profile) {
  const user = { email: profile.email, name: profile.name, picture: profile.picture };
  app.user = user;
  google.setEmailHint(user.email);
  writeJson(PROFILE_KEY, user);
}

// Refresh the token when it has expired or is about to, on a tap or key press: the only moment
// the browser lets Google's (self-closing) popup open. Keeps the session going without prompts.
const REFRESH_AHEAD_MS = 10 * 60_000;
let lastRefreshAttempt = 0;

function refreshOnInteraction(e) {
  if (e.target?.closest?.('[data-auth-action]')) return; // sign-in buttons do their own request
  if (AuthService.expiresIn() > REFRESH_AHEAD_MS || Date.now() - lastRefreshAttempt < 30_000) return;
  refreshSession();
}

/** Silent token refresh. Call only from a user gesture handler. Resolves true when connected. */
export async function refreshSession() {
  if (!app.user || !navigator.onLine || app.sync.reconnecting || app.sync.needsSignIn) return !app.sync.authExpired;
  lastRefreshAttempt = Date.now();
  const wasExpired = app.sync.authExpired;
  app.sync.reconnecting = true;
  try {
    await AuthService.refreshSilently(app.user.email);
    app.sync.authExpired = false;
    app.sync.needsSignIn = false;
    app.sync.reconnecting = false; // the sync below shows its own progress
    if (wasExpired) await onConnected();
    return true;
  } catch (err) {
    console.warn('Silent Google sign-in failed', err?.message);
    if (AuthService.expiresIn() <= 0) {
      app.sync.authExpired = true;
      app.sync.needsSignIn = true;
    }
    return !app.sync.authExpired;
  } finally {
    app.sync.reconnecting = false;
  }
}

/** Interactive sign-in (must run from a click). Also used for "Reconnect". */
export async function login() {
  const { profile } = await AuthService.login(app.user?.email);
  if (app.user && app.user.email !== profile.email) {
    // Different account on this device: drop the previous user's local data.
    await resetLocalData();
  }
  setUser(profile);
  app.sync.authExpired = false;
  app.sync.needsSignIn = false;
  app.sync.error = null;
  await onConnected();
}

async function onConnected() {
  await loadDirectory();
  syncPrefs();
  await handlePendingInvite();
  await syncAll();
}

export async function logout() {
  AuthService.logout();
  await resetLocalData();
  localStorage.removeItem(PROFILE_KEY);
  app.user = null;
  app.sync.authExpired = false;
  app.sync.needsSignIn = false;
  location.hash = '#/';
}

async function resetLocalData() {
  await db.clear(db.STORES.events);
  await db.clear(db.STORES.queue);
  clearPrefs();
  localStorage.removeItem(DIRECTORY_KEY);
  pendingIds.clear();
  localStorage.removeItem(GROUP_SYNC_KEY);
  app.groupSyncedAt = {};
  app.directory = [];
  app.events = [];
  app.groupId = null;
  bumpCache();
}

let syncAllRunning = null;

/**
 * Uploads pending entries, then downloads every group (active one first) so balances and
 * insights are complete even for groups never opened on this device.
 * @param staleOnly skip groups refreshed within the last couple of minutes
 */
export function syncAll({ staleOnly = false } = {}) {
  if (!app.user || app.sync.authExpired || !navigator.onLine) return Promise.resolve();
  syncAllRunning ??= (async () => {
    try {
      await processQueue();
      const now = Date.now();
      const ids = app.directory
        .map((g) => g.id)
        .filter((id) => !staleOnly || now - (app.groupSyncedAt[id] || 0) > BACKGROUND_REFRESH_MS)
        .sort((a, b) => (a === app.groupId ? -1 : b === app.groupId ? 1 : 0));
      if (!ids.length) return;

      app.sync.progress = { done: 0, total: ids.length };
      const queue = [...ids];
      const worker = async () => {
        while (queue.length && !app.sync.authExpired) {
          await syncGroup(queue.shift());
          app.sync.progress.done++;
        }
      };
      await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, ids.length) }, worker));
    } finally {
      app.sync.progress = null;
      syncAllRunning = null;
    }
  })();
  return syncAllRunning;
}

// ─── Group directory ───

function saveDirectory(list) {
  app.directory = list;
  writeJson(DIRECTORY_KEY, list);
}

export async function loadDirectory() {
  try {
    const remote = await track(() => google.readDirectory());
    // Keep groups joined/created while offline that never made it to Drive.
    const unsynced = app.directory.filter((g) => g.unsynced && !remote.some((r) => r.id === g.id));
    saveDirectory([...remote, ...unsynced]);
    if (unsynced.length) await pushDirectory();
  } catch (e) {
    handleError(e, 'Loading groups failed');
  }
}

async function pushDirectory() {
  try {
    await track(() => google.writeDirectory(app.directory));
    saveDirectory(app.directory.map(({ id, name }) => ({ id, name })));
  } catch (e) {
    saveDirectory(app.directory.map((g) => ({ ...g, unsynced: true })));
    handleError(e, 'Saving group list failed');
  }
}

export const groupName = (id) => app.directory.find((g) => g.id === id)?.name || 'Group';

export async function createGroup(name) {
  const id = await track(() => google.createGroupSpreadsheet(name));
  saveDirectory([...app.directory, { id, name }]);
  await pushDirectory();
  await appendEvent(id, 'MEMBER_JOINED', memberJoinedPayload());
  return id;
}

const memberJoinedPayload = () => ({
  member_email: app.user.email,
  member_name: app.user.name,
  member_picture: app.user.picture,
});

export async function joinGroup(id, name) {
  if (!app.directory.some((g) => g.id === id)) {
    saveDirectory([...app.directory, { id, name }]);
    await pushDirectory();
  }
  const cached = await db.getGroupEvents(id);
  const alreadyMember = cached.some((e) => e.event_type === 'MEMBER_JOINED' && e.payload_json?.member_email === app.user.email);
  if (!alreadyMember) await appendEvent(id, 'MEMBER_JOINED', memberJoinedPayload());
}

export async function removeGroup(id) {
  saveDirectory(app.directory.filter((g) => g.id !== id));
  await pushDirectory();
}

export async function renameGroupLocally(id, name) {
  saveDirectory(app.directory.map((g) => (g.id === id ? { ...g, name } : g)));
  await pushDirectory();
}

export async function inviteLink(id) {
  await track(() => google.shareWithLink(id, 'writer'));
  const url = new URL(location.href);
  url.hash = '';
  url.search = new URLSearchParams({ invite: id, name: groupName(id) }).toString();
  return url.toString();
}

// ─── Invites (?invite=<sheetId>&name=<groupName>) ───

let pendingInvite = null;

export function captureInvite() {
  const params = new URLSearchParams(location.search);
  const id = params.get('invite');
  if (!id) return;
  pendingInvite = { id, name: params.get('name') || 'Shared group' };
  history.replaceState(null, '', location.pathname + location.hash);
}

async function handlePendingInvite() {
  if (!pendingInvite || !app.user) return;
  const { id, name } = pendingInvite;
  pendingInvite = null;
  try {
    await joinGroup(id, name);
    toast(`Joined “${name}”`);
    location.hash = `#/g/${id}`;
  } catch (e) {
    handleError(e, 'Joining group failed');
  }
}

// ─── Active group ───

const LAST_GROUP_KEY = 'ss_last_group';

/** The group used most recently on this device (for shortcuts / quick add), if it still exists. */
export function lastGroupId() {
  const id = localStorage.getItem(LAST_GROUP_KEY);
  return app.directory.some((g) => g.id === id) ? id : null;
}

export async function openGroup(id) {
  if (app.groupId === id) return;
  app.groupId = id;
  try {
    localStorage.setItem(LAST_GROUP_KEY, id);
  } catch {}
  app.groupLoading = true;
  const cached = await db.getGroupEvents(id);
  if (app.groupId !== id) return;
  app.events = cached;
  app.groupLoading = cached.length === 0;
  await syncGroup(id);
  if (app.groupId === id) app.groupLoading = false;
}

function rowToEvent(spreadsheetId, row) {
  if (!row?.[1] || row[1] === 'event_id') return null;
  try {
    return {
      spreadsheetId,
      timestamp: row[0],
      eventId: row[1],
      event_type: row[2],
      actor_identity: row[3],
      payload_json: JSON.parse(row[4] || '{}'),
    };
  } catch {
    console.warn('Skipping unreadable ledger row', row);
    return null;
  }
}

/** Full read of the sheet, merged with local events that are still waiting in the queue. */
export async function syncGroup(id) {
  if (!navigator.onLine || app.sync.authExpired) return;
  try {
    const rows = await track(() => google.readLedgerRows(id));
    const remote = rows.map((r) => rowToEvent(id, r)).filter(Boolean);
    const remoteIds = new Set(remote.map((e) => e.eventId));

    const queued = (await db.getAll(db.STORES.queue))
      .filter((q) => q.spreadsheetId === id && !remoteIds.has(q.payload.eventId))
      .map((q) => q.payload);

    const merged = [...remote, ...queued];
    const keep = new Set(merged.map((e) => e.eventId));
    const cached = await db.getGroupEvents(id);
    const stale = cached.filter((e) => !keep.has(e.eventId)).map((e) => [id, e.eventId]);

    await db.putMany(db.STORES.events, remote);
    if (stale.length) await db.removeMany(db.STORES.events, stale);

    if (app.groupId === id) app.events = merged;
    app.sync.lastSyncedAt = Date.now();
    app.groupSyncedAt[id] = app.sync.lastSyncedAt;
    writeJson(GROUP_SYNC_KEY, app.groupSyncedAt);
    app.sync.error = null;
    bumpCache();
  } catch (e) {
    if (e instanceof google.GoogleApiError && (e.status === 403 || e.status === 404)) {
      app.sync.error = 'You no longer have access to this group’s sheet.';
      return;
    }
    handleError(e, 'Refreshing group failed');
  }
}

// ─── Writes ───

/**
 * Records an event locally and queues it for upload.
 * @param actor who the event is attributed to (defaults to the signed-in user)
 */
export async function appendEvent(spreadsheetId, eventType, payload, { actor } = {}) {
  const record = {
    spreadsheetId,
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: eventType,
    actor_identity: actor || app.user.email,
    payload_json: {
      ...payload,
      logged_by: app.user.email,
      actor_name: app.user.name,
      actor_picture: app.user.picture,
    },
  };

  await db.put(db.STORES.events, record);
  await db.put(db.STORES.queue, { action: 'APPEND_ROW', spreadsheetId, payload: record });
  pendingIds.add(record.eventId);
  if (app.groupId === spreadsheetId) app.events = [...app.events, record];
  bumpCache();

  processQueue();
  return record;
}

/** Re-adds a deleted entry as a new event (backwards compatible with older clients). */
export function restoreEvent(spreadsheetId, event) {
  // eslint-disable-next-line no-unused-vars
  const { logged_by, actor_name, actor_picture, ...payload } = event.payload_json || {};
  return appendEvent(spreadsheetId, event.event_type, payload, { actor: event.actor_identity });
}

async function refreshPending() {
  const items = await db.getAll(db.STORES.queue);
  pendingIds.clear();
  items.forEach((i) => pendingIds.add(i.payload.eventId));
  return items;
}

let queueRunning = false;

export async function processQueue() {
  if (queueRunning || !app.user || app.sync.authExpired || !navigator.onLine) return;
  queueRunning = true;
  let blocked = null;
  try {
    const items = (await refreshPending()).sort((a, b) => a.id - b.id);
    for (const item of items) {
      const record = item.payload;
      const receipt = record.payload_json.receipt_local_url;

      if (receipt?.startsWith('data:')) {
        const blob = await dataUrlToBlob(receipt);
        const ext = blob.type.split('/')[1] || 'jpg';
        record.payload_json.receipt_local_url = await track(() =>
          google.uploadReceipt(blob, `receipt_${record.eventId}.${ext}`)
        );
        // Persist the uploaded URL so a later failure doesn't re-upload the image.
        await db.put(db.STORES.queue, item);
        await db.put(db.STORES.events, record);
        if (app.groupId === record.spreadsheetId) {
          app.events = app.events.map((e) => (e.eventId === record.eventId ? record : e));
        }
      }

      try {
        await track(() => google.appendLedgerRow(item.spreadsheetId, record));
      } catch (e) {
        // Lost access to one sheet shouldn't block uploads for every other group.
        if (e instanceof google.GoogleApiError && (e.status === 403 || e.status === 404)) {
          blocked = `Can't write to “${groupName(item.spreadsheetId)}” (no access). Its entries stay on this device.`;
          continue;
        }
        throw e;
      }
      await db.remove(db.STORES.queue, item.id);
      pendingIds.delete(record.eventId);
    }
    app.sync.error = blocked;
  } catch (e) {
    handleError(e, 'Upload paused');
  } finally {
    queueRunning = false;
  }
}

// ─── Maintenance ───

/** Drops the local event cache (unsynced entries are kept) and re-downloads the active group. */
export async function rebuildCache() {
  const queued = new Set((await db.getAll(db.STORES.queue)).map((q) => q.payload.eventId));
  const all = await db.getAll(db.STORES.events);
  await db.removeMany(
    db.STORES.events,
    all.filter((e) => !queued.has(e.eventId)).map((e) => [e.spreadsheetId, e.eventId])
  );
  app.groupSyncedAt = {};
  localStorage.removeItem(GROUP_SYNC_KEY);
  bumpCache();
  await syncAll();
  toast('Local cache rebuilt');
}

/** Saves text as a file download. */
export function downloadFile(filename, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const fileSafe = (s) => String(s).replace(/[^\w-]+/g, '_');

/** The group's current entries (deleted and superseded versions left out), with notes and tags. */
export function exportCsv(spreadsheetId, events) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Type', 'Title', 'Category', 'Amount', 'Currency', 'Paid by', 'To / split between', 'Notes', 'Tags'].join(',')];
  const { expenses } = computeLedgerState(events);
  for (const x of [...expenses].reverse()) {
    const p = x.payload;
    const between = x.type === 'EXPENSE_ADD' ? (p.allocations || []).filter((a) => a.value > 0).map((a) => `${a.user} ${a.value}`).join('; ') : x.target;
    const paidBy = p.payers?.length ? p.payers.map((y) => `${y.user} ${y.value}`).join('; ') : x.payer;
    lines.push([new Date(x.timestamp).toISOString(), x.type, x.title, x.category, x.amount, p.currency || CONFIG.DEFAULT_CURRENCY, paidBy, between, p.notes, tagsOf(p).map((t) => `#${t}`).join(' ')].map(esc).join(','));
  }
  downloadFile(`${fileSafe(groupName(spreadsheetId))}_${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'));
}

// ─── Comments ───

export const addComment = (spreadsheetId, targetEventId, text) =>
  appendEvent(spreadsheetId, 'COMMENT', { target_event_id: targetEventId, text: text.trim().slice(0, 1000) });

/** Deleting reuses EXPENSE_DELETE on the comment's id (older app versions ignore comments anyway). */
export const deleteComment = (spreadsheetId, commentId) => appendEvent(spreadsheetId, 'EXPENSE_DELETE', { target_event_id: commentId });
