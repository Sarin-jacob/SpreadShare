// Vendored from receipt_test@b9dd94a , bench/lib/rows.js. Keep in sync with that repo; avoid local edits.
// Item rows: split a line into its name and the numbers after it, then decide
// which number is the quantity, the unit price and the line amount.
//
// The receipt's own arithmetic decides first (qty × rate = amount, optionally
// with a line discount or a tax built into the amount). Column headings
// ("Qty Rate Amount") decide when there's no arithmetic to go on.

const close = (a, b, tol) => Math.abs(a - b) <= tol;
const round2 = n => Math.round(n * 100) / 100;

// Words that sit between the numbers of a row and carry no value.
const FILLER = /^(p|pc|pcs|nos?|no|x|×|@|ea|each|kg|kgs|g|gm|gms|l|ltr|ml|pax|unit|units|rs\.?|inr|₹|\$|€|£|sr|zr|t|fc|n|a|b|s|e|z|\*|=|-|:|\/|\|)$/i;
// A numeric token: 1,234.56 / 1234.56 / 12 / 1.000 / 12.5 (not part of a word like "75ml" or "4PC").
const NUM = /^[-(]?(?:₹|rs\.?|\$|€|£)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\(%\))?[)-]?$/i;
const PCT = /^\(?(\d+(?:\.\d+)?)%\)?$/;

export function splitRow(text) {
  const tokens = text.trim().split(/\s+/);
  const tail = [];
  let k = tokens.length - 1;
  for (; k >= 0; k--) {
    const t = tokens[k];
    const m = t.match(NUM), p = t.match(PCT);
    if (m) tail.unshift({ value: +m[1].replace(/,/g, ''), raw: t, decimals: (m[1].split('.')[1] ?? '').length, neg: /^-|-$|^\(/.test(t) });
    else if (p) tail.unshift({ value: +p[1], raw: t, pct: true });
    else if (FILLER.test(t)) continue;
    else break;
  }
  // A leading serial number ("1 2 Core Wire", "3 BEEF ROAST") is not part of the name.
  const nameTokens = tokens.slice(0, k + 1);
  return { name: nameTokens.join(' '), tail };
}

// Quantities are whole numbers ("2", "2.00") or 3-decimal weights ("1.328"); "0.58" is a price.
const isQtyLike = n => !n.pct && n.value > 0 && n.value <= 1000 && (n.decimals === 0 || /\.0+$/.test(n.raw) || n.decimals === 3);

// Header roles, read right-to-left so wide tables (… CGST % Amt SGST % Amt Total) line up from the amount.
// (OCR spellings too: "Oty", "Vaiue", "Anount".)
const ROLE_WORDS = [
  ['amount', /^(amount|amt|total|value|net(\s*amt)?|line\s*total|ext|subtotal|sub\s*total|vaiue|anount|amouht)$/i],
  ['qty', /^(qty\.?|qnty|quantity|qty\(s\)|nos|pcs|q|oty|qly|qtv)$/i],
  ['rate', /^(rate|price|mrp|cost|unit\s*price|u\.?\s*price|s\/price|unit\s*rate|price\s*per\s*unit|each)$/i],
  ['disc', /^(disc\.?|discount|less)$/i],
  ['pct', /^(%|gst\s*%|tax\s*\(%\)|tax%)$/i],
  ['tax', /^(tax|gst|cgst|sgst|igst|vat)$/i],
  ['taxable', /^(taxable(\s*value)?|basic\s*amt|net\s*basic)$/i],
];
export function headerRoles(headerText) {
  if (!headerText) return null;
  const words = headerText.replace(/\bunit\s+price\b/ig, 'unitprice').replace(/\bprice\s+per\s+unit\b/ig, 'unitprice').split(/\s+/);
  const roles = [];
  for (const w of words) {
    // "Price(RM)", "Amount(INR)", "Qty." → the bare word
    const word = w.replace(/unitprice/i, 'unit price').replace(/\((rm|rs\.?|inr|₹|\$|usd|eur)\)/i, '').replace(/[:.]+$/, '');
    const r = ROLE_WORDS.find(([, re]) => re.test(word))?.[0];
    if (r) roles.push(r);
  }
  if (!roles.length) return null;
  // The last money column is the line amount even when it's headed "Price" ("Item Qty Price(RM)").
  if (!roles.includes('amount') && roles.at(-1) === 'rate') roles[roles.length - 1] = 'amount';
  return roles;
}

// Decides qty / unit price / amount for one row.
//   rates: tax percentages seen on the receipt, for amounts that include tax
export function parseRow(text, { roles = null, rates = [] } = {}) {
  const { name, tail } = splitRow(text);
  const nums = tail.filter(n => !n.pct);
  if (!nums.length) return { name, tail, amount: null };
  const amountTok = nums[nums.length - 1];
  const a = amountTok.value;
  const pcts = tail.filter(n => n.pct).map(n => n.value);
  const candidatesRates = [...new Set([...pcts, ...rates, 5, 12, 18, 28])];
  const tol = Math.max(0.011, a * 0.0015);
  let best = null;
  const consider = (score, fields) => { if (!best || score > best.score) best = { score, ...fields }; };
  const before = nums.slice(0, -1);
  // Which token the column headings say is the quantity (headings matched from the right).
  let headedQty = null;
  if (roles?.length) {
    for (let t = tail.length - 1, c = roles.length - 1; t >= 0 && c >= 0; t--, c--) {
      if (roles[c] === 'pct' && !tail[t].pct) { c--; if (c < 0) break; }
      if (roles[c] === 'qty') { headedQty = tail[t]; break; }
    }
  }
  // Handwritten / free-form rows put the quantity inside the description:
  // "Wash & Fold 9 GARMENTS 17 153", "Garments -06 20 120". Only used when it multiplies out.
  for (const m of name.matchAll(/(?<![\w.])-?(\d{1,3})(?![\w.%])/g)) {
    const q = +m[1];
    if (!q) continue;
    for (const r of before) if (close(q * r.value, a, tol)) return { name, tail, amount: a, qty: q, unit_price: r.value, confirmed: 'qty-in-name×rate' };
  }
  for (let i = 0; i < before.length; i++) {
    for (let j = 0; j < before.length; j++) {
      if (i === j) continue;
      const q = before[i], r = before[j];
      if (!isQtyLike(q)) continue;
      const qr = q.value * r.value;
      // Prefer: integer qty, qty printed before rate, qty smaller than rate.
      // In "90.00 2 180.00" both 90×2 and 2×90 work. The column headings decide when they can;
      // otherwise a bare whole number ("2", "31") beats "2.00", then the smaller value.
      const prefer = (q === headedQty ? 2 : 0) + (q.decimals === 0 ? 1.2 : /\.0+$/.test(q.raw) ? 0.4 : 0) + (q.value <= r.value ? 0.5 : 0) + (i < j ? 0.3 : 0);
      if (close(qr, a, tol)) { consider(3 + prefer, { qty: q.value, unit_price: r.value, confirmed: 'qty×rate' }); continue; }
      // Line discount printed in the row (absolute or %).
      for (let k = 0; k < before.length; k++) {
        if (k === i || k === j) continue;
        if (close(qr - before[k].value, a, tol)) consider(2.5 + prefer, { qty: q.value, unit_price: r.value, discount: -before[k].value, confirmed: 'qty×rate−disc' });
      }
      for (const p of pcts) if (close(qr * (1 - p / 100), a, tol)) consider(2.5 + prefer, { qty: q.value, unit_price: r.value, discount: -round2(qr * p / 100), confirmed: 'qty×rate−%' });
      // Amount includes tax (209 × 1.05, or 2 × 30 × 1.05).
      for (const p of candidatesRates) if (p > 0 && close(qr * (1 + p / 100), a, Math.max(tol, 0.02))) consider(2 + prefer, { qty: q.value, unit_price: r.value, confirmed: `qty×rate+${p}%` });
    }
  }
  // Qty 1 implied: "rate amount" equal, or rate plus tax.
  if (!best && before.length) {
    const r = before[before.length - 1];
    if (close(r.value, a, tol) && !(r === amountTok)) consider(1.5, { qty: 1, unit_price: r.value, confirmed: 'rate=amount' });
    // The qty itself went missing ("Cream Of  99.00  198.00"): amount ÷ rate is a clean whole number.
    else if (r.decimals > 0 && r.value > 0) {
      const ratio = a / r.value, q = Math.round(ratio);
      if (q >= 2 && q <= 100 && close(q * r.value, a, 0.011)) consider(1.2, { qty: q, unit_price: r.value, confirmed: 'amount÷rate' });
    }
  }
  if (best) return { name, tail, amount: a, ...best };

  // qty × rate one digit away from the printed amount ("69.00 1 63.00"): likely an OCR
  // misread of the amount. Reported as an alternative; the receipt total decides.
  for (const q of before) for (const r of before) {
    if (q === r || !isQtyLike(q) || q.decimals > 0 && !/\.0+$/.test(q.raw)) continue;
    const qr = round2(q.value * r.value);
    const x = qr.toFixed(2), y = a.toFixed(2);
    if (x.length === y.length && [...x].filter((c, i) => c !== y[i]).length === 1) return { name, tail, amount: a, qty: q.value, unit_price: r.value, altAmount: qr, confirmed: null };
  }

  // No arithmetic: use the column headings, matched from the right (amount is the last column).
  if (roles?.length) {
    const r = [...roles];
    const map = {};
    for (let t = tail.length - 1, c = r.length - 1; t >= 0 && c >= 0; t--, c--) {
      if (r[c] === 'pct' && !tail[t].pct) { c--; if (c < 0) break; }
      map[r[c]] ??= tail[t];
    }
    const qtyTok = map.qty && isQtyLike(map.qty) ? map.qty : null;
    return { name, tail, amount: (map.amount ?? amountTok).value, qty: qtyTok?.value ?? null, unit_price: map.rate?.value ?? null, confirmed: qtyTok ? 'columns' : null };
  }
  return { name, tail, amount: a };
}
