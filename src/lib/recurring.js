// src/lib/recurring.js
// Repeating expenses (rent, subscriptions, house help). An expense with
// payload.recurring = { every: 'week' | 'month', series, owner } is the template; each later
// period gets its own copy, created by the owner's device when it opens the group.
// Copies use a fixed event ID per period, and the ledger skips repeated IDs, so two devices (or
// a retry) creating the same month can't count it twice. A deleted copy stays skipped.
import { computeLedgerState, eventIdOf } from './engine.js';

export const REPEATS = [
  { value: null, label: 'Never' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

const MAX_CATCH_UP = 12; // a device that was away for a long time adds at most a year of copies

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The k-th repeat after `start` (local time); monthly repeats clamp to the month's last day. */
export function nthOccurrence(start, every, k) {
  const s = new Date(start);
  if (every === 'week') return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7 * k, s.getHours(), s.getMinutes());
  const first = new Date(s.getFullYear(), s.getMonth() + k, 1, s.getHours(), s.getMinutes());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  first.setDate(Math.min(s.getDate(), last));
  return first;
}

/** Stable key of the period an occurrence falls in: "2026-10" (monthly) or its date (weekly). */
export const periodKey = (date, every) => (every === 'week' ? ymd(date) : ymd(date).slice(0, 7));

export const occurrenceId = (series, period) => `rec-${series}-${period}`;

/** Next date the template repeats after `now`. */
export function nextOccurrence(start, every, now = new Date()) {
  for (let k = 1; k < 1000; k++) {
    const d = nthOccurrence(start, every, k);
    if (d > now) return d;
  }
  return null;
}

// Fields that belong to the template only, or to one particular bill.
const TEMPLATE_ONLY = ['recurring', 'replaces', 'logged_by', 'actor_name', 'actor_picture', 'receipt_local_url', 'receipt_scan', 'notes'];

/**
 * Copies that are due and don't exist yet, for templates owned by `me`.
 * @param events the group's raw events
 * @returns [{ eventId, actor, payload }] ready for appendEvent
 */
export function dueOccurrences(events, me, now = new Date()) {
  const existing = new Set(events.map(eventIdOf));
  const out = [];
  for (const x of computeLedgerState(events).expenses) {
    const r = x.payload.recurring;
    if (x.type !== 'EXPENSE_ADD' || !r?.series || r.owner !== me || !['week', 'month'].includes(r.every)) continue;
    const start = new Date(x.timestamp);
    if (Number.isNaN(start.getTime())) continue;
    const firstPeriod = periodKey(start, r.every);
    for (let k = 1, added = 0; added < MAX_CATCH_UP; k++) {
      const when = nthOccurrence(start, r.every, k);
      if (when > now) break;
      const period = periodKey(when, r.every);
      if (period === firstPeriod) continue;
      const eventId = occurrenceId(r.series, period);
      if (existing.has(eventId)) continue;
      const payload = Object.fromEntries(Object.entries(x.payload).filter(([k]) => !TEMPLATE_ONLY.includes(k)));
      out.push({
        eventId,
        actor: x.payer,
        payload: { ...payload, custom_timestamp: when.toISOString(), recurring_from: r.series, period, recurring_every: r.every },
      });
      existing.add(eventId);
      added++;
    }
  }
  return out;
}

/**
 * Recurring expenses due within `days` across groups, soonest first.
 * @param groups { [groupId]: events }
 * @returns [{ groupId, title, amount, when: Date, every, currency }]
 */
export function upcomingRecurring(groups, { now = new Date(), days = 7 } = {}) {
  const until = new Date(now.getTime() + days * 86_400_000);
  const out = [];
  for (const [groupId, events] of Object.entries(groups)) {
    const L = computeLedgerState(events);
    for (const x of L.expenses) {
      const r = x.payload.recurring;
      if (x.type !== 'EXPENSE_ADD' || !r?.every) continue;
      const when = nextOccurrence(x.timestamp, r.every, now);
      if (when && when <= until) out.push({ groupId, title: x.title, amount: x.amount, when, every: r.every, currency: L.currency });
    }
  }
  return out.sort((a, b) => a.when - b.when);
}
