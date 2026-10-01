// src/lib/cache.svelte.js
// Read model over *all* cached groups (Groups list, global Insights). Re-reads IndexedDB
// whenever app.cacheVersion changes, sharing one read between every view that asks.
import { app } from './app.svelte.js';
import { getAll, STORES } from './db.js';
import { computeLedgerState } from './engine.js';

let pending = null;
let pendingVersion = -1;

export function loadAllEvents() {
  if (pendingVersion !== app.cacheVersion) {
    pendingVersion = app.cacheVersion;
    pending = getAll(STORES.events);
  }
  return pending;
}

export function eventsByGroup(events) {
  const out = {};
  for (const e of events) (out[e.spreadsheetId] ??= []).push(e);
  return out;
}

/** groupId → { net, lastActivity, count } for the signed-in user. */
export function summarizeGroups(events, email) {
  const out = {};
  for (const [id, list] of Object.entries(eventsByGroup(events))) {
    const state = computeLedgerState(list);
    out[id] = {
      net: state.members[email]?.netBalance ?? 0,
      lastActivity: state.expenses[0]?.timestamp ?? null,
      count: state.expenses.length,
    };
  }
  return out;
}
