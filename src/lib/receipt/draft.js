// src/lib/receipt/draft.js
// Turns a parsed receipt (see schema.js normalize()) into expense-form values. Pure — no OCR or DOM.

const CATEGORY_RULES = [
  ['Groceries', /grocer|supermarket|hypermarket|\bmart\b|blinkit|zepto|bigbasket|instamart|dmart|reliance\s*(fresh|smart)|more\s*retail|kirana|provision|walmart|costco|aldi|lidl|tesco|sainsbury|whole\s*foods|trader\s*joe|fairprice|giant|\bvegetables?\b|\bmilk\b/i],
  ['Food', /restaurant|\bcaf[eé]\b|coffee|kitchen|dhaba|bakery|pizza|burger|biryani|swiggy|zomato|\bbar\b|\bpub\b|eatery|\bfoods?\b|starbucks|mcdonald|\bkfc\b|domino|subway|chai|\btea\b|dine|bistro|grill|canteen|mess\b/i],
  ['Health', /pharma|chemist|medical|hospital|clinic|apollo|medplus|1mg|netmeds|\bdrug|diagnostic|\blab\b|dental/i],
  ['Travel', /\buber\b|\bola\b|rapido|\bfuel\b|petrol|diesel|\bhpcl\b|\bbpcl\b|indian\s*oil|\bshell\b|parking|\btoll\b|\bmetro\b|railway|irctc|airline|airways|\bcab\b|taxi/i],
  ['Stay', /\bhotel\b|resort|\binn\b|hostel|lodge|\boyo\b|airbnb|homestay|\brent\b/i],
  ['Utilities', /electric|\bpower\b|water\s*(board|bill)|broadband|recharge|airtel|\bjio\b|vodafone|bsnl|\bgas\b|\bbill\s*pay/i],
  ['Entertainment', /cinema|\bpvr\b|\binox\b|movie|theatre|theater|bookmyshow|netflix|gaming|bowling|amusement/i],
  ['Shopping', /fashion|apparel|clothing|footwear|electronics|amazon|flipkart|myntra|decathlon|ikea|\bmall\b|lifestyle|pantaloons|zara|h\s*&\s*m/i],
];

/** Best-guess category value from the merchant name, then item names. */
export function guessCategory(receipt) {
  const texts = [receipt?.merchant || '', (receipt?.items || []).map((i) => i.name).join(' ')];
  for (const text of texts) {
    if (!text) continue;
    for (const [value, re] of CATEGORY_RULES) if (re.test(text)) return value;
  }
  return null;
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
const tidyName = (s) => {
  // Receipts flag taxable / discounted lines with trailing symbols ("Bread *#", "Milk T").
  const t = String(s || '').replace(/\s+/g, ' ').trim().replace(/(\s*[*#^~]+)+$/, '').trim();
  if (t !== t.toUpperCase() || !/[A-Z]{4,}/.test(t)) return t;
  return t.replace(/[A-Z][A-Z'&.]*/g, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()));
};

/** Items worth offering for an item-wise split (named, non-zero). */
export function receiptItems(receipt) {
  return (receipt?.items || [])
    .filter((i) => i.total != null && Math.abs(i.total) >= 0.01)
    .map((i) => ({ name: tidyName(i.name) || 'Item', total: i.total, qty: i.qty ?? null }));
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
  };
}
