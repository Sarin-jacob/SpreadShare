// src/lib/split.js
// Pure split maths used by the expense form. All results are in whole cents.
import { evaluate, round2 } from './math.js';
import { money } from './format.js';

const sum = (values) => values.reduce((s, v) => s + v, 0);

/**
 * Splits `total` proportionally to `weights`, in whole cents. Leftover cents go to the
 * largest fractional parts, so the result always adds up to exactly `total`.
 * @returns {Record<string, number> | null} null when every weight is zero
 */
export function distribute(total, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const sumW = sum(entries.map(([, w]) => w));
  if (!sumW) return null;
  const cents = Math.round(total * 100);
  const parts = entries.map(([user, w]) => {
    const raw = (cents * w) / sumW;
    return { user, cents: Math.floor(raw), frac: raw - Math.floor(raw) };
  });
  let left = cents - sum(parts.map((x) => x.cents));
  [...parts].sort((a, b) => b.frac - a.frac).forEach((x) => {
    if (left-- > 0) x.cents++;
  });
  return Object.fromEntries(parts.map((x) => [x.user, x.cents / 100]));
}

/**
 * Exact amounts per person, where a single blank field receives the remainder.
 * @param inputs member → raw input string (may contain arithmetic)
 * @returns {{ vals?: Record<string,number>, auto?: string|null, error?: string }}
 */
export function exactWithRemainder(total, inputs, members, nameOf = (m) => m) {
  const vals = {};
  const blanks = [];
  for (const m of members) {
    const raw = (inputs[m] ?? '').trim();
    if (!raw) {
      blanks.push(m);
      continue;
    }
    const v = evaluate(raw);
    if (v === null) return { error: `Check the amount for ${nameOf(m)}` };
    vals[m] = round2(v);
  }
  const entered = round2(sum(Object.values(vals)));
  let auto = null;
  if (blanks.length === 1 && entered <= total) {
    auto = blanks[0];
    vals[auto] = round2(total - entered);
  }
  const final = round2(sum(Object.values(vals)));
  if (Math.abs(final - total) > 0.009) {
    const diff = round2(total - final);
    return { vals, auto, error: diff > 0 ? `${money(diff)} left to assign` : `Over by ${money(-diff)}` };
  }
  return { vals, auto };
}

/**
 * Item-wise split: each item is shared equally by the people who had it, then the bill
 * total (tax, service, discounts, rounding included) is spread in proportion to each
 * person's item subtotal.
 * @param items [{ name, amount: string|number, members: string[] }]
 * @returns {{ alloc: Record<string,number>, itemsTotal?: number, extras?: number, error?: string }}
 */
export function splitByItems(total, items, nameOf = (m) => m) {
  if (!items.length) return { alloc: {}, error: 'Add at least one item' };
  const perMember = {};
  for (const [i, it] of items.entries()) {
    const label = it.name?.trim() || `item ${i + 1}`;
    const v = typeof it.amount === 'number' ? it.amount : evaluate(it.amount);
    if (v === null) return { alloc: {}, error: `Check the price of ${label}` };
    if (!it.members?.length) return { alloc: {}, error: `Pick who had ${label}` };
    const parts = distribute(Math.abs(v), Object.fromEntries(it.members.map((m) => [m, 1]))) || {};
    for (const [m, share] of Object.entries(parts)) perMember[m] = round2((perMember[m] || 0) + Math.sign(v) * share);
  }
  const itemsTotal = round2(sum(Object.values(perMember)));
  if (!(itemsTotal > 0)) return { alloc: {}, error: 'Items add up to zero' };
  const negative = Object.entries(perMember).find(([, v]) => v < -0.009);
  if (negative) return { alloc: {}, error: `${nameOf(negative[0])}'s items come to less than zero` };
  const alloc = distribute(total, perMember) || {};
  return { alloc, itemsTotal, extras: round2(total - itemsTotal) };
}

/**
 * Computes allocations for one of the split strategies.
 * @param strategy 'EQUALLY' | 'SHARES' | 'EXACT' | 'ADJUSTMENT' | 'ITEMS'
 * @param opts.excluded member → true when left out of an equal split
 * @param opts.inputs member → raw input string (shares / amounts / adjustments)
 * @param opts.items receipt items for 'ITEMS' (see splitByItems)
 * @returns {{ alloc: Record<string,number>, auto?: string|null, error?: string, itemsTotal?: number, extras?: number }}
 */
export function computeSplit(strategy, total, members, { excluded = {}, inputs = {}, items = [], nameOf = (m) => m } = {}) {
  if (strategy === 'ITEMS') return splitByItems(total, items, nameOf);

  if (strategy === 'EQUALLY') {
    const inSplit = members.filter((m) => !excluded[m]);
    if (!inSplit.length) return { alloc: {}, error: 'Pick at least one person' };
    return { alloc: distribute(total, Object.fromEntries(inSplit.map((m) => [m, 1]))) || {} };
  }

  if (strategy === 'SHARES') {
    const w = {};
    for (const m of members) {
      const raw = (inputs[m] ?? '').trim();
      const v = raw === '' ? 1 : evaluate(raw);
      if (v === null || v < 0) return { alloc: {}, error: `Check the shares for ${nameOf(m)}` };
      w[m] = v;
    }
    const alloc = distribute(total, w);
    return alloc ? { alloc } : { alloc: {}, error: 'Shares add up to zero' };
  }

  if (strategy === 'EXACT') {
    const r = exactWithRemainder(total, inputs, members, nameOf);
    return { alloc: r.vals || {}, auto: r.auto, error: r.error };
  }

  // ADJUSTMENT: equal split of whatever is left after each person's +/- adjustment
  const adj = {};
  for (const m of members) {
    const raw = (inputs[m] ?? '').trim();
    const v = raw === '' ? 0 : evaluate(raw);
    if (v === null) return { alloc: {}, error: `Check the adjustment for ${nameOf(m)}` };
    adj[m] = v;
  }
  const base = (total - sum(Object.values(adj))) / members.length;
  const raw = Object.fromEntries(members.map((m) => [m, base + adj[m]]));
  if (Object.values(raw).some((v) => v < -0.009)) return { alloc: raw, error: 'Adjustments exceed the total' };
  return { alloc: distribute(total, raw) || {} };
}
