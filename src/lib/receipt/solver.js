// Vendored from receipt_test@8125280 , bench/lib/solver.js. Keep in sync with that repo; avoid local edits.
// Receipt structure from OCR boxes without a generative model.
// 1. group boxes into lines, pull money values out of each line
// 2. tag lines (total / subtotal / tax / discount / charge / payment / item)
// 3. build items (name lines, detail lines like "2 @ 1.50", line discounts)
// 4. use the receipt's own arithmetic to choose between ambiguous readings
// Every number in the output is copied from OCR text, never generated.
//
// Keep vocabulary generic (multi-language receipt words), never tuned to a
// specific test receipt.
import { toLines } from './ocr.js';
import { extractDateTime } from './datetime.js';

// Word boundaries that still work when digits touch the word ("SGST2.5", "MwSt:").
const kw = src => new RegExp(String.raw`(?<![a-z])(?:${src})(?![a-z])`, 'i');
const KW = {
  subtotal: kw(String.raw`sub\s*-?\s*total|subtotal|sous[\s-]total|zwischensumme|gross\s*total|item\s*total|net\s*amount|mrp|taxable\s*amount|total\s*before\s*tax`),
  total: kw(String.raw`grand\s*total|total|amount\s*due|balance\s*due|amount\s*payable|net\s*payable|to\s*pay|bill\s*total|summe|gesamt|betrag|totale|montant|importe|jumlah`),
  tax: kw(String.raw`tax|taxes|vat|gst|hst|pst|qst|cgst|sgst|igst|utgst|mwst|ust|tva|iva|btw|moms|sst|ppn`),
  discount: kw(String.raw`discount|savings?|saved|coupon|cpn|promo|loyalty|voucher|rebate|rabatt|remise|descuento|markdown|you\s*saved|member\s*price|off`),
  charge: kw(String.raw`tip|gratuity|service(\s*charge)?|(serv|svc)\.?\s*(charge|chg)|svc|fee|delivery|surge|packaging|bag\s*charge|rounding|round\s*off|adjustment|handling|small\s*cart`),
  payment: kw(String.raw`cash|change|tender(ed)?|visa|master\s*card|mastercard|amex|discover|debit|credit\s*card|card\s*(no|number|type)|upi|paid|bank|eftpos|balance`),
  ignore: kw(String.raw`tota?l?\s*(qty|quantity|items?|savings?)|items?\s*(count|sold)|no\.?\s*of\s*items|in\s*words|only|approval|auth|terminal|merchant\s*id|transaction|invoice\s*(no|number|#)|receipt\s*(no|number|#)|tel|phone|fax|gstin|(vat|tax|gst|mwst|ust|tva|iva)\s*(-?\s*(nr|no|number|reg|id)\b|#)|tax\s*id|ntn|strn|abn|expires?|entspricht|equivalent|exchange\s*rate`),
  header: /\b(qty|quantity|description|item\s*name|items?|price|rate|amount|amt|unit|total)\b.*\b(qty|quantity|price|rate|amount|amt|total|subtotal|cost)\b/i,
  free: kw(String.raw`free|waived|n\/a`),
  inclusive: kw(String.raw`incl\.?|inclusive|included|enthalten|inkl`),
};
// Labels that unambiguously mean "the amount to pay".
const FINAL = kw(String.raw`grand\s*total|(total\s*)?(amount\s*)?payable|amount\s*due|balance\s*due|total\s*due|nett?\s*total|total\s*after|to\s*pay|bill\s*total|final\s*total`);
const SUMMARY_TAGS =['total', 'subtotal', 'tax', 'charge', 'discount', 'payment'];

const CUR = String.raw`(?:US\$|USD\$?|CHF|EUR|GBP|INR|PKR|MYR|RM|Rs\.?|₹|\$|€|£|¥)`;
const CUR_RE = new RegExp(CUR, 'g');
// Money: optional currency, digit groups, 2-decimal part (or 1 decimal, "800.0") ,
// or a bare integer right after a currency symbol (₹424), or Indian "120/-".
const MONEY_RE = new RegExp(String.raw`(-\s*)?(${CUR}\s*)?(\d{1,3}(?:[,.']\d{3})+|\d+)([.,]\d{2}|\.\d(?![\d.,]))(?!\d)(\s*-(?!\d))?|(-\s*)?(${CUR})\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?![\d.,])|(?<![\d.,])(\d{1,6})\s*\/-`, 'g');

// integerMode: handwritten/kachha bills have no decimals at all; then trailing
// integers on a line count as amounts.
export function moneyIn(text, { integerMode = false } = {}) {
  const out = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const i = m.index, s = m[0];
    const before = text.slice(Math.max(0, i - 3), i), after = text.slice(i + s.length, i + s.length + 4);
    if (/\d[\/:.]$/.test(before) || /^[\/:.]\d/.test(after)) continue;   // dates, times
    if (/^\s*%/.test(after)) continue;                                   // percentages
    if (/^\s*(kg|lb|g|gm|ml|l|ltr|oz|pcs?|kb|mb|gb|mah)\b/i.test(after)) continue; // weights / units / status bar
    const perUnit = /^\s*\/\s*[a-z]/i.test(after);                       // "$5.99/kg"
    let value;
    if (m[9] != null) value = +m[9];
    else if (m[8] != null) value = +m[8].replace(/[.,]/g, '');
    else value = parseFloat(m[3].replace(/[,.']/g, '') + '.' + m[4].slice(1));
    const neg = !!(m[1] || m[5] || m[6]) || /\(\s*$/.test(before);
    out.push({ value: neg ? -value : value, index: i, end: i + s.length, raw: s, currency: (m[2] || m[7] || '').trim(), perUnit });
  }
  if (integerMode) {
    // Only the last integer on the line, and never phone/ID-like numbers.
    const m = text.match(/(?<![\d.,\/:-])(\d{1,5})(?:\s*\/?-|\.)?\s*$/);
    if (m && !out.some(o => o.end >= m.index + m[1].length)) {
      out.push({ value: +m[1], index: m.index, end: m.index + m[0].length, raw: m[0], currency: '', perUnit: false, integer: true });
    }
  }
  return out;
}

// Readings of an amount that a common OCR slip could have produced. The
// receipt's arithmetic decides which one is right.
//   "₹292.00" read as "2292.00" / "7292.00"   → drop a leading 2 or 7
//   "265⁰⁰" (superscript paise) read as 26500   → divide by 100
//   "120/-" read as "1201"                      → drop the trailing 1
function variants(m) {
  const out = [m.value];
  if (!m || m.value == null) return out;
  const raw = String(m.raw ?? '').replace(/[^\d.]/g, '');
  const intPart = raw.split('.')[0];
  if (/^[27]\d{2,}/.test(intPart)) out.push(+(raw.slice(1)));
  if (!raw.includes('.') && /00$/.test(intPart) && intPart.length >= 4) out.push(m.value / 100);
  if (!raw.includes('.') && /\d1$/.test(intPart) && intPart.length >= 3) out.push(+intPart.slice(0, -1));
  return out.filter(v => Number.isFinite(v));
}

const round2 = n => Math.round(n * 100) / 100;
const close = (a, b, tol = 0.011) => a != null && b != null && Math.abs(a - b) <= tol;
const sum = a => round2(a.reduce((s, x) => s + x, 0));
const lettered = s => /[a-z]{2,}/i.test(String(s).replace(CUR_RE, ''));

function analyseLines(boxes) {
  const lines = toLines(boxes);
  const allH = boxes.map(b => b.h).sort((a, b) => a - b);
  const medH = allH[Math.floor(allH.length / 2)] || 10;
  const built = lines.map(l => {
    const starts = [];
    let text = '';
    for (const b of l.boxes) { if (text) text += ' '; starts.push(text.length); text += b.text.replace(/\s+/g, ' ').trim(); }
    return { l, starts, text };
  });
  // Handwritten / kachha bills: (almost) no decimal amounts anywhere.
  const decimals = built.reduce((n, b) => n + moneyIn(b.text).filter(m => /[.,]\d{1,2}$/.test(m.raw.replace(/\s*-$/, ''))).length, 0);
  const integerMode = decimals < 2;
  const out = built.map(({ l, starts, text }, idx) => {
    const money = moneyIn(text, { integerMode });
    const amount = [...money].reverse().find(m => !m.perUnit) ?? null;
    // Label = the text run (OCR box) nearest to the left of the amount, so a
    // left-column sentence doesn't decide the tag of a right-column value.
    let label = text, amountX = null;
    if (amount) {
      const bi = starts.findLastIndex(st => st <= amount.index);
      amountX = l.boxes[bi].right;
      const own = text.slice(starts[bi], amount.index);
      if (lettered(own)) label = own;
      else {
        let k = bi - 1;
        while (k >= 0 && !lettered(l.boxes[k].text)) k--;
        label = k >= 0 ? l.boxes[k].text : text.slice(0, amount.index);
      }
    }
    // ktext/label get keyword repair for tagging; `text` stays raw because money indices point into it.
    return { idx, text, ktext: fixKeywords(text), money, amount, amountX, label: fixKeywords(label), boxesX: l.boxes.map(b => ({ text: b.text, right: b.right })), h: Math.max(...l.boxes.map(b => b.h)) / medH, cy: l.cy, left: Math.min(...l.boxes.map(b => b.left)) };
  });
  out.integerMode = integerMode;
  return out;
}

function tag(line) {
  const first = tagText(line, line.label);
  if (first !== 'amount' || !line.amount) return first;
  // Nearest text run had no keyword ("... on $151.37  $12.83"): try everything left of the amount.
  const wider = tagText(line, fixKeywords(line.text.slice(0, line.amount.index)));
  return wider === 'ignore' ? first : wider;
}
// OCR slips in the words that matter most ("fotal", "Tota1", "SUBTOTAI"): snap
// words within one edit of a summary keyword back to the keyword.
const FIX_WORDS = ['total', 'subtotal', 'amount', 'round', 'cash', 'change', 'grand', 'payable', 'discount', 'balance', 'tender'];
// Real words one edit away from a keyword: never "correct" these.
const REAL_WORDS = new Set(['charge', 'charges', 'brand', 'mount', 'rounds', 'totals', 'chance', 'tenders', 'render', 'fender', 'grant']);
function editDistance1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function fixKeywords(text) {
  return text.replace(/[A-Za-z][A-Za-z01]{3,9}/g, w => {
    const lw = w.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l');
    if (FIX_WORDS.includes(lw) || REAL_WORDS.has(lw)) return w;
    const hit = FIX_WORDS.find(k => k.length >= 5 && editDistance1(lw, k));
    return hit ? (w === w.toUpperCase() ? hit.toUpperCase() : hit) : w;
  });
}

function tagText(line, label) {
  const t = label.toLowerCase(), full = line.ktext.toLowerCase();
  if (KW.ignore.test(line.amount ? t : full)) return 'ignore';
  if (KW.header.test(full) && !line.amount) return 'header';
  if (KW.subtotal.test(t)) return 'subtotal';
  if (/total\s*(tax|gst|vat|hst|mwst|tva|iva|sst)|(tax|gst|vat)\s*total/.test(t)) return 'tax';
  if (KW.tax.test(t) && KW.total.test(t)) {
    // "TOTAL INCL. GST 64.70" is the total; "GST @6% included in total 3.66" is the tax.
    return t.search(KW.tax) < t.search(KW.total) ? 'tax' : 'total';
  }
  if (KW.tax.test(t)) return 'tax';
  if (KW.charge.test(t)) return 'charge';
  if (KW.discount.test(t)) return 'discount';
  if (KW.total.test(t)) return 'total';
  if (KW.payment.test(t)) return 'payment';
  return line.amount ? 'amount' : 'text';
}

// Strips SKUs, tax flags, currency codes, percentages, qty prefixes from an item line.
function itemName(line) {
  let s = line.text;
  for (const m of [...line.money].reverse()) s = s.slice(0, m.index) + ' ' + s.slice(m.end);
  return s
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/-?\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(new RegExp(String.raw`(^|\s)${CUR}(?=\s|$)`, 'g'), ' ')
    .replace(/(?:^|\s)(?:[A-Z]{1,2}|[*#@xX]|à|a)(?=\s*$)/, ' ')
    .replace(/^\s*\d{1,3}\s*[xX×*]\s*/, '')
    .replace(/^\s*\d{1,3}\s+(?=[A-Za-z])/, '')
    .replace(/\s+[@à]\s*$/, '')
    .replace(/[↓↑|]+/g, ' ')
    .replace(/(\s+\d{1,3}(?:\.\d+)?)+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "2 @ $2.99 ea", "0.778kg NET @ $5.99/kg" (OCR often turns @ into 0 or #), "3 x 1.50"
function qtyInfo(line) {
  const t = line.text;
  let m;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(kg|lb|g)\b.*?(\d+[.,]\d{2})\s*\/\s*(kg|lb|g)\b/i)) || (m = t.match(/(\d+(?:\.\d+)?)\s*(kg|lb|g)\b.*?@\s*\D{0,3}(\d+[.,]\d{2})/i)))
    return { qty: +m[1], unit: m[2].toLowerCase(), unit_price: +m[3].replace(',', '.'), weight: true };
  if ((m = t.match(/(?:^|\s)(\d{1,3})\s*(?:@|x|×|à)\s*\D{0,4}?(\d+[.,]\d{2})/i))) return { qty: +m[1], unit_price: +m[2].replace(',', '.') };
  if ((m = t.match(/^\s*(\d{1,3})\s*\$(\d+[.,]\d{2})\s*(ea|each)\b/i))) return { qty: +m[1], unit_price: +m[2].replace(',', '.') }; // "2 $2.99 ea" (lost @)
  if ((m = t.match(/^\s*(\d{1,3})\s*[xX×]\s*[A-Za-z]/))) return { qty: +m[1] };
  if ((m = t.match(/^\s*(\d{1,2})\s+[A-Za-z]{2,}/))) return { qty: +m[1], soft: true };
  return null;
}

const DETAIL_WORDS = /\b(ea|each|net|kg|lb|g|x|pc|pcs)\b/gi;
function isDetailLine(line, name) {
  const q = qtyInfo(line);
  if (!q || q.soft) return false;
  return q.weight || !name || !lettered(name.replace(DETAIL_WORDS, ''));
}

// For table rows (price qty tax total) find qty/unit_price that multiply to the total.
function tableRow(line) {
  const vals = line.money.filter(m => !m.perUnit).map(m => Math.abs(m.value));
  if (vals.length < 2) return null;
  const total = vals[vals.length - 1];
  const ints = [...line.text.matchAll(/(?<![\d.,])(\d{1,3})(?:\.00)?(?![\d.,%])/g)].map(m => +m[1]).filter(n => n > 0 && n < 500 && !close(n, total));
  for (const q of [...new Set([...ints, 1])]) {
    for (const unit of vals.slice(0, -1)) if (!close(unit, q) && close(q * unit, total, Math.max(0.02, total * 0.001))) return { qty: q, unit_price: unit };
  }
  return null;
}

function detectCurrency(text) {
  const tests = [['INR', /₹|\bRs\.?\s|\bINR\b|GSTIN|CGST|SGST/], ['PKR', /\bPKR\b|FBR|\bNTN\b/], ['MYR', /\bRM\b|\(RM\)/], ['CHF', /\bCHF\b/], ['EUR', /€|\bEUR\b/], ['GBP', /£|\bGBP\b/], ['USD', /\$|\bUSD\b/]];
  for (const [code, re] of tests) if (re.test(text)) return code;
  return null;
}

const NOT_MERCHANT = /\b(invoice|receipt|tax\s*invoice|bill|order|date|time|table|cashier|server|welcome|copy|branch|my\s*cart|cart|details?|customer|guest|tel|phone|www|http|edit|print|send|mail|attach|comments?|history|customi[sz]e|paid|checkout|see\s*more)\b|@/i;
const COMPANY = /\b(sdn\.?\s*bhd|bhd|ltd|llc|inc|corp|co\.|gmbh|pte|plc|pvt|enterprise|trading|store|stores|mart|market|supermarket|restaurant|cafe|café|hotel|bakery|pharmacy|hardware|services?)\b/i;
const ADDRESS = /\b(jalan|jln|street|st\.|road|rd\.?|avenue|ave|lane|blvd|lot|floor|flr|level|lvl|suite|taman|tmn|block|blk|no\.|colony|nagar|plaza|mall|centre|center)\b|\b\d{5,6}\b/i;
function findMerchant(lines) {
  const top = lines.slice(0, Math.max(6, Math.ceil(lines.length * 0.2)));
  const billTo = new Set();
  lines.forEach((l, i) => { if (/(bill(ed)?\s*to|invoice\s*to|ship\s*to|sold\s*to|customer|deliver\s*to)/i.test(l.text)) for (let k = 1; k <= 3; k++) billTo.add(i + k); });
  const cands = top.filter(l => l.tag === 'text' && !billTo.has(l.idx) && /[A-Za-z]{3,}/.test(l.text) && !NOT_MERCHANT.test(l.text) && !/\d{3,}/.test(l.text) && l.text.length <= 48);
  if (!cands.length) return null;
  // Big font and company-ish words win; address-ish lines lose.
  const score = l => l.h
    + (COMPANY.test(l.text) ? 1.5 : 0)
    - (ADDRESS.test(l.text) ? 1.5 : 0)
    - (/\d/.test(l.text) ? 0.3 : 0)
    - l.idx * 0.03;
  const best = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
  // Company names wrapped over two lines ("AIK HUAT HARDWARE" / "ENTERPRISE (SETIA ALAM) SDN BHD").
  const next = lines[best.idx + 1], prev = lines[best.idx - 1];
  const nameish = l => l && l.tag === 'text' && !ADDRESS.test(l.text) && !NOT_MERCHANT.test(l.text) && !/\d{3,}/.test(l.text) && /[A-Za-z]{3,}/.test(l.text);
  if (nameish(next) && COMPANY.test(next.text) && !COMPANY.test(best.text)) return `${best.text} ${next.text}`;
  if (nameish(prev) && COMPANY.test(best.text) && best.text.search(COMPANY) === 0) return `${prev.text} ${best.text}`;
  // Two stacked big lines are usually one name ("Green / Supermarket").
  if (next && cands.includes(next) && Math.abs(next.h - best.h) < 0.25 * best.h && best.h > 1.2) return `${best.text} ${next.text}`;
  return best.text;
}

// The reading of an amount that matches one of the expected values, else the plain value.
function bestReading(m, expected) {
  return variants(m).find(v => expected.some(e => close(v, e))) ?? m.value;
}

// One differing digit between two equal-length numbers = classic OCR misread.
function oneDigitApart(a, b) {
  const x = a.toFixed(2), y = b.toFixed(2);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++;
  return d === 1;
}

export function solveReceipt(boxes) {
  const lines = analyseLines(boxes);
  lines.forEach(l => { l.tag = tag(l); });

  // Phone status bar on screenshots ("3:50 94.8 KB/s VoWiFi 32%"): never receipt content.
  const pageBottom = Math.max(...lines.map(l => l.cy));
  for (const l of lines) {
    if (l.cy < pageBottom * 0.05 && /(\b\d{1,2}:\d{2}\b|kb\/s|\bvo\b|\blte\b|wi-?fi|\b[45]g\b)/i.test(l.text)) l.tag = 'ignore';
  }

  // Summary labels whose value lost its currency symbol / decimals ("MRP 423", "you saved 75.0").
  for (const l of lines) {
    if (!SUMMARY_TAGS.includes(l.tag) || l.amount) continue;
    const m = l.text.match(/(-\s*)?(\d{1,6}(?:\.\d)?)\s*$/);
    if (m && !/%\s*$/.test(l.text)) l.amount = { value: (m[1] ? -1 : 1) * +m[2], raw: m[2], loose: true };
  }
  // Rounding is always under one currency unit. A bigger value on a "Round off"
  // line belongs to a neighbouring Total/Subtotal label (values printed a row off).
  for (const l of lines) {
    if (l.tag !== 'charge' || !/round/i.test(l.label) || !l.amount || Math.abs(l.amount.value) < 1) continue;
    const owner = [lines[l.idx + 1], lines[l.idx - 1], lines[l.idx + 2]].find(n => n && ['total', 'subtotal'].includes(n.tag) && !n.amount);
    if (owner) { owner.amount = l.amount; owner.money = l.money; }
    l.amount = null;
  }
  // Labels without a value on their own line (misaligned columns): borrow the
  // nearest unclaimed value-only line.
  const valueOnly = l => l.tag === 'amount' && l.money.length === 1 && !/[a-z0-9]/i.test(l.text.slice(0, l.amount.index).replace(CUR_RE, '') + l.text.slice(l.amount.end));
  for (const l of lines) {
    // Short labels only: a long sentence that happens to contain "fee" is not a label.
    if (!SUMMARY_TAGS.includes(l.tag) || l.amount || /\d/.test(l.text.replace(/\d+(\.\d+)?\s*%/g, '')) || l.text.trim().split(/\s+/).length > 5) continue;
    const near = [lines[l.idx + 1], lines[l.idx - 1], lines[l.idx + 2]].find(n => n && valueOnly(n) && !n.claimed);
    if (near) { l.amount = near.amount; l.money = near.money; near.claimed = true; near.tag = 'claimed'; }
  }
  for (const l of lines) if (['charge', 'discount'].includes(l.tag) && KW.free.test(l.text)) l.amount = { value: 0 };

  // Empty pre-printed table rows ("1", "2", … "10" on their own): serial numbers, not amounts.
  for (let i = 0; i < lines.length; i++) {
    let j = i;
    while (j < lines.length && lines[j].tag === 'amount' && valueOnly(lines[j]) && lines[j].amount.value === lines[i].amount.value + (j - i)) j++;
    if (j - i >= 3) for (let k = i; k < j; k++) lines[k].tag = 'ignore';
  }

  // Item region ends at the first summary line that follows an amount line.
  const firstAmount = lines.findIndex(l => l.tag === 'amount');
  // (A tax line with a value also ends it: taxes don't sit between items.)
  let end = lines.findIndex((l, i) => i > firstAmount && (['subtotal', 'total'].includes(l.tag) || (l.tag === 'tax' && i > firstAmount + 1)) && l.amount);
  if (end === -1) end = lines.length;
  // First table header: forms can have several tables (laundry + dry cleaning).
  const header = lines.slice(0, end).findIndex(l => l.tag === 'header');

  // Column check: with a table header ("… Amount"), real item amounts sit under
  // that column; values far to the left (a brochure, a phone number) are not items.
  // The amount column is the rightmost money heading, on the header line or the
  // line just above it (headings sometimes wrap: "AMOUNT" over "ITEM QTY PRICE").
  const headingBoxes = header >= 0 ? [lines[header], lines[header - 1]].filter(Boolean).flatMap(l => l.boxesX ?? []) : [];
  const amtCol = headingBoxes.filter(b => /amount|amt|total|value|price|rate/i.test(b.text)).sort((a, b) => b.right - a.right)[0];
  const rowWidth = Math.max(...lines.map(l => l.amountX ?? 0)) - Math.min(...lines.map(l => l.left));
  const inAmountColumn = l => !amtCol || l.amountX == null || Math.abs(l.amountX - amtCol.right) < rowWidth * 0.2;

  // Build items.
  const items = [];
  let pendingName = null, pendingAmount = null;
  for (let i = Math.max(0, header + 1); i < end; i++) {
    const l = lines[i];
    const name = itemName(l);
    // A bare value equal to the running item sum is an unlabelled subtotal (label lost to OCR / a thumb).
    // Also when it shares a line with "Total Qty: 8" (a split "Sub / Total" label around it).
    if (l.amount && items.length >= 2 && (valueOnly(l) || l.tag === 'ignore') && ['amount', 'ignore'].includes(l.tag) && close(l.amount.value, sum(items.map(t => t.total)))) {
      l.tag = 'subtotal';
      end = i;
      break;
    }
    if (l.tag === 'amount' && !inAmountColumn(l)) continue;
    // A row of 3+ prices side by side ("₹144 ₹202 ₹20 ₹20") is a product carousel, not a bill line.
    if (l.money.filter(m => m.currency).length >= 3) continue;
    // Without decimals to go by, a bare row of numbers is too ambiguous to be an item.
    if (lines.integerMode && l.tag === 'amount' && !lettered(l.text)) continue;
    if (l.tag === 'discount' || l.tag === 'charge') {
      const prev = items.at(-1);
      // Signed amount = applied line discount; unsigned "Saved X off Y" = informational.
      if (prev && l.amount && l.amount.value < 0) {
        if (/\b(cpn|coupon)\b/i.test(l.text)) items.push({ name, qty: 1, unit_price: null, total: l.amount.value, line: i, money: l.amount });
        else { prev.discount = round2((prev.discount || 0) + l.amount.value); prev.total = round2(prev.total + l.amount.value); }
      }
      continue;
    }
    if (l.tag === 'text') {
      if (lettered(name) && !KW.header.test(l.text)) {
        // Numbers printed ABOVE the name (code / price-qty-value / NAME layout).
        if (pendingAmount && !pendingName) {
          const { line: pl, row, q } = pendingAmount;
          items.push({ name, qty: row?.qty ?? (q && !q.soft ? q.qty : 1), unit_price: row?.unit_price ?? null, total: pl.amount.value, line: pl.idx, money: pl.amount });
          pendingAmount = null;
          continue;
        }
        // Wrapped name ("MATCHA GELATO" / "SINGLE", "Italiano Veg" / "Sandwich") vs. the next item's name.
        // If the line after this one is a priced row with its own name, this text can't be
        // that row's name, so it continues the item above.
        const prev = items.at(-1);
        const next = lines[i + 1];
        const nextHasOwnName = next && next.tag === 'amount' && lettered(itemName(next));
        const wrapShape = !qtyInfo(l) && name.split(' ').length <= 3 && !/\d{2,}/.test(name) && l.left > lines[prev?.line ?? 0].left - 5 && l.h < 1.3;
        if (prev && prev.line === i - 1 && !pendingName && wrapShape && (name === name.toUpperCase() && name.split(' ').length <= 2 || nextHasOwnName || i + 1 >= end)) prev.name += ' ' + name;
        else if (!/^(pcs?|nos?|ea|each|units?)$/i.test(name)) pendingName = { name, line: i, q: qtyInfo(l) };
      }
      continue;
    }
    if (l.tag !== 'amount') continue;

    const q = qtyInfo(l);
    if (isDetailLine(l, name)) {
      const target = pendingName ? null : items.at(-1);
      if (target) {
        Object.assign(target, { qty: q.qty, unit_price: q.unit_price ?? target.unit_price, unit: q.unit });
        if (!q.weight && l.money.filter(m => !m.perUnit).length >= 2 && !close(target.total, l.amount.value)) target.total = l.amount.value;
        continue;
      }
      if (pendingName && !q.weight) {
        items.push({ name: pendingName.name, qty: q.qty, unit_price: q.unit_price ?? null, unit: q.unit, total: l.amount.value, line: i, money: l.amount });
        pendingName = null;
        continue;
      }
      if (q.weight) continue;
    }
    const row = tableRow(l);
    let nm = name;
    if ((!lettered(nm) || /^\d/.test(nm)) && pendingName) nm = pendingName.name;
    if (!lettered(nm)) {
      // A bare "price qty value" row with no name yet: its name may follow on the next line.
      if (!close(l.amount.value, 0)) pendingAmount = { line: l, row, q };
      pendingName = null;
      continue;
    }
    if (close(l.amount.value, 0) && /^(pcs?|nos?|ea|each|units?)$/i.test(nm)) { pendingName = null; continue; }
    pendingAmount = null;
    const qq = row || (q && !q.soft ? q : q?.soft && q.qty > 0 ? q : null) || pendingName?.q;
    items.push({ name: nm, qty: qq?.qty ?? 1, unit_price: qq?.unit_price ?? (qq?.qty ? round2(l.amount.value / qq.qty) : null), unit: qq?.unit, total: l.amount.value, line: i, money: l.amount });
    pendingName = null;
  }

  // Amount column drifting off the item rows (curl, perspective, or a printer that
  // offsets columns): when qty × price on a row doesn't match its own amount but
  // matches the amount on the row just above/below, that's the row's real amount.
  const rowAmt = idx => lines[idx]?.amount?.value;
  for (const it of items) {
    const l = lines[it.line];
    if (!l?.money?.length) continue;
    const vals = l.money.filter(m => !m.perUnit);
    const rate = vals.length >= 2 ? vals.at(-2) : vals[0];
    const q = l.text.slice(0, rate.index).match(/(?<![\d.])(\d{1,3})(?:\.0+)?\s*(?:p|pcs?|nos?|x)?\s*$/i);
    if (!q) continue;
    const expected = round2(+q[1] * rate.value);
    if (close(expected, it.total)) continue;
    const hit = [it.line - 1, it.line + 1].find(k => close(rowAmt(k), expected));
    if (hit != null) Object.assign(it, { total: expected, qty: +q[1], unit_price: rate.value, verified: true });
  }

  // Handwritten rows: "Garments-06  20  1201" → qty × rate = 120 confirms the "120/-" reading.
  if (lines.integerMode) {
    for (const it of items) {
      if (!it.money?.raw) continue;
      const ints = [...lines[it.line].text.slice(0, it.money.index).matchAll(/(?<![\d.])(\d{1,4})(?![\d.])/g)].map(m => +m[1]).filter(n => n > 0);
      for (const v of variants(it.money)) {
        const pair = ints.flatMap((a, x) => ints.slice(x + 1).map(b => [a, b])).find(([a, b]) => a * b === v);
        if (pair) { Object.assign(it, { total: v, qty: pair[0], unit_price: pair[1], verified: true }); break; }
      }
    }
  }

  // Summary block.
  const summary = lines.slice(Math.min(end, lines.length));
  const pick = t => summary.filter(l => l.tag === t && l.amount);
  const subtotalLines = pick('subtotal');
  const taxes = pick('tax').map(l => ({ label: l.label.trim(), rate: +(l.text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? NaN) || null, amount: Math.abs(l.amount.value), inclusive: KW.inclusive.test(l.text) }));
  const discounts = pick('discount').filter(l => !/\boff\b.*\d|saved\s+\D?\d/i.test(l.text) || l.amount.value < 0).map(l => ({ label: l.label.trim(), amount: -Math.abs(l.amount.value) }));
  const charges = pick('charge').map(l => ({ label: l.label.trim(), amount: /round|adjust/i.test(l.text) ? l.amount.value : Math.abs(l.amount.value) }));
  // Some invoices print the total above the items ("Receipt Total $154.06").
  const totalLines = pick('total').length ? pick('total') : lines.filter(l => l.tag === 'total' && l.amount);
  const payments = pick('payment');

  // Taxes printed both as rows and as a "total tax" line: drop the summary line when rows add up to it.
  const taxTotalLine = taxes.find(t => /total/i.test(t.label));
  if (taxTotalLine && taxes.length > 1) {
    const rows = taxes.filter(t => t !== taxTotalLine);
    if (close(sum(rows.map(r => r.amount)), taxTotalLine.amount, 0.05)) taxes.splice(taxes.indexOf(taxTotalLine), 1);
  }

  // Printed totals the items should add up to, in all plausible OCR readings.
  const anchors = [...subtotalLines, ...totalLines].flatMap(l => variants(l.amount));
  // One item misread ("₹" → 2, "/-" → 1)? Try its alternative readings against the anchors.
  if (items.length && anchors.length && !anchors.some(a => close(sum(items.map(i => i.total)), a))) {
    outer: for (const it of items) {
      for (const v of variants(it.money).slice(1)) {
        const s = round2(sum(items.map(i => i.total)) - it.total + v);
        if (anchors.some(a => close(s, a))) { it.total = v; break outer; }
      }
    }
  }

  const itemSum = sum(items.map(i => i.total));
  let subtotal = subtotalLines.length ? bestReading(subtotalLines[0].amount, [itemSum]) : null;

  // Candidate equations: base (printed subtotal or item sum) × tax added or already included.
  const disc = sum(discounts.map(d => d.amount)), chg = sum(charges.map(c => c.amount)), addTax = sum(taxes.filter(t => !t.inclusive).map(t => t.amount)), allTax = sum(taxes.map(t => t.amount));
  const combos = [];
  for (const [base, src] of [[subtotal, 'subtotal'], [items.length ? itemSum : null, 'items']]) {
    if (base == null) continue;
    combos.push({ src, incl: false, v: round2(base + disc + chg + addTax) });
    if (allTax) combos.push({ src, incl: true, v: round2(base + disc + chg) });
    // Line discounts already inside the subtotal.
    if (disc) combos.push({ src, incl: false, v: round2(base + chg + addTax), noDisc: true });
  }
  const fits = v => combos.find(c => close(c.v, v, 0.05));

  // Cash tendered − change = amount paid: an independent reading of the total.
  const cash = payments.find(l => /cash|tender|received|paid/i.test(l.label) && l.amount.value > 0);
  const change = payments.find(l => /change/i.test(l.label));
  const paid = cash && change && change !== cash ? round2(cash.amount.value - change.amount.value) : null;

  // Prefer totals that say they're final; "excl." / "before" totals are partial.
  const rank = l => (/grand|incl|payable|due|after|nett?\b|to\s*pay|bill\s*total/i.test(l.label) ? 2 : 0) - (/excl|before|w\/o|sales\s*$/i.test(l.label) ? 2 : 0) + l.h;

  // Receipts often print a chain (excl. tax → incl. tax → after rounding) and
  // then a tax summary table after the payment lines. The grand total is the
  // last link of the chain before payment.
  const firstPay = payments.length ? Math.min(...payments.map(p => p.idx)) : Infinity;
  const chain = totalLines.filter(l => l.idx < firstPay).length ? totalLines.filter(l => l.idx < firstPay) : totalLines;
  // A total line's value, or its OCR-slip reading if only that one fits the arithmetic.
  const reading = l => variants(l.amount).find(v => fits(v)) ?? l.amount.value;
  let total = null, fit = null;
  if (totalLines.length) {
    // Corrected handwritten totals are often written next to the printed TOTAL
    // label rather than on its line: consider bare values right beside it too.
    const beside = totalLines.flatMap(t => [lines[t.idx - 1], lines[t.idx + 1]]).filter(n => n && n.amount && valueOnly(n));
    const fitting = [...chain, ...beside].filter(l => variants(l.amount).some(v => fits(v)));
    const final = chain.filter(l => FINAL.test(l.label));
    if (paid != null && totalLines.some(l => close(l.amount.value, paid, 0.011))) total = paid;
    else if (final.length) total = reading(final.at(-1));
    else if (fitting.length) total = reading(fitting.at(-1));
    // Handwritten form whose rows are each confirmed by qty × rate: trust their sum over a garbled TOTAL.
    else if (lines.integerMode && items.length && items.every(i => i.verified)) total = itemSum;
    else if (paid != null && fits(paid)) total = paid;
    else total = [...chain].filter(l => rank(l) >= 0).at(-1)?.amount.value ?? chain.at(-1).amount.value;
    fit = fits(total);
  } else if (paid != null && paid > 0) {
    total = paid; fit = fits(total);
  } else {
    // Unlabelled grand total (big number under the subtotal block, or a value whose label OCR lost).
    const vals = summary.filter(l => !['payment', 'subtotal', 'tax', 'charge', 'discount'].includes(l.tag)).flatMap(l => l.money.filter(m => !m.perUnit).map(m => m.value));
    const unl = vals.find(v => fits(v));
    if (unl != null) { total = unl; fit = fits(total); }
    // No total printed: fall back to the arithmetic, except on handwritten pages
    // (no TOTAL line there usually means it isn't a bill at all).
    else if (combos.length && !lines.integerMode) { fit = combos[0]; total = fit.v; }
  }
  if (fit?.incl) taxes.forEach(t => { t.inclusive = true; });

  // Printed subtotal one digit away from a sum that makes everything reconcile → OCR misread.
  if (subtotal != null && fit?.src === 'items' && !close(subtotal, itemSum) && oneDigitApart(subtotal, itemSum)) subtotal = itemSum;

  // Arithmetic repair of the item list: drop up to two lines that break items = subtotal.
  let fixedItems = items;
  if (subtotal != null && items.length && !close(itemSum, subtotal, 0.02)) {
    const diff = round2(itemSum - subtotal);
    const one = items.findIndex(it => close(it.total, diff, 0.02));
    if (one !== -1) fixedItems = items.filter((_, i) => i !== one);
    else {
      outer: for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
        if (close(items[a].total + items[b].total, diff, 0.02)) { fixedItems = items.filter((_, i) => i !== a && i !== b); break outer; }
      }
    }
  }

  const allText = lines.map(l => l.text).join('\n');
  const currency = detectCurrency(allText);
  const payText = payments.map(p => p.text).join(' ') + ' ' + allText;
  return {
    merchant: findMerchant(lines),
    currency,
    ...extractDateTime(lines, { currency }),
    items: fixedItems.map(({ line, money, verified, ...it }) => it),
    subtotal,
    discounts,
    charges,
    taxes,
    total,
    payment_method: /\bcash\b/i.test(payText) ? 'cash' : /visa|master|amex|discover|card|credit|debit/i.test(payText) ? 'card' : null,
    _debug: { combos, paid, itemSum },
    _lines: lines.map(l => `${String(l.idx).padStart(2)} ${l.tag.padEnd(8)} ${l.amount ? String(l.amount.value).padStart(10) : ''.padStart(10)}  ${l.text}`).join('\n'),
  };
}
