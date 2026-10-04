// src/lib/csvImport.js
// CSV imports: Splitwise group exports (one column per person with their net for each row) and
// generic expense / bank CSVs (date, description, amount or debit + credit). Pure.
import { findDate } from './txnList.js';

/** RFC 4180-ish: quoted fields, "" escapes, commas / newlines inside quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some(Boolean));
}

const num = (s) => {
  const t = String(s ?? '').replace(/[₹$€£,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
  return parseFloat(t);
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

const SW_FIXED = ['date', 'description', 'category', 'cost', 'currency'];

/** Splitwise export: Date, Description, Category, Cost, Currency, then a column per person. */
export const isSplitwise = (header) => header.length > 5 && SW_FIXED.every((h, i) => norm(header[i]) === h);

// Splitwise's categories → ours.
const SW_CATEGORY = {
  Food: /dining|food|restaurant|liquor|drinks/i,
  Groceries: /groceries/i,
  Travel: /taxi|gas|fuel|parking|bus|train|plane|car|bicycle|transportation/i,
  Stay: /rent|mortgage|hotel|lodging/i,
  Utilities: /electricity|water|heat|tv|phone|internet|utilities|cleaning|trash|maintenance/i,
  Entertainment: /movies|games|music|sports|entertainment/i,
  Shopping: /clothing|electronics|household|furniture|gifts|pets|home/i,
  Health: /medical|insurance|health/i,
};
export function splitwiseCategory(c) {
  for (const [value, re] of Object.entries(SW_CATEGORY)) if (re.test(c || '')) return value;
  return null;
}

/**
 * @returns {{ people: string[], entries: Array<{ date: Date|null, title, category, cost, currency,
 *   nets: Record<string, number>, kind: 'expense'|'payment' }> }}
 */
export function readSplitwise(rows, { now = new Date() } = {}) {
  const [header, ...body] = rows;
  const people = header.slice(5);
  const entries = [];
  for (const r of body) {
    if (/total balance/i.test(r[1] || '') || !r[0]) continue;
    const cost = num(r[3]);
    if (!(cost > 0)) continue;
    const nets = {};
    people.forEach((p, i) => {
      const v = num(r[5 + i]);
      if (v && Math.abs(v) >= 0.005) nets[p] = v;
    });
    if (!Object.keys(nets).length) continue;
    entries.push({
      date: findDate(r[0], now)?.date ?? null,
      title: r[1] || 'Expense',
      category: r[2] || '',
      cost,
      currency: (r[4] || '').toUpperCase() || null,
      nets,
      kind: /^payment$/i.test(r[2] || '') || /\bpaid\b/i.test(r[1] || '') && Object.keys(nets).length === 2 ? 'payment' : 'expense',
    });
  }
  return { people, entries };
}

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Who paid and each share, from Splitwise's per-person nets (paid − share). One payer is the
 * common case and is rebuilt exactly: the payer is whoever is most in credit, and their share is
 * cost − their net. Several payers can't be told apart from nets, so each person in credit
 * "paid" their net and each person in debit owes theirs (balances still come out the same).
 * @param who maps a Splitwise name to a member ID
 * @returns {{ type: 'EXPENSE_ADD', payers, allocations } | { type: 'TRANSFER', from, to, amount } | null}
 */
export function splitwiseToEntry(e, who) {
  const ids = Object.entries(e.nets).map(([p, n]) => [who(p), n]).filter(([id]) => id);
  const credit = ids.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const debit = ids.filter(([, n]) => n < 0);
  if (e.kind === 'payment' && credit.length === 1 && debit.length === 1) {
    return { type: 'TRANSFER', from: credit[0][0], to: debit[0][0], amount: r2(credit[0][1]) };
  }
  if (!credit.length) return null;
  if (credit.length === 1) {
    const [payer, net] = credit[0];
    const allocations = debit.map(([id, n]) => ({ user: id, value: r2(-n) }));
    const payerShare = r2(e.cost - net);
    if (payerShare > 0.004) allocations.unshift({ user: payer, value: payerShare });
    return { type: 'EXPENSE_ADD', payers: [{ user: payer, value: e.cost }], allocations };
  }
  return {
    type: 'EXPENSE_ADD',
    payers: credit.map(([id, n]) => ({ user: id, value: r2(n) })),
    allocations: debit.map(([id, n]) => ({ user: id, value: r2(-n) })),
  };
}

/** Matches Splitwise names to members by name (full, then first name). */
export function guessPeople(people, members, profiles, me) {
  const out = {};
  const nameOf = (m) => norm(profiles[m]?.name || m.split('@')[0]);
  for (const p of people) {
    const n = norm(p);
    const first = norm(p.split(/\s+/)[0]);
    out[p] =
      members.find((m) => nameOf(m) === n) ||
      members.find((m) => norm((profiles[m]?.name || '').split(/\s+/)[0]) === first && first.length > 1) ||
      (/^(you|me)$/i.test(p.trim()) ? me : null);
  }
  return out;
}

// Generic CSVs: which column is what, from the header names.
const COLS = {
  date: /^(date|txn ?date|transaction ?date|value ?date|posting ?date|when)$/i,
  title: /^(description|narration|details|particulars|title|merchant|payee|name|remarks|item|note)$/i,
  amount: /^(amount|cost|price|total|value|amount \(inr\)|amt)$/i,
  debit: /^(debit|withdrawal|withdrawals|withdrawal amt\.?|dr|paid out|money out|spent)$/i,
  credit: /^(credit|deposit|deposits|deposit amt\.?|cr|paid in|money in|received)$/i,
  paidBy: /^(paid ?by|payer|who paid|by)$/i,
  category: /^(category|type|tag)$/i,
};

/** Finds the header row (banks put account details above it) and maps the columns. */
export function readGenericCsv(rows, { now = new Date() } = {}) {
  const at = rows.findIndex((r) => r.some((c) => COLS.date.test(c)) && r.some((c) => COLS.amount.test(c) || COLS.debit.test(c)));
  if (at === -1) return null;
  const header = rows[at];
  const col = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, header.findIndex((h) => re.test(h))]));
  const txs = [];
  for (const r of rows.slice(at + 1)) {
    const date = findDate(r[col.date] || '', now)?.date ?? null;
    if (!date) continue;
    let amount = col.amount >= 0 ? num(r[col.amount]) : null;
    let direction = null;
    if (col.debit >= 0 || col.credit >= 0) {
      const dr = num(r[col.debit]);
      const cr = num(r[col.credit]);
      if (dr) (amount = Math.abs(dr)), (direction = 'debit');
      else if (cr) (amount = Math.abs(cr)), (direction = 'credit');
    } else if (amount != null && amount < 0) {
      direction = 'debit';
      amount = -amount;
    }
    if (!(amount > 0)) continue;
    txs.push({
      title: (r[col.title] || '').slice(0, 80) || 'Expense',
      amount: r2(amount),
      currency: null,
      direction,
      date,
      failed: false,
      paidBy: col.paidBy >= 0 ? r[col.paidBy] : null,
      category: col.category >= 0 ? r[col.category] : null,
    });
  }
  return txs;
}
