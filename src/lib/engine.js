// src/lib/engine.js
// Rebuilds group state (balances, feed, member profiles) from the raw event log.
import { round2 } from './math.js';
import { mergeMap, remapPayload } from './members.js';

const PROFILE_CACHE_KEY = 'ss_profile_cache';
let profileCache = {};
try {
  profileCache = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || '{}');
} catch {
  profileCache = {};
}

export const parsePayload = (e) =>
  typeof e.payload_json === 'string' ? JSON.parse(e.payload_json || '{}') : e.payload_json || {};

export const eventIdOf = (e) => e.eventId || e.event_id;

export function displayName(email, profiles, selfEmail) {
  if (!email) return 'Unknown';
  if (email === selfEmail) return 'You';
  return profiles?.[email]?.name || (email.startsWith('guest:') ? 'Guest' : email.split('@')[0]);
}

/** IDs of events that were deleted (or superseded by an edit). */
export function deletedIds(events) {
  const ids = new Set();
  for (const e of events) {
    if (e.event_type !== 'EXPENSE_DELETE') continue;
    try {
      ids.add(parsePayload(e).target_event_id);
    } catch {}
  }
  return ids;
}

export function computeLedgerState(rawEvents) {
  // currency: the group's own currency (GROUP_SETTINGS), null = the app default
  // presets: saved splits for the group ([{ id, name, strategy, members?, inputs? }])
  // budget: the group's shared budget ({ amount, period: 'total' | 'month' }) or null
  const state = { totalSpent: 0, members: {}, expenses: [], profiles: {}, currency: null, presets: [], budget: null };
  let sawMoney = false;
  const seen = new Set();
  let cacheDirty = false;

  const discover = (email, name, picture) => {
    if (!email) return;
    state.members[email] ??= { paid: 0, owes: 0, netBalance: 0 };
    state.profiles[email] ??= { ...(profileCache[email] || { name: email.split('@')[0], picture: null }) };
    const p = state.profiles[email];
    let changed = false;
    if (name && p.name !== name) { p.name = name; changed = true; }
    if (picture && p.picture !== picture) { p.picture = picture; changed = true; }
    if (changed) {
      profileCache[email] = { ...p };
      cacheDirty = true;
    }
  };

  const events = [...rawEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const deleted = deletedIds(events);
  // Guests later linked to a Google account: their entries count as that account's.
  const alias = mergeMap(events, deleted);
  const merged = Object.keys(alias).length > 0;
  const A = (u) => alias[u] || u;

  for (const event of events) {
    const id = eventIdOf(event);
    const type = event.event_type;
    if (seen.has(id) || deleted.has(id) || type === 'EXPENSE_DELETE') continue;
    seen.add(id);

    let payload;
    try {
      payload = parsePayload(event);
    } catch {
      continue; // skip a corrupt row rather than break the whole group
    }
    if (merged) payload = remapPayload(payload, A);
    const actor = A(event.actor_identity);

    // actor_name/picture describe whoever *logged* the event. For transfers/loans logged on
    // someone else's behalf the actor differs, so only trust the name when they match.
    const loggedBy = payload.logged_by;
    const nameIsActors = loggedBy ? loggedBy === actor : type !== 'TRANSFER' && type !== 'LOAN';
    discover(actor, nameIsActors ? payload.actor_name : null, nameIsActors ? payload.actor_picture : null);
    if (loggedBy && loggedBy !== actor) discover(loggedBy, payload.actor_name, payload.actor_picture);

    if (type === 'MEMBER_JOINED') {
      if (alias[payload.member_email]) {
        discover(alias[payload.member_email]); // a linked guest: keep the account's own name
      } else {
        discover(payload.member_email, payload.member_name, payload.member_picture);
        if (payload.guest) state.profiles[payload.member_email].guest = true;
      }
      continue;
    }
    if (type === 'MEMBER_MERGED') continue;
    if (type === 'SPLIT_PRESET') {
      if (!payload.name || !['EQUALLY', 'SHARES'].includes(payload.strategy)) continue;
      state.presets.push({
        id,
        name: String(payload.name).slice(0, 40),
        strategy: payload.strategy,
        members: (payload.members || []).map(A),
        inputs: Object.fromEntries(Object.entries(payload.inputs || {}).map(([k, v]) => [A(k), String(v)])),
      });
      continue;
    }
    if (type === 'GROUP_SETTINGS') {
      // Amounts are stored in the group's currency, so it can only change before the first entry.
      if (payload.currency && !sawMoney) state.currency = String(payload.currency).toUpperCase();
      // The budget can change any time; the latest setting wins (0 / null removes it).
      if ('budget' in payload) {
        const amount = Number(payload.budget);
        state.budget = amount > 0 ? { amount: round2(amount), period: payload.budget_period === 'month' ? 'month' : 'total' } : null;
      }
      continue;
    }
    if (type === 'PROFILE') {
      // A member's own details for the group (UPI ID). The latest one wins.
      state.profiles[actor].upi = payload.upi_id ? String(payload.upi_id).trim().toLowerCase() : null;
      continue;
    }

    const amount = round2(parseFloat(payload.evaluated_amount) || 0);
    if (type === 'EXPENSE_ADD' || type === 'TRANSFER' || type === 'LOAN') sawMoney = true;
    const target = payload.target_peer_identity || '';
    if (target) discover(target);

    if (type === 'EXPENSE_ADD') {
      state.totalSpent = round2(state.totalSpent + amount);
      if (payload.payers?.length) {
        for (const p of payload.payers) {
          discover(p.user);
          state.members[p.user].paid += parseFloat(p.value) || 0;
        }
      } else {
        state.members[actor].paid += amount;
      }
      for (const a of payload.allocations || []) {
        discover(a.user);
        state.members[a.user].owes += parseFloat(a.value) || 0;
      }
    } else if (type === 'TRANSFER') {
      if (!target) continue;
      state.members[actor].paid += amount;
      state.members[target].owes += amount;
    } else if (type === 'LOAN') {
      if (!target) continue;
      let owed = amount;
      if (payload.interest_type === 'SIMPLE' && payload.interest_rate > 0) {
        owed = amount + amount * (payload.interest_rate / 100);
      }
      state.members[actor].paid += round2(owed);
      state.members[target].owes += round2(owed);
    } else {
      continue;
    }

    state.expenses.push({
      eventId: id,
      title: payload.title || 'Untitled',
      type,
      category: payload.category || 'General',
      amount,
      payer: actor,
      target,
      timestamp: payload.custom_timestamp || event.timestamp,
      receiptUrl: payload.receipt_local_url || null,
      payload,
      event,
    });
  }

  for (const m of Object.values(state.members)) {
    m.paid = round2(m.paid);
    m.owes = round2(m.owes);
    m.netBalance = round2(m.paid - m.owes);
  }

  state.expenses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (cacheDirty) {
    try {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profileCache));
    } catch {}
  }
  return state;
}

/** Greedy settle-up: fewest transfers to bring every balance to zero. */
export function optimizeDebts(membersMap) {
  const debtors = [];
  const creditors = [];
  for (const [email, d] of Object.entries(membersMap)) {
    if (d.netBalance < -0.01) debtors.push({ email, amount: -d.netBalance });
    else if (d.netBalance > 0.01) creditors.push({ email, amount: d.netBalance });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amount, creditors[j].amount);
    settlements.push({ from: debtors[i].email, to: creditors[j].email, amount: round2(amt) });
    debtors[i].amount = round2(debtors[i].amount - amt);
    creditors[j].amount = round2(creditors[j].amount - amt);
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return settlements;
}
