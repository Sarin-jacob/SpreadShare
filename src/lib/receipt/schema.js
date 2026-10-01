// Vendored from receipt_test@8125280 — bench/lib/schema.js. Keep in sync with that repo; avoid local edits.
// The output shape every engine must return, plus helpers to coerce
// whatever a model produced into it.

export const PROMPT_SCHEMA = `{
  "merchant": "store name",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "currency": "ISO code like USD",
  "items": [{"name": "item", "qty": 1, "unit_price": 0.0, "total": 0.0}],
  "subtotal": 0.0,
  "discounts": [{"label": "text", "amount": -0.0}],
  "charges": [{"label": "tip/fee/rounding", "amount": 0.0}],
  "taxes": [{"label": "text", "rate": 0.0, "amount": 0.0, "inclusive": false}],
  "total": 0.0,
  "payment_method": "cash|card|other"
}`;

export const PROMPT_RULES = [
  'Numbers are plain JSON numbers: no currency symbols, no thousands separators.',
  'items are only purchased products/services. Never list subtotal, tax, total, cash, change, tip or discounts as items.',
  'item total is the line amount printed for that item.',
  'Lines like "2 @ 1.50", "0.5kg @ 3.99/kg" or "Saved 1.00" belong to the item above them.',
  'discounts use negative amounts.',
  'Use null for anything not printed on the receipt. Do not invent items.',
].join('\n');

// JSON Schema for engines that support constrained decoding (WebLLM).
const num = { type: ['number', 'null'] };
const str = { type: ['string', 'null'] };
const labelled = { type: 'array', items: { type: 'object', properties: { label: str, amount: { type: 'number' } }, required: ['label', 'amount'] } };
export const JSON_SCHEMA = {
  type: 'object',
  properties: {
    merchant: str, date: str, time: str, currency: str,
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, qty: num, unit_price: num, total: { type: 'number' } },
        required: ['name', 'qty', 'unit_price', 'total'],
      },
    },
    subtotal: num,
    discounts: labelled,
    charges: labelled,
    taxes: {
      type: 'array',
      items: { type: 'object', properties: { label: str, rate: num, amount: { type: 'number' }, inclusive: { type: 'boolean' } }, required: ['label', 'rate', 'amount', 'inclusive'] },
    },
    total: num,
    payment_method: str,
  },
  required: ['merchant', 'date', 'time', 'currency', 'items', 'subtotal', 'discounts', 'charges', 'taxes', 'total', 'payment_method'],
};

export function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  const neg = /^-|-$|^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot && s.length - lastComma === 3) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}

function labelledList(v, forceSign) {
  if (!Array.isArray(v)) {
    const n = toNumber(v);
    return n == null || n === 0 ? [] : [{ label: null, amount: forceSign ? forceSign * Math.abs(n) : n }];
  }
  return v.map(x => {
    if (typeof x !== 'object' || x == null) x = { amount: x };
    const amount = toNumber(x.amount ?? x.value ?? x.total);
    return { ...x, label: x.label ?? x.name ?? null, amount: amount == null ? null : (forceSign ? forceSign * Math.abs(amount) : amount) };
  }).filter(x => x.amount != null);
}

export function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const merchant = typeof r.merchant === 'object' && r.merchant ? r.merchant.name : (r.merchant ?? r.store ?? r.enterprise ?? null);
  const items = (Array.isArray(r.items) ? r.items : []).map(it => ({
    name: String(it?.name ?? it?.description ?? '').trim(),
    qty: toNumber(it?.qty ?? it?.quantity),
    unit_price: toNumber(it?.unit_price ?? it?.price),
    total: toNumber(it?.total ?? it?.total_price ?? it?.amount),
    discount: toNumber(it?.discount),
  })).filter(it => it.name || it.total != null);
  const taxes = labelledList(r.taxes ?? r.tax).map(t => ({ ...t, rate: toNumber(t.rate), inclusive: !!t.inclusive }));
  return {
    merchant: merchant ? String(merchant).trim() : null,
    date: normalizeDate(r.date ?? r.document?.date),
    time: r.time ?? r.document?.time ?? null,
    currency: r.currency ?? r.document?.currency ?? null,
    items,
    subtotal: toNumber(r.subtotal),
    discounts: labelledList(r.discounts ?? r.discount, -1),
    charges: labelledList(r.charges),
    taxes,
    total: toNumber(r.total ?? r.grand_total),
    payment_method: r.payment_method ?? r.payment?.method ?? null,
  };
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
const fullYear = y => (y < 100 ? 2000 + y : y);

// Returns YYYY-MM-DD. Numeric dates that could be D/M or M/D are read as M/D
// only when D/M is impossible; scoring accepts either reading for those.
export function normalizeDate(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim();
  let m;
  if ((m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    let a = +m[1], b = +m[2], y = fullYear(+m[3]);
    if (a > 12) return `${y}-${pad(b)}-${pad(a)}`; // D/M
    if (b > 12) return `${y}-${pad(a)}-${pad(b)}`; // M/D
    return `${y}-${pad(b)}-${pad(a)}|${y}-${pad(a)}-${pad(b)}`; // ambiguous: both
  }
  if ((m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*,?\s+(\d{2,4})/)) && MONTHS[m[2].toLowerCase()])
    return `${fullYear(+m[3])}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  if ((m = s.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})/)) && MONTHS[m[1].toLowerCase()])
    return `${fullYear(+m[3])}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`;
  return null;
}
