// src/lib/receipt/draft.js
// Turns a parsed receipt (see schema.js normalize()) into expense-form values. Pure , no OCR or DOM.
import { keywordVotes } from '../categorize.js';

/** Best-guess category value from the merchant name and items (keyword rules only). */
export function guessCategory(receipt) {
  return keywordVotes({ merchant: receipt?.merchant, items: receipt?.items || [] });
}

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" + "HH:MM[:SS]" → value for <input type="datetime-local">, or null if unusable. */
export function receiptDateTime(date, time, now = new Date()) {
  const m = String(date || '').split('|')[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  const d = new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 12, t ? +t[2] : 0);
  if (Number.isNaN(d.getTime())) return null;
  // Future dates are OCR slips; very old ones are almost certainly wrong too.
  if (d.getTime() > now.getTime() + 36 * 3600_000) return null;
  if (now.getFullYear() - d.getFullYear() > 5) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Collapses whitespace and turns SHOUTY RECEIPT CAPS into Title Case (short codes like "GST" stay). */
export const tidyName = (s) => {
  // Receipts flag taxable / discounted lines with trailing symbols ("Bread *#", "Milk T"),
  // and some list items with a leading bullet ("- Ruler", "• Milk").
  const t = String(s || '').replace(/\s+/g, ' ').trim().replace(/(\s*[*#^~]+)+$/, '').replace(/^[-–—•*·.]+\s*/, '').trim();
  if (t !== t.toUpperCase() || !/[A-Z]{4,}/.test(t)) return t;
  return t.replace(/[A-Z][A-Z'&.]*/g, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()));
};

/** Items worth offering for an item-wise split (named, non-zero). */
export function receiptItems(receipt) {
  return (receipt?.items || [])
    .filter((i) => i.total != null && Math.abs(i.total) >= 0.01)
    .map((i) => ({
      name: tidyName(i.name) || 'Item',
      total: i.total,
      qty: i.qty ?? null,
      ...(i.unit_price != null ? { unit_price: i.unit_price } : {}),
      ...(i.unit ? { unit: i.unit } : {}),
    }));
}

/** Whole-unit quantity worth splitting into separate lines ("3 × Beer" → three ₹300 lines). */
export const unitCount = (item) => (Number.isInteger(item?.qty) && item.qty >= 2 && item.qty <= 30 ? item.qty : 0);

/** One line per unit, so each can go to a different person. Rounding lands on the last line. */
export function splitUnits(name, total, qty) {
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / qty);
  return Array.from({ length: qty }, (_, i) => ({
    name: `${name} (${i + 1}/${qty})`,
    total: (i === qty - 1 ? cents - each * (qty - 1) : each) / 100,
  }));
}

/**
 * What the receipt itself says about how many items / units it lists, compared with what was
 * read ("Total items: 11"). Null when the receipt prints no count or it matches.
 */
export function countMismatch(receipt) {
  const c = receipt?.details?.counts;
  if (!c || !receipt.items?.length) return null;
  if (c.printed_items != null && c.printed_items !== c.items) return { kind: 'items', printed: c.printed_items, read: c.items };
  if (c.printed_qty != null && Math.abs(c.printed_qty - c.qty) >= 0.01) return { kind: 'qty', printed: c.printed_qty, read: c.qty };
  return null;
}

/** Plain-language versions of the self-check failures (see audit.js). */
export function describeCheck(c) {
  const n = c.name;
  if (n === 'has total') return 'No total found. Enter the amount yourself.';
  if (n === 'items = subtotal') return `Items add up to ${c.detail.split(' vs ')[0]}, but the subtotal reads ${c.detail.split(' vs ')[1]}. An item may be missing or misread.`;
  if (n === 'totals reconcile') return 'Subtotal, taxes and charges don’t add up to the total. Check the total.';
  if (n === 'item count' || n === 'qty count') return null; // shown separately (countMismatch)
  if (n.startsWith('qty×price')) return `Check ${n.slice(11).replace(/"$/, '')}: quantity × price doesn’t match its amount.`;
  if (n === 'rounding < 1') return 'A round-off line looks too large. Check the total.';
  return `${n}: ${c.detail}`;
}

/** Form values suggested by a scan. Fields are null when the receipt didn't say. */
export function receiptToDraft(receipt, { now = new Date() } = {}) {
  return {
    amount: receipt?.total ?? null,
    currency: receipt?.currency ?? null,
    title: receipt?.merchant ? tidyName(receipt.merchant).slice(0, 80) : null,
    when: receiptDateTime(receipt?.date, receipt?.time, now),
    category: guessCategory(receipt),
    items: receiptItems(receipt),
  };
}

/** Compact copy of what was read, stored on the expense for the detail view. */
export function compactScan(receipt) {
  const list = (arr) => (arr || []).map(({ label, amount }) => ({ label: label || null, amount }));
  return {
    merchant: receipt.merchant,
    date: receipt.date,
    currency: receipt.currency,
    items: receiptItems(receipt),
    subtotal: receipt.subtotal,
    taxes: (receipt.taxes || []).map(({ label, amount, inclusive }) => ({ label: label || null, amount, inclusive: !!inclusive })),
    charges: list(receipt.charges),
    discounts: list(receipt.discounts),
    total: receipt.total,
    ...(receipt.invoice_number ? { invoice_number: String(receipt.invoice_number).slice(0, 40) } : {}),
    ...(receipt.payment_method ? { payment_method: receipt.payment_method } : {}),
  };
}
