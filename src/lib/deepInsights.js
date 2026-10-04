// src/lib/deepInsights.js
// More insights from your share of every expense across groups: month vs last month, forecast,
// six-month trend by category, top places, biggest expenses, who you share with, what you
// covered for others, a daily calendar and recurring commitments. Pure.
import { computeLedgerState } from './engine.js';
import { memberEffect, monthKey } from './statement.js';
import { splitTags } from './tags.js';
import { round2 } from './math.js';

const DAY = 86_400_000;
const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/**
 * Your expenses across groups: one row per expense with your share and what you paid.
 * @param groups { [groupId]: events } (groups in one currency)
 * @returns [{ groupId, x, date: Date, share, paid }] newest first
 */
export function myExpenses(groups, me) {
  const out = [];
  for (const [groupId, events] of Object.entries(groups)) {
    for (const x of computeLedgerState(events).expenses) {
      if (x.type !== 'EXPENSE_ADD') continue;
      const { share, paid } = memberEffect(x, me);
      if (share <= 0 && paid <= 0) continue;
      out.push({ groupId, x, date: new Date(x.timestamp), share, paid });
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

const sumShare = (rows) => round2(rows.reduce((s, r) => s + r.share, 0));

/**
 * This month so far vs last month (up to the same day, and in full), with a pace forecast.
 * @returns {{ soFar, lastSamePoint, lastFull, change: number|null, forecast, day, days, categories: [{ category, now, before, delta }] }}
 */
export function monthCompare(rows, now = new Date()) {
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const day = now.getDate();
  const samePoint = new Date(startLast.getFullYear(), startLast.getMonth(), Math.min(day, daysInMonth(startLast)), 23, 59, 59);
  const thisRows = rows.filter((r) => r.date >= startThis && r.date <= now);
  const lastRows = rows.filter((r) => r.date >= startLast && r.date < startThis);
  const soFar = sumShare(thisRows);
  const lastSamePoint = sumShare(lastRows.filter((r) => r.date <= samePoint));
  const lastFull = sumShare(lastRows);
  const byCat = (list) => list.reduce((m, r) => m.set(r.x.category, (m.get(r.x.category) || 0) + r.share), new Map());
  const a = byCat(thisRows);
  const b = byCat(lastRows.filter((r) => r.date <= samePoint));
  const categories = [...new Set([...a.keys(), ...b.keys()])]
    .map((category) => ({ category, now: round2(a.get(category) || 0), before: round2(b.get(category) || 0) }))
    .map((c) => ({ ...c, delta: round2(c.now - c.before) }))
    .sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
  return {
    soFar,
    lastSamePoint,
    lastFull,
    change: lastSamePoint > 0 ? (soFar - lastSamePoint) / lastSamePoint : null,
    // Straight-line pace; only meaningful once a few days have passed.
    forecast: day >= 3 ? round2((soFar / day) * daysInMonth(now)) : null,
    day,
    days: daysInMonth(now),
    categories,
  };
}

/** Last `months` months (oldest first) with totals and per-category amounts. */
export function monthlyTrend(rows, { months = 6, now = new Date() } = {}) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ month: monthKey(d), label: d.toLocaleDateString(undefined, { month: 'short' }), total: 0, byCategory: {} });
  }
  const index = new Map(out.map((m, i) => [m.month, i]));
  for (const r of rows) {
    const i = index.get(monthKey(r.date));
    if (i == null) continue;
    const m = out[i];
    m.total = round2(m.total + r.share);
    m.byCategory[r.x.category] = round2((m.byCategory[r.x.category] || 0) + r.share);
  }
  return out;
}

const placeKey = (r) => {
  const merchant = r.x.payload.receipt_scan?.merchant;
  const name = (merchant || splitTags(r.x.title).text || '').trim();
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').slice(0, 3).join(' ');
};

/** Where your money goes: shops / titles with the most spent (your share). */
export function topPlaces(rows, { limit = 5 } = {}) {
  const m = new Map();
  for (const r of rows) {
    const key = placeKey(r);
    if (!key) continue;
    const p = m.get(key) ?? { name: r.x.payload.receipt_scan?.merchant || splitTags(r.x.title).text, total: 0, count: 0, category: r.x.category };
    p.total = round2(p.total + r.share);
    p.count++;
    m.set(key, p);
  }
  return [...m.values()].filter((p) => p.total > 0).sort((a, b) => b.total - a.total).slice(0, limit);
}

export const biggest = (rows, { limit = 5 } = {}) => [...rows].filter((r) => r.share > 0).sort((a, b) => b.share - a.share).slice(0, limit);

/** People you split with most: shared expenses and your share of them. */
export function sharedWith(rows, me, { limit = 5 } = {}) {
  const m = new Map();
  for (const r of rows) {
    const others = new Set((r.x.payload.allocations || []).filter((a) => a.user !== me && parseFloat(a.value) > 0).map((a) => a.user));
    for (const o of others) {
      const p = m.get(o) ?? { member: o, groupId: r.groupId, count: 0, together: 0 };
      p.count++;
      p.together = round2(p.together + r.share);
      m.set(o, p);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.together - a.together).slice(0, limit);
}

/** What you paid vs your share: the difference is what you covered for others. */
export function covered(rows) {
  const paid = round2(rows.reduce((s, r) => s + r.paid, 0));
  const share = sumShare(rows);
  return { paid, share, covered: round2(paid - share) };
}

/** Your share per day of a month, for a calendar heatmap. */
export function monthCalendar(rows, now = new Date()) {
  const days = daysInMonth(now);
  const values = Array(days).fill(0);
  for (const r of rows) {
    if (r.date.getFullYear() !== now.getFullYear() || r.date.getMonth() !== now.getMonth()) continue;
    values[r.date.getDate() - 1] = round2(values[r.date.getDate() - 1] + r.share);
  }
  // Monday-first offset of the 1st, so the grid lines up with weekdays.
  const offset = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7;
  return { values, offset, max: Math.max(0, ...values), today: now.getDate() };
}

/** Recurring expenses you're part of, as a monthly amount (weekly ones × 52 / 12). */
export function recurringPerMonth(rows) {
  const items = rows
    .filter((r) => r.x.payload.recurring?.every && r.share > 0)
    .map((r) => ({ title: splitTags(r.x.title).text, every: r.x.payload.recurring.every, share: r.share, monthly: round2(r.x.payload.recurring.every === 'week' ? (r.share * 52) / 12 : r.share), groupId: r.groupId }));
  return { items, total: round2(items.reduce((s, i) => s + i.monthly, 0)) };
}

/** Rows within the last `days` days (0 = all time). */
export const withinDays = (rows, days, now = new Date()) => (days > 0 ? rows.filter((r) => r.date >= new Date(now.getTime() - days * DAY)) : rows);
