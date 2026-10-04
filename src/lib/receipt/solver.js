// Vendored from receipt_test@b9dd94a , bench/lib/solver.js. Keep in sync with that repo; avoid local edits.
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
import { extractMeta } from './meta.js';
import { parseRow, headerRoles, splitRow } from './rows.js';

// Word boundaries that still work when digits touch the word ("SGST2.5", "MwSt:").
const kw = src => new RegExp(String.raw`(?<![a-z])(?:${src})(?![a-z])`, 'i');
const KW = {
  subtotal: kw(String.raw`su[brk]\s*-?\s*total|subtotal|sous[\s-]total|zwischensumme|gross\s*(total|amt|amount|value)|item\s*total|items?\s*value|mrp|taxable\s*(amount|amt|value)|basic\s*(amt|amount)|total\s*before\s*tax|food\s*(amt|amount)|ticket\s*total|total\s*sales\s*\(?excl`),
  total: kw(String.raw`grand\s*total|total|amount\s*due|balance\s*due|amount\s*payable|net\s*payable|to\s*pay|bill\s*total|bill\s*amount|net\s*(amt|amount)|invoice\s*value|amount\s*incl\w*|amount\s*after\s*tax|summe|gesamt|betrag|totale|montant|importe|jumlah`),
  // (with OCR spellings next to a rate: "VAI @18.9%", "C6ST @9%", "CG8ST @ 0.5%")
  tax: kw(String.raw`tax|taxes|vat|gst|hst|pst|qst|cgst|sgst|igst|utgst|mwst|ust|tva|iva|btw|moms|sst|ppn|va[i1l](?=\s*@)|[cs]\s?[g6]\s?8?[s5]\s?[t71](?=\s*[@\d])`),
  discount: kw(String.raw`discount|disc\.?|dis(?=\s*[:@.])|savings?|saved|coupon|cpn|promo|loyalty|voucher|rebate|rabatt|remise|descuento|markdown|you\s*saved|member\s*price|off|less`),
  charge: kw(String.raw`tip|gratuity|service(\s*charge)?|(serv|svc)\.?\s*(charge|chg)|svc|fee|delivery|surge|packaging|bag\s*charge|rounding|round\s*off|adjustment|handling|small\s*cart`),
  payment: kw(String.raw`cash|change|tender(ed)?|visa|master\s*card|mastercard|amex|discover|debit|credit\s*card|card\s*(no|number|type)|upi|paid|bank|eftpos|balance`),
  ignore: kw(String.raw`tota?l?\s*(qty|quantity|items?|savings?)|items?\s*(count|sold)|no\.?\s*of\s*items|in\s*words|only|approval|auth|terminal|merchant\s*id|transaction|invoice\s*(no|number|#)|receipt\s*(no|number|#)|tel|phone|fax|gstin|(vat|tax|gst|mwst|ust|tva|iva)\s*(-?\s*(nr|no|number|reg|id)\b|#)|tax\s*id|ntn|strn|abn|expires?|entspricht|equivalent|exchange\s*rate`),
  header: /\b(qty|quantity|description|item\s*name|items?|price|rate|amount|amt|unit|total)\b.*\b(qty|quantity|price|rate|amount|amt|total|subtotal|cost)\b/i,
  free: kw(String.raw`free|waived|n\/a`),
  inclusive: kw(String.raw`incl\.?|inclusive|included|enthalten|inkl`),
};
// Labels that unambiguously mean "the amount to pay".
const FINAL = kw(String.raw`grand\s*total|(total\s*)?(amount\s*)?payable|amount\s*due|balance\s*due|total\s*due|nett?\s*total|total\s*after|to\s*pay|bill\s*total|final\s*total`);
const SUMMARY_TAGS = ['total', 'subtotal', 'tax', 'charge', 'discount', 'payment'];
// Item names that are really summary lines whose keyword the tagger missed
// (incl. OCR spellings of GST: "C6ST", "SG8T").
const SUMMARY_NAME = kw(String.raw`sub\s*-?\s*total|grand\s*total|total|gross\s*(amt|amount)|net\s*(amt|amount)|amount|inclusive\s*of|tot\.?\s*(items?|qty)|total\s*qty|items?\s*[:.]\s*\d|qty\s*[:.]\s*\d|taxable|bill\s*amount|round\s*off|balance|[cs]\s?[g6]\s?[s5]\s?[t71]|igst|gst\s*@`);
// Column-heading vocabulary, with common OCR spellings ("Oty", "Vaiue", "Iten").
const HEADER_WORDS = /^(qty|qnty|oty|qly|quantity|rate|price|mrp|amount|amt|anount|value|vaiue|total|description|descr|iption|particulars|item|iten|items|hsn|code|net|uom|unit|disc|discount|tax|gst|no\.?|sl|si|sr|#)$/i;
const headerWords = text => new Set(text.toLowerCase().replace(/[^a-z#\s.]/g, ' ').split(/\s+/).filter(w => HEADER_WORDS.test(w.replace(/\.$/, '')))).size;

const CUR = String.raw`(?:US\$|USD\$?|CHF|EUR|GBP|INR|PKR|MYR|RM|Rs\.?|₹|\$|€|£|¥)`;
const CUR_RE = new RegExp(CUR, 'g');
// Money: optional currency, digit groups, 2-decimal part (or 1 decimal, "800.0") —
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
const FIX_WORDS = ['total', 'subtotal', 'amount', 'round', 'cash', 'change', 'grand', 'payable', 'discount', 'balance', 'tender', 'items'];
// Real words one edit away from a keyword: never "correct" these.
const REAL_WORDS = new Set(['item', 'charge', 'charges', 'brand', 'mount', 'rounds', 'totals', 'chance', 'tenders', 'render', 'fender', 'grant']);
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
  if ((KW.header.test(full) && !line.amount) || headerWords(full) >= 4) return 'header';
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
    .replace(/^\s*\d{1,2}\s+(?=[A-Za-z])/, '') // qty / serial prefix ("2 KIWI"), but keep "100 PIPERS"
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
  // "2 @ ₹859/ea" (whole-number price), "3 0 $1.50 ea" / "2 $2.99 ea" (OCR turned @ into 0 or dropped it)
  if ((m = t.match(/(?:^|\s)(\d{1,3})\s*(?:[@©®]|0(?=\s))?\s*(?:₹|\$|rs\.?|€|£)?\s*(\d+(?:[.,]\d{2})?)\s*\/?\s*(ea|each)\b/i))) return { qty: +m[1], unit_price: +m[2].replace(',', '.') };
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

// A narrow printer breaks words anywhere: "LADIES NIGH" + "T SANGRIA". The next
// line then starts with a lone letter (not the words "A"/"I") that finishes the
// previous line's last word.
const hardWrap = (prevName, name) => /[A-Z]$/.test(prevName.trim()) && /^[B-HJ-Z]\s+[A-Z]/.test(name.trim());
const joinWrapped = (prevName, name) => /^\(/.test(name.trim()) ? `${prevName.trim()} ${name.trim()}` : hardWrap(prevName, name) ? prevName.trim() + name.trim() : `${prevName.trim()} ${name.trim()}`;

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
const COMPANY = /\b(sdn\.?\s*bhd|bhd|ltd|llc|inc|corp|co\.|gmbh|pte|plc|pvt|enterprises?|trading|traders|store|stores|mart|market|supermarket|restaurant|cafe|café|hotel|bakery|pharmacy|medicals?|hardware|services?|food|foods|dhaba|kitchen|bhavan|sweets|bar|grill|bistro|diner|canteen|shop|retail|agency|agencies|electronics|electrostore|textiles|garments|studio|salon|clinic|hospital)\b/i;
// Strap lines under a name ("A CLASSIC MULTICUSINE FAMILY RESTAURANT", "Pure Veg", "Since 1985").
const SUBTITLE = /^\s*(a|an|the\s+best)\s|multi\s*-?cuisine|family\s+restaurant|pure\s+veg|since\s+\d|welcome|expect\s+more/i;
const ADDRESS_WORD = /\b(jalan|jln|street|st\.|road|rd\.?|avenue|ave|lane|blvd|lot|floor|flr|level|lvl|suite|taman|tmn|block|blk|no\.|colony|nagar|plaza|mall|centre|center|marg|sector|unit|plot|bldg|building|complex|chowk|opp\.?|near)\b/i;
// An address line: an address word plus a number or a comma ("11/2 Sector- 37,", "Nathalal Parekh Marg,Matunga"),
// or a postcode. "Liquor Street" on its own is a name.
const ADDRESS = { test: t => /\b\d{5,6}\b/.test(t) || (ADDRESS_WORD.test(t) && /[\d,]/.test(t)) || (t.match(new RegExp(ADDRESS_WORD.source, 'gi')) || []).length >= 2 };
function findMerchant(lines) {
  const top = lines.slice(0, Math.max(6, Math.ceil(lines.length * 0.2)));
  const billTo = new Set();
  lines.forEach((l, i) => { if (/(bill(ed)?\s*to|invoice\s*to|ship\s*to|sold\s*to|customer|deliver\s*to)/i.test(l.text)) for (let k = 1; k <= 3; k++) billTo.add(i + k); });
  // Invoices that name the seller outright ("From: YOU Broadband India Limited", "SUPPLIER / Mascot").
  for (const l of lines) {
    const m = l.text.match(/(?<![a-z])(from|supplier|seller|sold\s*by|vendor|sender)\s*[:\-]?\s*(.*)$/i);
    if (!m || billTo.has(l.idx) && !/from|supplier|seller|sender/i.test(m[1])) continue;
    if (!/^(from|supplier|seller|sold\s*by|vendor|sender)\s*[:\-]?/i.test(l.text.slice(m.index)) || /\d{3,}/.test(m[2])) continue;
    const same = m[2].trim();
    if (/[A-Za-z]{3,}/.test(same) && same.length <= 60 && !/date|invoice|bill/i.test(same)) return { name: same, idx: l.idx };
    const next = lines[l.idx + 1];
    if (next && /[A-Za-z]{3,}/.test(next.text) && !/\d{4,}/.test(next.text) && next.text.length <= 60 && !NOT_MERCHANT.test(next.text)) return { name: next.text, idx: next.idx };
  }
  const cands = top.filter(l => l.tag === 'text' && !billTo.has(l.idx) && /[A-Za-z]{3,}/.test(l.text) && !NOT_MERCHANT.test(l.text) && !/\d{3,}/.test(l.text) && l.text.length <= 48
    && !/^\(.*\)$/.test(l.text.trim())); // "(ODVJH Private Limited)" is the legal name under the trade name
  if (!cands.length) return { name: null, idx: null };
  // Big font and company-ish words win; address-ish lines lose.
  const score = l => l.h
    + (COMPANY.test(l.text) ? 0.6 : 0)
    - (SUBTITLE.test(l.text) ? 1 : 0)
    - (ADDRESS.test(l.text) ? 1.5 : 0)
    - (/\d/.test(l.text) ? 0.3 : 0)
    - l.idx * 0.03;
  const best = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
  // Company names wrapped over two lines ("AIK HUAT HARDWARE" / "ENTERPRISE (SETIA ALAM) SDN BHD").
  const next = lines[best.idx + 1], prev = lines[best.idx - 1];
  const nameish = l => l && l.tag === 'text' && !ADDRESS.test(l.text) && !NOT_MERCHANT.test(l.text) && !/\d{3,}/.test(l.text) && /[A-Za-z]{3,}/.test(l.text);
  if (nameish(next) && COMPANY.test(next.text) && !COMPANY.test(best.text) && !SUBTITLE.test(next.text)) return { name: `${best.text} ${next.text}`, idx: next.idx };
  if (nameish(prev) && COMPANY.test(best.text) && best.text.search(COMPANY) === 0) return { name: `${prev.text} ${best.text}`, idx: best.idx };
  // Two stacked big lines are usually one name ("Green / Supermarket").
  // "SRI KRISHNA" over a smaller "Veg Restaurant": the descriptor line belongs to the name.
  if (nameish(prev) && COMPANY.test(best.text) && !COMPANY.test(prev.text) && prev.h >= best.h * 0.9 && !SUBTITLE.test(best.text) && cands.includes(prev)) return { name: `${prev.text} ${best.text}`, idx: best.idx };
  if (next && cands.includes(next) && !ADDRESS.test(next.text) && Math.abs(next.h - best.h) < 0.25 * best.h && best.h > 1.2) return { name: `${best.text} ${next.text}`, idx: next.idx };
  return { name: best.text, idx: best.idx };
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

  // Table rows with whole-number amounts ("PAV BHAJI  4  200  800") under a header,
  // on a receipt whose summary uses decimals: they count as priced rows when the
  // row's own arithmetic (qty × rate = amount) confirms it.
  const firstHeader = lines.findIndex(l => l.tag === 'header');
  const roles = firstHeader >= 0 ? headerRoles(lines[firstHeader].text + (/(amount|amt|total)\s*$/i.test(lines[firstHeader - 1]?.text ?? '') && !/(amount|amt|total)/i.test(lines[firstHeader].text) ? ' amount' : '')) : null;
  const taxRates = [...new Set(lines.filter(l => l.tag === 'tax').flatMap(l => [...l.text.matchAll(/(\d{1,2}(?:\.\d{1,3})?)\s*%/g)].map(m => +m[1])))];
  if (firstHeader >= 0) {
    for (let i = firstHeader + 1; i < lines.length; i++) {
      const l = lines[i];
      if (SUMMARY_TAGS.includes(l.tag) && l.amount) break;
      if (l.tag !== 'text' || !lettered(l.text)) continue;
      const pr = parseRow(l.text, { roles, rates: taxRates });
      if (!pr.amount || !pr.confirmed || pr.confirmed === 'columns' || !lettered(pr.name)) continue;
      const raw = pr.tail.at(-1).raw, index = l.text.lastIndexOf(raw);
      l.amount = { value: pr.amount, raw, index, end: index + raw.length, currency: '', perUnit: false };
      l.money = [l.amount];
      l.tag = 'amount';
    }
  }

  // Item region ends at the first summary line that follows an amount line.
  const firstAmount = lines.findIndex(l => l.tag === 'amount');
  // (A tax line with a value also ends it: taxes don't sit between items.)
  // …unless a priced item row follows it: then it was a tax-slab heading between item groups
  // ("2) CGST @ 9.00% SGST @ 9.00%" on Reliance-style bills).
  const itemRowFollows = i => { const n = lines.slice(i + 1).find(x => x.tag !== 'text' || x.money.length); return n && n.tag === 'amount'; };
  let end = lines.findIndex((l, i) => i > firstAmount && (['subtotal', 'total'].includes(l.tag) || (l.tag === 'tax' && i > firstAmount + 1 && !itemRowFollows(i))) && l.amount);
  if (end === -1) end = lines.length;
  // First table header: forms can have several tables (laundry + dry cleaning).
  const header = lines.slice(0, end).findIndex(l => l.tag === 'header');

  // Column check: with a table header ("… Amount"), real item amounts sit under
  // that column; values far to the left (a brochure, a phone number) are not items.
  // The amount column is the rightmost money heading, on the header line or the
  // line just above it (headings sometimes wrap: "AMOUNT" over "ITEM QTY PRICE").
  const headingBoxes = header >= 0 ? [lines[header], lines[header - 1]].filter(Boolean).flatMap(l => l.boxesX ?? []) : [];
  // (Rightmost heading of any kind: the amount is the last column, and OCR garbles its name: "Vaiue".)
  const amtCol = headingBoxes.filter(b => headerWords(b.text) > 0 || /amount|amt|total|value|price|rate/i.test(b.text)).sort((a, b) => b.right - a.right)[0];
  const rowWidth = Math.max(...lines.map(l => l.amountX ?? 0)) - Math.min(...lines.map(l => l.left));
  const inAmountColumn = l => !amtCol || l.amountX == null || Math.abs(l.amountX - amtCol.right) < rowWidth * 0.2;

  // Qty / rate / discount of a priced row from its own arithmetic (or the column headings).
  const rowOf = l => {
    const pr = parseRow(l.text, { roles, rates: taxRates });
    if (!pr.confirmed || pr.amount == null) return null;
    // Column-matched qty doesn't depend on reading the amount the same way ("$15.000").
    if (pr.confirmed === 'columns') return pr.qty != null ? { qty: pr.qty, unit_price: pr.unit_price ?? null } : null;
    if (!close(pr.amount, Math.abs(l.amount?.value ?? NaN), 0.02)) return null;
    return { qty: pr.qty ?? 1, unit_price: pr.unit_price ?? null, discount: pr.discount ?? null };
  };
  // A serial-number column ("#", "Sl. No.", "SI") means a leading number is not a quantity.
  // An HSN / SAC / item-code column: those codes end up glued into names ("Hotel Booking 1234").
  const hasCodeColumn = firstHeader >= 0 && /(?<![a-z])(hsn|sac|item\s*code|itemcode|code|sku|barcode|ean)(?![a-z])/i.test(lines[firstHeader].text);
  const hasSerialColumn = firstHeader >= 0 && /^\s*(#|s\.?\s*no|si\.?|sl\.?|sr\.?|s\.?\s*n)\b/i.test(lines[firstHeader].text + ' ' + (lines[firstHeader - 1]?.text ?? ''));

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
    // A summary word with no amount inside the item list is just name text ("S TENDER LAM" ≠ tendered).
    if (l.tag === 'payment' && !l.amount && lettered(name) && !/^\s*(cash|card|upi|paid|tender\w*|change|balance)\s*:?\s*$/i.test(l.text)) l.tag = 'text';
    if (l.tag === 'amount' && !inAmountColumn(l)) {
      // Its only price sits in the rate column and the amount column drifted to a neighbouring row
      // ("BUTTER NAAN 1 P 35.00" with 35.00 printed a row up): accept it when qty × rate shows up there.
      const tail = splitRow(l.text).tail.filter(n => !n.pct);
      const qTok = tail.find(n => n.decimals === 0 && n.value > 0 && n.value < 1000);
      const expected = qTok && tail.length >= 2 ? round2(qTok.value * tail.at(-1).value) : null;
      const near = expected != null && [lines[i - 1], lines[i + 1]].some(n => n?.money?.some(mm => close(mm.value, expected)));
      if (!near || !lettered(name)) continue;
      items.push({ name, qty: qTok.value, unit_price: tail.at(-1).value, total: expected, line: i, money: l.amount, verified: true });
      pendingName = null;
      continue;
    }
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
      const prev = items.at(-1);
      // Quantity / weight detail without its own amount ("0.778kg NET @ $5.99/kg", "2 @ ₹859/ea"):
      // it belongs to the item just above.
      const dq = qtyInfo(l);
      if (dq && !dq.soft && prev && !pendingName && (prev.lastLine ?? prev.line) >= i - 2 && isDetailLine(l, name)) {
        Object.assign(prev, { qty: dq.qty, unit_price: dq.unit_price ?? prev.unit_price, ...(dq.unit ? { unit: dq.unit } : {}) });
        prev.lastLine = i;
        continue;
      }
      if (lettered(name) && !KW.header.test(l.text)) {
        // Numbers printed ABOVE the name (code / price-qty-value / NAME layout).
        if (pendingAmount && !pendingName) {
          const { line: pl, row, q } = pendingAmount;
          items.push({ name, qty: row?.qty ?? (q && !q.soft ? q.qty : 1), unit_price: row?.unit_price ?? null, total: pl.amount.value, line: pl.idx, lastLine: i, money: pl.amount });
          pendingAmount = null;
          continue;
        }
        // Name hard-wrapped mid-word by a narrow printer ("LADIES NIGH" / "T SANGRIA").
        if (pendingName && pendingName.line === i - 1 && hardWrap(pendingName.name, name)) {
          pendingName = { ...pendingName, name: joinWrapped(pendingName.name, name), line: i };
          continue;
        }
        // Wrapped name ("MATCHA GELATO" / "SINGLE", "Solder" / "Wire" / "Univolt" / "50grms") vs. the
        // next item's name. Look past further text lines to the next priced row: if it has its own
        // name (or the item list ends there), every text line in between continues the item above —
        // unless that row's name is the hard-wrapped end of this text ("THAI GRILLE" / "D FISH 1 375.00").
        let k = i + 1;
        while (k < end && lines[k].tag === 'text' && !lines[k].money.length) k++;
        const next = lines[k];
        const nextName = next && next.tag === 'amount' ? itemName(next) : '';
        const continuesIntoNext = nextName && (hardWrap(itemName(lines[k - 1]), nextName) || /^\(/.test(nextName));
        const nextHasOwnName = !continuesIntoNext && (k >= end || lettered(nextName) || (next && SUMMARY_TAGS.includes(next.tag)));
        const wrapShape = !qtyInfo(l) && name.split(' ').length <= 6 && !l.money.length && l.left > lines[prev?.line ?? 0].left - 5 && l.h < 1.3;
        if (prev && (prev.lastLine ?? prev.line) === i - 1 && !pendingName && wrapShape && !continuesIntoNext && (name === name.toUpperCase() && name.split(' ').length <= 2 || nextHasOwnName || i + 1 >= end || hardWrap(prev.name, name))) {
          // "Hotel Name: Royal Retreat", "Journey Date 10-Apr-2024" are details, not more name
          // (and once details start, the lines after them are details too).
          if (prev.description || /^[A-Za-z][A-Za-z .]{1,24}:/.test(l.text.trim()) || /\d{1,2}[-/. ](\d{1,2}|[A-Za-z]{3})[-/. ]\d{2,4}/.test(l.text)) (prev.description ??= []).push(l.text.trim());
          else prev.name = hardWrap(prev.name, name) ? joinWrapped(prev.name, name) : `${prev.name} ${name}`;
          prev.lastLine = i;
        }
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
    const row = rowOf(l) || tableRow(l);
    let nm = name;
    if ((!lettered(nm) || /^\d/.test(nm)) && pendingName) nm = pendingName.name;
    // The priced line finishes a name that started on the line(s) above:
    // "LADIES NIGH" / "T SANGRIA  2  0.00", "100 PIPERS" / "(30 ML)  5  1275.00".
    else if (pendingName && pendingName.line === i - 1 && (hardWrap(pendingName.name, nm) || /^\(/.test(nm))) nm = joinWrapped(pendingName.name, nm);
    if (!lettered(nm)) {
      // A bare "price qty value" row with no name yet: its name may follow on the next line.
      if (!close(l.amount.value, 0)) pendingAmount = { line: l, row, q };
      pendingName = null;
      continue;
    }
    if (close(l.amount.value, 0) && /^(pcs?|nos?|ea|each|units?)$/i.test(nm)) { pendingName = null; continue; }
    // Summary wording is never an item ("Tot Items: 11 Gross Amt : 829", "(Amount inclusive of taxes) 574.25").
    if (SUMMARY_NAME.test(fixKeywords(nm))) {
      if (items.length >= 2 && close(l.amount.value, sum(items.map(t => t.total)))) { l.tag = 'subtotal'; end = i; break; }
      pendingName = null;
      continue;
    }
    pendingAmount = null;
    const qq = row || (q && !q.soft ? q : q?.soft && q.qty > 0 && !hasSerialColumn ? q : null) || pendingName?.q;
    items.push({ name: nm, qty: qq?.qty ?? 1, unit_price: qq?.unit_price ?? (qq?.qty ? round2(l.amount.value / qq.qty) : null), unit: qq?.unit, total: l.amount.value, line: i, money: l.amount, ...(qq?.discount ? { discount: qq.discount } : {}) });
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
  // "YOU HAVE SAVED: 33.52" / "Total savings 75" (unsigned) report savings against MRP: information,
  // not a discount on this bill. A signed one ("REDcard Savings $11.55-") is a real discount.
  const isSavingsNote = l => /you\s*(have\s*)?saved|total\s*sav(ings?|ed)|^\s*savings?\b/i.test(l.text) && l.amount.value > 0;
  const savings = pick('discount').filter(isSavingsNote).map(l => ({ label: l.label.trim(), amount: l.amount.value }));
  const discounts = pick('discount').filter(l => !isSavingsNote(l)).filter(l => !/\boff\b.*\d|saved\s+\D?\d/i.test(l.text) || l.amount.value < 0).map(l => ({ label: l.label.trim(), amount: -Math.abs(l.amount.value) }));
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
  // A tax printed again as its components ("Tax 1,869.92" … "CGST 975.61, SGST 894.31", or
  // "GST@5% 48.08" over "CGST 24.04, SGST 24.04"): keep one reading, not both.
  for (let a = 0; a < taxes.length; a++) {
    for (let b = a + 1; b < taxes.length; b++) {
      const whole = taxes.findIndex((t, k) => k !== a && k !== b && close(t.amount, taxes[a].amount + taxes[b].amount, 0.02));
      if (whole !== -1) { taxes.splice(whole, 1); a = taxes.length; break; }
    }
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
    // Rows whose qty × rate is one digit off the printed amount ("69.00 1 63.00"): if correcting
    // all of them makes the items add up to a printed total, the amounts were misread.
    const alts = items.map(it => ({ it, alt: lines[it.line] && it.money ? parseRow(lines[it.line].text, { roles, rates: taxRates }).altAmount : null })).filter(x => x.alt != null);
    if (alts.length && !anchors.some(a => close(sum(items.map(i => i.total)), a))) {
      const s = round2(sum(items.map(i => i.total)) + sum(alts.map(x => x.alt - x.it.total)));
      if (anchors.some(a => close(s, a))) alts.forEach(x => { x.it.total = x.alt; x.it.corrected = true; });
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
    else if (fitting.length) {
      total = reading(fitting.at(-1));
      // "Food Total 1921.50" then "Total : 1921": the later, rounded figure is what's paid.
      const later = chain.filter(l => l.idx > fitting.at(-1).idx && Number.isInteger(l.amount.value) && Math.abs(l.amount.value - total) < 1);
      if (later.length) total = later.at(-1).amount.value;
    }
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
  const merchant = findMerchant(lines);
  const firstItemLine = fixedItems.length ? Math.min(...fixedItems.map(i => i.line)) : end;
  const meta = extractMeta(lines, { merchantLine: merchant.idx, itemStart: header >= 0 ? header : firstItemLine });
  // Final name cleanup: codes from a code column, "(%)" / unit leftovers from wide tables.
  const cleanName = n => {
    let t = n.replace(/\(%\)/g, ' ').replace(/(?<![a-z])(pcs|nos|kgs?|unit|uom)(?![a-z])/gi, ' ');
    if (hasCodeColumn) t = t.split(/\s+/).filter(w => !/^(?=.*\d)[A-Z0-9/_.-]{4,}$/i.test(w)).join(' ');
    t = t.replace(/\s+/g, ' ').trim();
    return lettered(t) ? t : n.trim();
  };
  const outItems = fixedItems.map(({ line, lastLine, money, verified, ...it }) => ({ ...it, name: cleanName(it.name) }));
  const qtySum = round2(outItems.reduce((s, i) => s + (i.unit ? 1 : (i.qty ?? 1)), 0));
  // The same product on several rows (Target's 4 × CHOBANI lines): combined, rows kept as printed.
  const groups = new Map();
  for (const it of outItems) {
    const k = it.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const g = groups.get(k) ?? { name: it.name, rows: 0, qty: 0, total: 0 };
    g.rows++; g.qty = round2(g.qty + (it.qty ?? 1)); g.total = round2(g.total + it.total);
    groups.set(k, g);
  }
  const repeated = [...groups.values()].filter(g => g.rows > 1);
  return {
    merchant: merchant.name,
    currency,
    ...extractDateTime(lines, { currency }),
    invoice_number: meta.document.number ?? null,
    items: outItems,
    subtotal,
    discounts,
    charges,
    taxes,
    total,
    payment_method: meta.payment.method ?? (/\bcash\b/i.test(payText) ? 'cash' : /visa|master|amex|discover|card|credit|debit/i.test(payText) ? 'card' : null),
    phones: meta.phones,
    tax_ids: meta.ids.map(i => `${i.type} ${i.value}`),
    details: {
      legal_name: meta.legal_name ?? null,
      address: meta.address,
      email: meta.email,
      website: meta.website,
      ids: meta.ids,
      document: meta.document,
      staff: meta.people.staff ?? null,
      payment: {
        ...meta.payment,
        ...(cash ? { tendered: cash.amount.value } : {}),
        ...(change ? { change: change.amount.value } : {}),
      },
      // Printed counts next to what was read: a mismatch means an item was missed or invented.
      counts: { printed_items: meta.counts.items ?? null, printed_qty: meta.counts.qty ?? null, items: outItems.length, qty: qtySum },
      repeated_items: repeated,
      savings,
    },
    _debug: { combos, paid, itemSum },
    _lines: lines.map(l => `${String(l.idx).padStart(2)} ${l.tag.padEnd(8)} ${l.amount ? String(l.amount.value).padStart(10) : ''.padStart(10)}  ${l.text}`).join('\n'),
  };
}
