// src/lib/prefs.svelte.js
// Personal preferences that should follow you across devices (currently: budgets).
// Kept in localStorage for instant, offline reads and mirrored to `.spreadshare_prefs.json` in
// your Drive. Conflicts resolve by most recent change.
import * as google from './google.js';

const KEY = 'ss_prefs';
const FILE = '.spreadshare_prefs.json';

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

const initial = readLocal() ?? { budgets: {}, updatedAt: 0 };

export const prefs = $state({
  /** { [category]: monthly limit, '*': overall monthly limit } */
  budgets: initial.budgets || {},
  updatedAt: initial.updatedAt || 0,
  syncing: false,
});

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ budgets: $state.snapshot(prefs.budgets), updatedAt: prefs.updatedAt }));
  } catch {}
}

/** Sets (or clears, with 0 / empty) a monthly budget. category '*' = overall. */
export function setBudget(category, limit) {
  const n = Number(limit);
  if (n > 0) prefs.budgets[category] = Math.round(n * 100) / 100;
  else delete prefs.budgets[category];
  prefs.updatedAt = Date.now();
  saveLocal();
  pushPrefs();
}

let pushTimer = null;
function pushPrefs() {
  clearTimeout(pushTimer);
  // Batch rapid edits (typing several budgets) into one Drive write.
  pushTimer = setTimeout(async () => {
    if (!navigator.onLine) return;
    try {
      await google.writeJsonFile(FILE, { budgets: $state.snapshot(prefs.budgets), updatedAt: prefs.updatedAt });
    } catch (e) {
      console.warn('Saving preferences to Drive failed (kept on this device)', e);
    }
  }, 1500);
}

/** Pulls preferences from Drive; the newer copy wins. Called when the app connects. */
export async function syncPrefs() {
  if (prefs.syncing || !navigator.onLine) return;
  prefs.syncing = true;
  try {
    const remote = await google.readJsonFile(FILE);
    if (remote && (remote.updatedAt || 0) > prefs.updatedAt) {
      prefs.budgets = remote.budgets || {};
      prefs.updatedAt = remote.updatedAt;
      saveLocal();
    } else if (prefs.updatedAt > (remote?.updatedAt || 0)) {
      pushPrefs();
    }
  } catch (e) {
    console.warn('Loading preferences from Drive failed', e);
  } finally {
    prefs.syncing = false;
  }
}

export function clearPrefs() {
  prefs.budgets = {};
  prefs.updatedAt = 0;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
