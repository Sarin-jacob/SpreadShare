// src/lib/statement.js
// Per-person statements for a period: opening balance, every entry's effect, closing balance.
// Built on computeLedgerState's de-duplicated, delete-aware entry list, so the closing balance
// for "all time" always equals the balance shown in the app.
import { round2 } from './math.js';

/**
 * How one entry moves a member's balance.
 * @returns {{ paid: number, share: number, net: number }} net > 0 means they're owed more
 */
export function memberEffect(x, member) {
  const p = x.payload || {};
  if (x.type === 'EXPENSE_ADD') {
    const paid = p.payers?.length
      ? p.payers.filter((y) => y.user === member).reduce((s, y) => s + (parseFloat(y.value) || 0), 0)
      : x.payer === member ? x.amount : 0;
    const share = (p.allocations || []).filter((a) => a.user === member).reduce((s, a) => s + (parseFloat(a.value) || 0), 0);
    return { paid: round2(paid), share: round2(share), net: round2(paid - share) };
  }
  let amount = x.amount;
  if (x.type === 'LOAN' && p.interest_type === 'SIMPLE' && p.interest_rate > 0) amount = round2(amount * (1 + p.interest_rate / 100));
  if (x.payer === member) return { paid: amount, share: 0, net: amount };
  if (x.target === member) return { paid: 0, share: amount, net: -amount };
  return { paid: 0, share: 0, net: 0 };
}

/** Calendar month containing `date` as [start, end) in local time. */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
}

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Months (YYYY-MM, newest first) that have entries, plus the current month. */
export function activeMonths(expenses, now = new Date()) {
  const set = new Set([monthKey(now)]);
  for (const x of expenses) set.add(monthKey(new Date(x.timestamp)));
  return [...set].sort().reverse();
}

/**
 * @param expenses computeLedgerState(...).expenses
 * @param member email
 * @param range { from: Date, to: Date } (to exclusive)
 */
export function buildStatement(expenses, member, { from, to }) {
  let opening = 0;
  const rows = [];
  const totals = { spent: 0, paid: 0, share: 0, sent: 0, received: 0, lent: 0, borrowed: 0 };
  const ordered = [...expenses].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  for (const x of ordered) {
    const t = new Date(x.timestamp);
    if (t >= to) continue;
    const eff = memberEffect(x, member);
    if (t < from) {
      opening += eff.net;
      continue;
    }
    if (x.type === 'EXPENSE_ADD') totals.spent += x.amount;
    if (!eff.paid && !eff.share) continue; // not involved
    if (x.type === 'EXPENSE_ADD') {
      totals.paid += eff.paid;
      totals.share += eff.share;
    } else if (x.type === 'TRANSFER') {
      if (eff.net > 0) totals.sent += eff.net;
      else totals.received -= eff.net;
    } else if (x.type === 'LOAN') {
      if (eff.net > 0) totals.lent += eff.net;
      else totals.borrowed -= eff.net;
    }
    rows.push({ ...eff, expense: x });
  }
  opening = round2(opening);
  let running = opening;
  for (const r of rows) r.balance = running = round2(running + r.net);
  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);
  return { opening, closing: round2(running), rows, totals };
}

/** Plain-text statement for sharing in a chat. */
export function statementText(st, { group, person, period, money, name, date }) {
  const sign = (n) => (n > 0.009 ? `+${money(n)}` : n < -0.009 ? `−${money(-n)}` : money(0));
  const lines = [`${group}: statement for ${person}, ${period}`, '', `Opening balance: ${sign(st.opening)}`];
  for (const r of st.rows) {
    const x = r.expense;
    const what = x.type === 'TRANSFER' ? `Payment ${name(x.payer)} → ${name(x.target)}` : x.type === 'LOAN' ? `Loan ${name(x.payer)} → ${name(x.target)}` : x.title;
    lines.push(`${date(x.timestamp)}  ${what}  ${sign(r.net)}`);
  }
  lines.push('', `Paid ${money(st.totals.paid)} · Share ${money(st.totals.share)}`);
  if (st.totals.sent || st.totals.received) lines.push(`Payments sent ${money(st.totals.sent)} · received ${money(st.totals.received)}`);
  lines.push(`Closing balance: ${sign(st.closing)} (${st.closing > 0.009 ? 'is owed' : st.closing < -0.009 ? 'owes' : 'settled up'})`);
  return lines.join('\n');
}

export function statementCsv(st, { name }) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const out = [['Date', 'Type', 'Description', 'Category', 'Total', 'Paid', 'Share', 'Effect', 'Balance'].join(',')];
  out.push(['', 'OPENING', 'Opening balance', '', '', '', '', '', st.opening].map(esc).join(','));
  for (const r of st.rows) {
    const x = r.expense;
    const what = x.type === 'EXPENSE_ADD' ? x.title : `${x.type === 'LOAN' ? 'Loan' : 'Payment'} ${name(x.payer)} → ${name(x.target)}`;
    out.push([new Date(x.timestamp).toISOString().slice(0, 10), x.type, what, x.category, x.amount, r.paid, r.share, r.net, r.balance].map(esc).join(','));
  }
  out.push(['', 'CLOSING', 'Closing balance', '', '', '', '', '', st.closing].map(esc).join(','));
  return out.join('\n');
}
