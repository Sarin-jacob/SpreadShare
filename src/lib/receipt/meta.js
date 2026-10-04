// Vendored from receipt_test@b9dd94a , bench/lib/meta.js. Keep in sync with that repo; avoid local edits.
// Everything else a receipt prints about itself: merchant contact details and
// registration numbers, the document number, table / cashier / terminal,
// payment details, and the printed item / quantity counts.
//
// Works on the solver's tagged lines. Customer details ("Bill To", "Customer",
// "Name:" blocks) are kept out of the merchant fields.

const LABELLED = (labels, value) => new RegExp(String.raw`(?<![a-z])(?:${labels})\s*[.:#-]*\s*(?:no\.?|number|num|#)?\s*[.:#-]*\s*(${value})`, 'i');

// Document numbers, most specific first.
const DOC_NUMBERS = [
  ['invoice', String.raw`tax\s*invoice\s*no|invoice\s*(?:no|number|num|#)|inv\.?\s*(?:no|#)|invoice`],
  ['bill', String.raw`bill\s*(?:no|number|#)|bill`],
  ['receipt', String.raw`receipt\s*(?:no|number|#)|rcpt\s*(?:no|#)|rech\.?\s*nr|recibo|reçu`],
  ['challan', String.raw`challan\s*(?:no|number|#)?`],
  ['order', String.raw`order\s*(?:no|number|id|#)|order`],
  ['transaction', String.raw`transaction\s*(?:no|number|id|#)?|trans\.?\s*(?:no|id|#)|txn\s*(?:no|id|#)?`],
  ['ticket', String.raw`ticket\s*(?:no|#)|token\s*(?:no|#)?`],
  // "# : SI3-0272" (a bare # label at the start of a line)
  ['number', String.raw`^\s*#`],
  // Bare "No: 459", but not Phone No / GST No / Table No / T.No / W.No / KOT No …
  ['number', String.raw`(?<!(?:phone|ph|mob|mobile|gst|gstin|table|tbl|tin|vat|fssai|sac|hsn|pan|cin|contact|tel|fax|kot|ref|plot|shop|unit|flat|house|room|seat|lic|t|w|s|c|p|sr|sl|si|serial|item|account|a\/c|acc)\.?\s*)no`],
];
// A document number: has a digit, may contain letters / - / _ / . (and "/" for "3/T/3").
const DOC_VALUE = String.raw`(?:[A-Z0-9][A-Z0-9/_.-]*\d[A-Z0-9/_.-]*|\d[A-Z0-9/_.-]*)(?:\s+\/\s+[A-Z0-9][A-Z0-9-]*\d)?`;

// Registration numbers. GSTIN: 2 digits + PAN (5 letters, 4 digits, 1 letter) + 3 chars.
const IDS = [
  ['GSTIN', String.raw`gstin(?:\s*/\s*uin)?|gst\s*(?:in|no|number|reg(?:istration)?\s*no)?|gst`, String.raw`\d{2}[A-Z0-9]{10}[0-9A-Z]{3}`],
  ['PAN', String.raw`pan(?:\s*no)?`, String.raw`[A-Z]{5}\d{4}[A-Z]`],
  ['FSSAI', String.raw`fssai(?:\s*lic(?:ense|ence)?)?(?:\s*no)?`, String.raw`\d{14}`],
  ['CIN', String.raw`cin(?:\s*no)?`, String.raw`[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}`],
  ['VAT', String.raw`vat\s*(?:tin|no|reg(?:istration)?\s*no|number|id)?|mwst\s*nr|tva|btw\s*nr`, String.raw`[A-Z0-9][A-Z0-9 -]{5,18}[A-Z0-9]`],
  ['TIN', String.raw`tin(?:\s*no)?`, String.raw`\d{8,12}`],
  ['NTN', String.raw`ntn`, String.raw`[0-9-]{7,10}`],
  ['STRN', String.raw`strn`, String.raw`[0-9-]{10,17}`],
  ['ABN', String.raw`abn`, String.raw`\d{2}\s?\d{3}\s?\d{3}\s?\d{3}`],
  ['SST', String.raw`sst\s*(?:id|no|reg(?:istration)?\s*no)?`, String.raw`[A-Z]\d{2}-\d{4}-\d{8}`],
  ['GST ID', String.raw`gst\s*id(?:\s*no)?`, String.raw`\d{12}`],
  ['ROC', String.raw`roc\s*no|co\.?\s*(?:reg\.?\s*)?no|company\s*(?:reg\.?\s*)?no`, String.raw`\d{5,}-?[A-Z]?`],
  ['Service tax', String.raw`s\.?\s*tax\s*no|service\s*tax\s*(?:no|reg)`, String.raw`[A-Z0-9]{10,15}`],
];

const PHONE_LABEL = /(?<![a-z])(ph(?:one)?|tel(?:ephone)?|mob(?:ile)?|cell|contact|call|whats\s*app|fax|helpline|customer\s*care|for\s*booking\s*call)(?![a-z])/i;
// Phone numbers: +CC / leading 0 / bare, 7–13 digits with spaces or dashes.
const PHONE_RE = /(?<![\dA-Z])(\+?\d{1,3}[\s-]?)?(\(?0?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}(?![\d])/g;
const CUSTOMER_BLOCK = /(?<![a-z])(bill(?:ed)?\s*to|invoice\s*to|ship(?:ping)?\s*(?:to|address)|sold\s*to|deliver(?:y)?\s*(?:to|address)|billing\s*address|customer|cust\.?\s*name|buyer|patient|guest\s*name|consignee\s*:|recipient\s*:)(?![a-z])/i;
const PERSON = /(?<![a-z])(cashier|server|steward|waiter|captain|attendant|operator|op|salesperson|sales\s*man|served\s*by|es\s*bediente\s*sie|staff|user|employee|wt|pboy)(?![a-z])\s*[.:#-]*\s*([A-Za-z][A-Za-z .]{1,24}?|\d{2,8})(?=\s{2,}|\s+[A-Z][a-z]+\s*[:.]|$|\s+(?:bill|table|date|time|no)\b)/i;
const TABLE = /(?<![a-z])(table|tbl|tb|t\.?\s*no|tisch|mesa)(?:\s*(?:no|number|#))?\s*[.:#-]*\s*([A-Z]?\d{1,4}[A-Z]?)\b/i;
const TERMINAL = /(?<![a-z])(terminal|term|pos|till|register|counter|m\/c)(?:\s*(?:no|id|#))?\s*[.:#-]*\s*([A-Z0-9-]{1,14})/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const WEBSITE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|net|org|co|io|my|uk|de|ch|app|shop|store)(?:\/\S*)?\b/i;
const ADDRESS_HINT = /(?<![a-z])(road|rd|street|st|marg|lane|ln|nagar|colony|complex|plaza|mall|market|bazar|bazaar|building|bldg|floor|flr|sector|block|plot|shop\s*no|opp|near|behind|chowk|circle|avenue|ave|highway|hwy|jalan|jln|taman|tmn|suite|unit|po\s*box|district|dist|city|state|india|pin(?:code)?|zip)(?![a-z])|\b\d{5,6}\b|,\s*[A-Z][a-z]+/i;
const COUNT = [
  // "TOTAL ITEM(S):15 /QTY:34.000", "Items: 7  Qty: 8", "Tot Items: 11", "Total Qty: 9", "TOTAL ITEMS:2"
  [/(?<![a-z])(?:tot(?:al)?\.?\s*)?(?:no\.?\s*of\s*)?items?(?:\s*\(s\))?\s*(?:count|sold)?\s*[:.-]?\s*(\d{1,4})(?![\d.])/i, 'items'],
  [/(?<![a-z])(?:tot(?:al)?\.?\s*)?(?:qty|quantity|qnty|pcs)\s*[:.-]?\s*(\d{1,5}(?:\.\d{1,3})?)(?![\d])/i, 'qty'],
  // "1/1   Grand Total", "8/19   Total :" on Indian POS slips: items/qty before the total.
  [/^\s*(\d{1,3})\s*\/\s*(\d{1,4})\s+(?=.*total)/i, 'pair'],
];
const PAYMENT_METHODS = [
  ['upi', /(?<![a-z])(upi|bhim|g(?:oogle)?\s*pay|gpay|phone\s*pe|phonepe|paytm|vpa)(?![a-z])/i],
  ['card', /(?<![a-z])(card|visa|master\s*card|mastercard|amex|american\s*express|discover|rupay|maestro|debit|credit|chip|contactless|swiped|tap)(?![a-z])/i],
  ['wallet', /(?<![a-z])(wallet|apple\s*pay|samsung\s*pay|amazon\s*pay|mobikwik|freecharge)(?![a-z])/i],
  ['bank', /(?<![a-z])(neft|rtgs|imps|bank\s*transfer|net\s*banking|paid\s*via\s*bank)(?![a-z])/i],
  ['cash', /(?<![a-z])(cash|tendered|change\s*due)(?![a-z])/i],
];

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const digitsOf = s => String(s ?? '').replace(/\D/g, '');

export function extractMeta(lines, { merchantLine = null, itemStart = lines.length } = {}) {
  // Customer blocks: the label line and the few lines after it (until a blank-ish gap / another label).
  const customer = new Set();
  lines.forEach((l, i) => {
    if (!CUSTOMER_BLOCK.test(l.text)) return;
    customer.add(i);
    for (let k = 1; k <= 5 && i + k < itemStart; k++) {
      const t = lines[i + k].text;
      if (/(?<![a-z])(invoice|bill|date|gstin|table|order)\s*(no|number|date|#|:)/i.test(t) && k > 1) break;
      customer.add(i + k);
    }
  });
  // A left/right split ("Billing Address" | "From:") puts both parties on one line; only drop
  // the customer half of such lines.
  const customerSide = new Map();
  lines.forEach((l, i) => {
    if (!customer.has(i) || !l.boxesX || l.boxesX.length < 2) return;
    const fromIdx = l.boxesX.findIndex(b => /(?<![a-z])(from|supplier|seller|sold\s*by|merchant)(?![a-z])/i.test(b.text));
    if (fromIdx > 0) customerSide.set(i, l.boxesX.slice(0, fromIdx).map(b => b.text).join(' '));
  });
  const textOf = (l, i) => customerSide.has(i) ? l.text.replace(customerSide.get(i), ' ') : customer.has(i) ? '' : l.text;

  const header = lines.slice(0, Math.max(itemStart, 1));
  const out = { address: null, phones: [], email: null, website: null, ids: [], document: {}, people: {}, payment: {}, counts: {} };

  // ---- merchant address: header lines after the name that look like an address.
  if (merchantLine != null) {
    const addr = [];
    for (let i = merchantLine + 1; i < Math.min(header.length, merchantLine + 6); i++) {
      const t = lines[i].text;
      // "(ODVJH Private Limited)", "(Sarjoshi Hospitality Pvt Ltd)": the registered name, not the address.
      if (/(?<![a-z])(pvt|private|limited|ltd|llp|inc|corp|gmbh|sdn\s*bhd)(?![a-z])/i.test(t) && !/\d{3,}/.test(t)) {
        out.legal_name ??= clean(t).replace(/^\(|\)$/g, '');
        continue;
      }
      if (customer.has(i) || PHONE_LABEL.test(t) || /gst|vat|tin|fssai|invoice|bill|date|receipt|table|cashier|e-?mail|www|@/i.test(t)) break;
      if (ADDRESS_HINT.test(t) || (addr.length && /[A-Za-z]{3,}/.test(t) && t.length < 60)) addr.push(clean(t));
      else if (addr.length) break;
    }
    if (addr.length) out.address = addr.join(', ').replace(/\s*,\s*,/g, ',');
  }

  // ---- phones, email, website, registration numbers
  const seenIds = new Set();
  lines.forEach((l, i) => {
    const t = textOf(l, i);
    if (!t) return;
    const labelled = PHONE_LABEL.test(t);
    const inHeader = i < itemStart;
    // Registration-number lines (STRN 03-00-4278-583-10, NTN, GSTIN) look like phones: skip them.
    const idLine = /(?<![a-z])(strn|ntn|gstin|gst\s*no|tin|vat|pan|cin|fssai|reg(?:istration)?\s*no)(?![a-z])/i.test(t) && !labelled;
    // International-format numbers ("+123-456-7890") count anywhere outside customer blocks.
    if (!idLine && !labelled && !(inHeader && i < 12)) {
      for (const m of t.matchAll(/\+\d{1,3}[\s-]?\d[\d\s-]{6,14}\d/g)) {
        const d = digitsOf(m[0]);
        if (d.length >= 8 && d.length <= 14 && !out.phones.some(p => digitsOf(p) === d)) out.phones.push(clean(m[0]));
      }
    }
    if (!idLine && (labelled || (inHeader && i < 12))) {
      const area = labelled ? t.slice(t.search(PHONE_LABEL)) : t;
      // "Tel.: 033 853 67 16": digits in short groups right after the label.
      const grouped = labelled && area.match(/^[a-z .]*[:.]?\s*(\+?\d[\d\s()-]{6,20}\d)/i);
      if (grouped) {
        const d = digitsOf(grouped[1]);
        if (d.length >= 7 && d.length <= 13 && !out.phones.some(p => digitsOf(p) === d)) out.phones.push(clean(grouped[1]));
      }
      for (const m of area.matchAll(PHONE_RE)) {
        const d = digitsOf(m[0]);
        // Lengths of real phone numbers; skip dates, amounts, GSTIN digits, pin codes.
        if (d.length < 7 || d.length > 13) continue;
        if (!labelled && !/^(\+|0|[6-9]\d{9}$)/.test(m[0].trim()) && d.length !== 10) continue;
        if (/\d[./]\d{2}\b/.test(m[0]) || /^\d{6}$/.test(d)) continue;
        if (!out.phones.some(p => digitsOf(p) === d)) out.phones.push(clean(m[0]));
      }
      // "Ph: 24096599, 3204 6447" , short siblings after a comma
      if (labelled) {
        const tail = area.match(/,\s*([\d\s-]{6,12})(?:\s|$)/);
        if (tail && digitsOf(tail[1]).length >= 7 && !out.phones.some(p => digitsOf(p) === digitsOf(tail[1]))) out.phones.push(clean(tail[1]));
      }
    }
    const em = t.match(EMAIL);
    if (em && !out.email) out.email = em[0];
    const web = t.replace(EMAIL, ' ').match(WEBSITE);
    if (web && !out.website && !/\d{2}[./]\d{2}/.test(web[0])) out.website = web[0];
    for (const [type, labels, value] of IDS) {
      const m = t.match(LABELLED(labels, value));
      if (!m) continue;
      const v = m[1].toUpperCase().replace(/\s+/g, '');
      if (seenIds.has(v) || !/\d/.test(v)) continue;
      seenIds.add(v);
      out.ids.push({ type, value: v });
    }
    // Unlabelled GSTIN-shaped strings (OCR lost the label).
    for (const m of t.toUpperCase().matchAll(/(?<![A-Z0-9])(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])(?![A-Z0-9])/g)) {
      if (!seenIds.has(m[1])) { seenIds.add(m[1]); out.ids.push({ type: 'GSTIN', value: m[1] }); }
    }
  });

  // ---- document number, table, people, terminal (header + footer, not customer blocks)
  for (const [kind, labels] of DOC_NUMBERS) {
    if (out.document.number) break;
    const re = LABELLED(labels, DOC_VALUE);
    for (let i = 0; i < lines.length; i++) {
      // Document numbers are not customer data: search the whole line even inside a
      // "Bill To | Invoice No." block, but not after an account / customer number label.
      const t = lines[i].text;
      const m = t.match(re);
      if (!m || /(customer|cust\.?|account|a\/c|mobile|phone|relationship)\s*(no|number|id)?\s*[.:#-]*\s*$/i.test(t.slice(0, m.index))) continue;
      const v = m[1].replace(/[.:-]+$/, '');
      // Not a date, not a money amount, not a phone.
      if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(v) || /^\d+\.\d{2}$/.test(v) || digitsOf(v).length > 18) continue;
      out.document.number = v;
      out.document.number_kind = kind;
      break;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const t = textOf(lines[i], i);
    if (!t) continue;
    if (!out.document.table) { const m = t.match(TABLE); if (m) out.document.table = m[2]; }
    if (!out.document.terminal) { const m = t.match(TERMINAL); if (m && /\d/.test(m[2])) out.document.terminal = m[2]; }
    if (!out.people.staff) { const m = t.match(PERSON); if (m && !/^(no|date|time|bill)$/i.test(m[2].trim())) out.people.staff = clean(m[2]); }
  }

  // ---- payment
  const tail = lines.slice(Math.max(0, itemStart));
  const payText = tail.map(l => l.text).join('\n');
  // Method: a line naming it *with a positive amount* beats one that only lists it ("Credit Card :").
  let bestWeight = 0;
  for (const l of tail) {
    const method = PAYMENT_METHODS.find(([, re]) => re.test(l.text))?.[0];
    if (!method) continue;
    const w = l.amount && l.amount.value > 0 ? 2 : 1;
    if (w > bestWeight) { bestWeight = w; out.payment.method = method; }
  }
  const last4 = payText.match(/(?:[x*•#]{4,}[\s-]*){1,3}(\d{4})\b|(?:ending|last\s*4|no\.?)\s*[:#]?\s*(?:[x*•]+)?\s*(\d{4})\b/i);
  if (last4) out.payment.card_last4 = last4[1] ?? last4[2];
  const brand = payText.match(/(?<![a-z])(visa|master\s*card|mastercard|amex|american\s*express|discover|rupay|maestro|diners)(?![a-z])/i);
  if (brand) out.payment.card_type = brand[1].toUpperCase().replace(/\s+/g, '');
  const vpa = payText.match(/[a-z0-9._-]{2,}@(?:ok)?[a-z]{2,}(?![.\w])/i);
  if (vpa && !EMAIL.test(vpa[0] + '.x')) out.payment.upi_id = vpa[0];
  const ref = payText.match(/(?<![a-z])(?:upi\s*ref|ref(?:erence)?\s*(?:no|#|id)?|rrn|utr|txn\s*id|approval\s*code|auth(?:orization)?\s*code)\s*[.:#-]*\s*([A-Z0-9-]{4,24})/i);
  if (ref && /\d/.test(ref[1])) out.payment.reference = ref[1];

  // ---- printed counts (validate the item list against these)
  for (const l of lines) {
    const t = l.text;
    for (const [re, kind] of COUNT) {
      const m = t.match(re);
      if (!m) continue;
      if (kind === 'items' && out.counts.items == null && !/\d[.,]\d{2}/.test(m[0])) out.counts.items = +m[1];
      if (kind === 'qty' && out.counts.qty == null && /tot|total/i.test(t)) out.counts.qty = +m[1];
      if (kind === 'pair' && out.counts.items == null) { out.counts.items = +m[1]; out.counts.qty = +m[2]; }
    }
    const both = t.match(/items?\s*(?:\(s\))?\s*[:.]?\s*(\d{1,4})\s*[/|,]?\s*(?:tot(?:al)?\.?\s*)?qty\s*[:.]?\s*(\d{1,5}(?:\.\d+)?)/i);
    if (both) { out.counts.items = +both[1]; out.counts.qty = +both[2]; }
  }
  return out;
}
