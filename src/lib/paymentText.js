// src/lib/paymentText.js
// Reads a payment message (bank SMS, UPI notification, card alert, payment email) into
// expense fields. Pure and on-device; dates reuse the receipt solver's date logic.
import { extractDateTime } from './receipt/datetime.js';
import { receiptDateTime } from './receipt/draft.js';

const CURRENCY = { rs: 'INR', 'rs.': 'INR', inr: 'INR', '₹': 'INR', usd: 'USD', $: 'USD', eur: 'EUR', '€': 'EUR', gbp: 'GBP', '£': 'GBP', aed: 'AED', sgd: 'SGD', myr: 'MYR', rm: 'MYR' };
const CUR = String.raw`(rs\.?|inr|₹|usd|\$|eur|€|gbp|£|aed|sgd|myr|rm)`;
const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const DEBIT = /\b(debited|debit|spent|paid|sent|purchase[d]?|withdrawn|charged|transferred|trf|txn|payment of|dr)\b/i;
const CREDIT = /\b(credited|credit|received|refund(ed)?|deposited|reversed|cashback|cr)\b/i;
const NOT_THE_AMOUNT = /\b(bal|balance|avl|avail(able)?|limit|lmt|outstanding|due|min(imum)?|total\s+due)\b[^\d]{0,15}$/i;

/** Every amount in the text with a score for how likely it's the transaction amount. */
function amountCandidates(text) {
  const out = [];
  const add = (m, value, cur, viaKeyword) => {
    const index = m.index;
    const before = text.slice(Math.max(0, index - 30), index);
    const around = text.slice(Math.max(0, index - 45), index + m[0].length + 45);
    let score = 0;
    if (DEBIT.test(around) || CREDIT.test(around)) score += 2;
    if (NOT_THE_AMOUNT.test(before)) score -= 10;
    if (viaKeyword) score -= 0.5; // no currency marker: slightly less sure
    out.push({ value, currency: cur ? CURRENCY[cur.toLowerCase()] : null, index, score: score - out.length * 0.01 });
  };
  const toNum = (s) => parseFloat(s.replace(/,/g, ''));
  for (const m of text.matchAll(new RegExp(String.raw`${CUR}\s?${NUM}`, 'gi'))) add(m, toNum(m[2]), m[1], false);
  for (const m of text.matchAll(new RegExp(String.raw`(?<![\d.,])${NUM}\s?(inr|rs|usd|eur|gbp|aed|sgd|myr)\b`, 'gi'))) add(m, toNum(m[1]), m[2], false);
  for (const m of text.matchAll(new RegExp(String.raw`\b(?:debited|credited|spent|paid|sent|charged)\s+(?:by|for|of|with|amount)?\s*${NUM}(?!\d)`, 'gi'))) {
    if (!out.some((o) => Math.abs(o.index - m.index) < m[0].length + 4)) add(m, toNum(m[1]), null, true);
  }
  return out.filter((c) => c.value > 0 && c.value < 1e8);
}

const NOT_A_NAME = /^(your|ur|a\/?c|ac|acct|account|card|bank|upi|the|you|me|my|xx|vpa|beneficiary|mobile|wallet|merchant|on|date)\b/i;
const BANKS = /\b(hdfc|sbi|icici|axis|kotak|yes\s*bank|pnb|canara|idfc|indusind|federal|bob|paytm\s*payments?\s*bank|bank)\b/i;

const titleCase = (s) => s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

function cleanName(raw) {
  let s = String(raw || '')
    .replace(/[*_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:\-]+$/, '');
  for (let i = 0; i < 3; i++) s = s.replace(/\s+(in|ltd|pvt|private|limited|llp|india|co)\.?$/i, '').trim();
  if (s.length < 2 || NOT_A_NAME.test(s) || BANKS.test(s) || /\d{4,}/.test(s)) return null;
  return s === s.toUpperCase() || s === s.toLowerCase() ? titleCase(s) : s;
}

/** "rapido@ybl" → "Rapido", "asha.n@okaxis" → "Asha N". QR / phone-number handles give up. */
function nameFromVpa(local) {
  if (/qr|^\d|\d{5,}/i.test(local)) return null;
  const words = local.replace(/\d+/g, ' ').split(/[._\-\s]+/).filter(Boolean);
  return words.length ? cleanName(words.join(' ')) : null;
}

function findMerchant(text) {
  const flat = text.replace(/\s*\n\s*/g, ' \n ');
  for (const m of flat.matchAll(/\b(?:to|by|from|at)\s+(?:vpa\s+)?([a-z0-9][a-z0-9._\-]{1,40})@[a-z][a-z0-9]{1,20}\b/gi)) {
    const n = nameFromVpa(m[1]);
    if (n) return n;
  }
  const STOP = String.raw`(?=\s+(?:on|via|ref\w*|upi|using|with|from|thru|through|for|dated|avl|is|has|was|in\s+a\/?c|txn|ending|card)\b|\s*[.,;(\n]|\s*$)`;
  const STOP_CS = String.raw`(?=\s+(?:[Oo]n|[Vv]ia|[Rr]ef\w*|UPI|[Aa]vl)\b|\s*[.,;(\n]|\s*$)`;
  const patterns = [
    new RegExp(String.raw`\b(?:paid|sent|transferred|trf|payment)\s+to\s+([a-z][a-z0-9&.'\- ]{1,40}?)${STOP}`, 'gi'),
    new RegExp(String.raw`\b(?:at|towards)\s+([a-z][a-z0-9&.'\- ]{1,40}?)${STOP}`, 'gi'),
    new RegExp(String.raw`\bto\s+([a-z][a-z0-9&.'\- ]{1,40}?)${STOP}`, 'gi'),
    // "spent … on AMAZON PAY IN." — uppercase only, so "on 30-Sep" or "on your card" never match
    new RegExp(String.raw`\b[Oo]n\s+([A-Z][A-Z0-9&.'\- ]{2,40}?)${STOP_CS}`, 'g'),
    new RegExp(String.raw`\bfrom\s+([a-z][a-z0-9&.'\- ]{1,40}?)${STOP}`, 'gi'),
    new RegExp(String.raw`\bby\s+([a-z][a-z0-9&.'\- ]{1,40}?)${STOP}`, 'gi'),
  ];
  for (const re of patterns) {
    for (const m of flat.matchAll(re)) {
      const n = cleanName(m[1]);
      if (n && !DEBIT.test(n) && !CREDIT.test(n)) return n;
    }
  }
  // Card alerts printed one field per line: a line that is only an UPPERCASE name.
  for (const line of text.split('\n').map((l) => l.trim())) {
    if (/^[A-Z][A-Z0-9&.'\- ]{2,30}$/.test(line) && !/\d{2,}/.test(line) && !new RegExp(String.raw`^${CUR}\b`, 'i').test(line) && !DEBIT.test(line) && !CREDIT.test(line) && !BANKS.test(line) && !/^(NOT YOU|SMS|CALL|REF|INFO)/.test(line)) {
      const n = cleanName(line);
      if (n) return n;
    }
  }
  return null;
}

function direction(text, amountIndex) {
  const near = text.slice(Math.max(0, amountIndex - 60), amountIndex + 60);
  const d = near.search(DEBIT), c = near.search(CREDIT);
  if (d === -1 && c === -1) {
    if (DEBIT.test(text)) return 'out';
    if (CREDIT.test(text)) return 'in';
    return 'out';
  }
  if (d === -1) return 'in';
  if (c === -1) return 'out';
  return Math.abs(d - 60) <= Math.abs(c - 60) ? 'out' : 'in';
}

/**
 * @returns {{ amount: number, currency: string|null, direction: 'out'|'in', merchant: string|null,
 *            when: string|null, date: string|null }} or null when no amount is found
 */
export function parsePaymentText(text, { now = new Date() } = {}) {
  const t = String(text || '').replace(/\r/g, '').trim();
  if (!t) return null;
  const best = amountCandidates(t).sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < -5) return null;
  const currency = best.currency;
  const lines = t.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map((text, i) => ({ text, cy: i }));
  const { date, time } = extractDateTime(lines, { currency });
  return {
    amount: best.value,
    currency,
    direction: direction(t, best.index),
    merchant: findMerchant(t),
    date,
    when: receiptDateTime(date, time, now),
  };
}

/** True when pasted text reads like a payment message rather than a note. */
export function looksLikePayment(text) {
  const t = String(text || '');
  if (t.length < 15 || !(DEBIT.test(t) || CREDIT.test(t))) return false;
  const p = parsePaymentText(t);
  return !!p && p.amount > 0;
}
