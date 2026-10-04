// src/lib/cache.svelte.js
// Read model over *all* cached groups (Groups list, global Insights). Re-reads IndexedDB
// whenever app.cacheVersion changes, sharing one read between every view that asks.
import { app } from './app.svelte.js';
import { getAll, STORES } from './db.js';
import { computeLedgerState } from './engine.js';
import { CONFIG } from './config.js';

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

/** groupId → the group's currency (GROUP_SETTINGS), defaulting to the app currency. */
export function currencyByGroup(events) {
  const out = {};
  for (const [id, list] of Object.entries(eventsByGroup(events))) out[id] = computeLedgerState(list).currency || CONFIG.DEFAULT_CURRENCY;
  return out;
}

/**
 * Events of the groups kept in `currency` (default: the app currency). Totals across groups
 * (Insights, budgets) only add up amounts in one currency.
 */
export function inCurrency(events, currency = CONFIG.DEFAULT_CURRENCY) {
  const cur = currencyByGroup(events);
  return events.filter((e) => cur[e.spreadsheetId] === currency);
}

/** groupId → { currency, net, lastActivity, count } for the signed-in user. */
export function summarizeGroups(events, email) {
  const out = {};
  for (const [id, list] of Object.entries(eventsByGroup(events))) {
    const state = computeLedgerState(list);
    out[id] = {
      currency: state.currency || CONFIG.DEFAULT_CURRENCY,
      net: state.members[email]?.netBalance ?? 0,
      lastActivity: state.expenses[0]?.timestamp ?? null,
      count: state.expenses.length,
    };
  }
  return out;
}
