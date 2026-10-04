// src/lib/txnList.js
// Reads a *list* of transactions (a GPay / PhonePe / Paytm / bank app history screenshot, or a
// bank statement PDF) into separate entries. Input is text lines in reading order, optionally
// with where the line ends horizontally (0..1), which tells right-aligned amounts apart from
// numbers inside names. Pure: no DOM, no OCR.
//
// Layouts it understands:
//   GPay      "Swiggy            ₹245" / "12 Sep"                 (name + amount, date below)
//   PhonePe   "Paid to           ₹250" / "Rahul Kumar" / "12 Sep 2026  Debited from"
//   Paytm     "Paid to Swiggy  - Rs.245" / "12 Sep, 8:30 PM"
//   Sections  "12 September" / "Swiggy ₹245" / "Zomato ₹380" / "11 September" / ...
//   Statement "12/09/2026  UPI/DR/1234/SWIGGY/YESB  245.00  10,234.56"  (amount, then balance)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;

const CURRENCY_OF = { '₹': 'INR', rs: 'INR', inr: 'INR', $: 'USD', '€': 'EUR', '£': 'GBP' };
// Currency-marked amount, with an optional sign before or after the symbol. OCR often reads the
// rupee sign as "?", "%" or "z" when it sits right before the digits.
const AMOUNT_RE = /(?<sign>[+\-−–])?\s*(?<cur>₹|rs\.?|inr|\$|€|£|(?<![a-z0-9])[?%z](?=\d))\s*(?<sign2>[+\-−–])?\s*(?<num>\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d%])/gi;
// Plain decimal amounts ("245.00", "10,234.56"): statements print no currency sign.
const DECIMAL_RE = /(?<![\d.,:/])(?<sign>[+\-−–])?(?<num>\d{1,3}(?:,\d{2,3})+\.\d{2}|\d+\.\d{2})(?![\d%])(?:\s*(?<crdr>cr|dr)\b)?/gi;

const CREDIT = /\b(received|credited|refund(ed)?|cash\s*back|reversed|money added|added to|deposit(ed)?|\bcr\b)/i;
const DEBIT = /\b(paid|sent|debited|spent|purchase|payment to|withdrawn|\bdr\b)/i;
const FAILED = /\b(failed|declined|cancelled|canceled|pending|processing|unsuccessful)\b/i;
// Whole lines that are app chrome or account details, never a transaction or its name.
const NOISE = /^(transaction history|transactions|history|search|filter|filters|sort|download statement|show more|view details|completed|successful|success|paid|received|debited from|credited to|upi id|upi ref\.? no|upi transaction id|bank|balance|available balance|statement|this month|today|yesterday|all|sent|money|passbook|spends?|payments?)\s*[:.]?$/i;
const NOT_A_TOTAL = /\b(total|balance|available|spent this month|net (spends|amount)|opening|closing)\b/i;
// Labels in front of a name ("Paid to Swiggy"): direction cue, not part of the name.
const LABEL = /^\s*(paid\s*to|sent\s*to|payment\s*to|transfer(red)?\s*to|received\s*from|money\s*received\s*from|money\s*sent\s*to|refund\s*from|cashback\s*from|to|from)\b[\s:]*/i;

const pad = (n) => String(n).padStart(2, '0');
const toNumber = (s) => parseFloat(String(s).replace(/,/g, ''));

/**
 * Finds a date in `text`. Day-month order (Indian apps); a date without a year gets the most
 * recent year that doesn't put it in the future.
 * @returns {{ date: Date, start: number, end: number } | null}
 */
export function findDate(text, now = new Date()) {
  const t = String(text);
  const build = (y, m, d, start, end) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    let year = y;
    if (year == null) {
      year = now.getFullYear();
      if (new Date(year, m - 1, d) > new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) year--;
    } else if (year < 100) year += 2000;
    const date = new Date(year, m - 1, d, 12);
    if (date.getMonth() !== m - 1) return null;
    return { date, start, end };
  };
  let m;
  if ((m = /\b(today)\b/i.exec(t))) return { date: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), start: m.index, end: m.index + m[0].length };
  if ((m = /\b(yesterday)\b/i.exec(t))) return { date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12), start: m.index, end: m.index + m[0].length };
  // 2026-09-12
  if ((m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(t))) return build(+m[1], +m[2], +m[3], m.index, m.index + m[0].length);
  // 12/09/2026, 12-09-26, 12.09.2026
  if ((m = /(?<![\d:])(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?![\d:])/.exec(t))) return build(+m[3], +m[2], +m[1], m.index, m.index + m[0].length);
  // 12 Sep 2026, 12 Sept, 12th September '26
  if ((m = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s*[-\s]?\s*${MON}(?:[\s,'-]*((?:19|20)\d{2}|'\d{2}))?`, 'i').exec(t))) {
    const y = m[3] ? +m[3].replace("'", '') : null;
    return build(y, MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1], m.index, m.index + m[0].length);
  }
  // Sep 12, 2026
  if ((m = new RegExp(String.raw`\b${MON}\s*(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*((?:19|20)\d{2}))?`, 'i').exec(t))) {
    return build(m[3] ? +m[3] : null, MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2], m.index, m.index + m[0].length);
  }
  return null;
}

/** Currency-marked amounts on a line (left to right). */
function markedAmounts(text) {
  const out = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const g = m.groups;
    const sign = g.sign || g.sign2 || '';
    const cur = g.cur.toLowerCase().replace('.', '');
    out.push({
      value: toNumber(g.num),
      sign: sign === '+' ? '+' : sign ? '-' : '',
      currency: CURRENCY_OF[cur] || CURRENCY_OF[g.cur] || 'INR',
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

function decimalAmounts(text) {
  const out = [];
  for (const m of text.matchAll(DECIMAL_RE)) {
    const g = m.groups;
    out.push({ value: toNumber(g.num), sign: g.sign === '+' ? '+' : g.sign ? '-' : '', crdr: g.crdr?.toLowerCase() || null, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** "UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl" → "SWIGGY". */
function statementName(desc) {
  const parts = desc.split(/[/|\\]+/).map((s) => s.trim()).filter(Boolean);
  const skip = /^(upi|imps|neft|rtgs|pos|atm|ach|nach|ecs|txn|ref|dr|cr|mob|ib|bil|onl|net|inb|p2a|p2m|to|from|transfer|payment|yesb|hdfc|icic|sbin|utib|kkbk|pytm|axis)$/i;
  const named = parts.filter((p) => /[a-z]{3,}/i.test(p) && !skip.test(p) && !/@/.test(p) && !/^\d+$/.test(p));
  return (named[0] || desc).replace(/\b\d{6,}\b/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Text left once amounts, dates, labels and status words are removed. */
function nameOf(text) {
  const t = String(text || '')
    .replace(LABEL, '')
    .replace(/\b(debited from|credited to|successful|completed|failed|pending|declined)\b.*$/i, '')
    .replace(/\b\d{1,2}[:.]\d{2}\s*(am|pm)?\b/gi, '')
    .replace(/[•·|]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[,:\-–\s]+|[,:\-–\s]+$/g, '');
  if (!/[\p{L}]{2,}/u.test(t) || NOISE.test(t)) return '';
  if (/^(xx+|\*+)\s*\d{3,4}$/i.test(t) || /@[a-z]/i.test(t) && !/\s/.test(t)) return ''; // account mask / bare UPI ID
  return t.slice(0, 80);
}

const strip = (text, ...ranges) => {
  let out = text;
  for (const r of ranges.filter(Boolean).sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + ' ' + out.slice(r.end);
  return out;
};

/**
 * @param lines [{ text, right?: 0..1 }] or plain strings, in reading order
 * @returns [{ title, amount, currency, direction: 'debit'|'credit'|null, date: Date|null, failed, line }]
 */
export function parseTransactionList(lines, { now = new Date() } = {}) {
  const rows = lines.map((l) => (typeof l === 'string' ? { text: l } : l)).map((l) => ({ ...l, text: String(l.text || '').replace(/\s+/g, ' ').trim() }));
  const txs = [];

  // Bank statements: rows that start with a date and end with amount + running balance.
  const stmt = rows
    .map((r, i) => ({ r, i, d: findDate(r.text, now), amts: decimalAmounts(r.text) }))
    .filter((x) => x.d && x.d.start <= 2 && x.amts.length >= 2);
  if (stmt.length >= 3 && stmt.length >= rows.filter((r) => decimalAmounts(r.text).length).length * 0.6) {
    let prevBalance = null;
    for (const { r, i, d, amts } of stmt) {
      const bal = amts.at(-1);
      const amt = amts.at(-2);
      const desc = strip(r.text, d, ...amts).replace(/\s{2,}/g, ' ').trim();
      let direction = null;
      if (prevBalance != null) {
        const delta = Math.round((bal.value - prevBalance) * 100) / 100;
        if (Math.abs(delta + amt.value) < 0.02) direction = 'debit';
        else if (Math.abs(delta - amt.value) < 0.02) direction = 'credit';
      }
      if (!direction) direction = amt.crdr === 'cr' || CREDIT.test(desc) ? 'credit' : amt.crdr === 'dr' || DEBIT.test(desc) ? 'debit' : null;
      prevBalance = bal.value;
      txs.push({ title: statementName(desc) || 'Transaction', amount: amt.value, currency: null, direction, date: d.date, failed: FAILED.test(r.text), line: i });
    }
    return txs;
  }

  // App history screens.
  const dateOnly = (r, d) => d && !nameOf(strip(r.text, d)) && !markedAmounts(r.text).length;
  const firstAmount = rows.findIndex((r) => amountOn(r));
  const firstDateOnly = rows.findIndex((r) => dateOnly(r, findDate(r.text, now)));
  // Dates printed above each day's entries (section headers) vs. under each entry.
  const headerDates = firstDateOnly !== -1 && (firstAmount === -1 || firstDateOnly < firstAmount);

  let cur = null;
  let curAt = -1;
  let section = null;
  let pending = []; // text lines since the last entry (a name printed above its amount)

  for (const [i, r] of rows.entries()) {
    if (!r.text) continue;
    if (NOT_A_TOTAL.test(r.text) && amountOn(r)) continue; // "Total spent ₹2,345", balances
    const d = findDate(r.text, now);
    const a = amountOn(r);
    if (a) {
      const rest = strip(r.text, a, d);
      const cueText = `${r.text} ${pending.join(' ')}`;
      cur = {
        title: nameOf(rest) || nameOf(pending.at(-1)) || '',
        amount: a.value,
        currency: a.currency || null,
        direction: a.sign === '+' || (!a.sign && CREDIT.test(cueText) && !DEBIT.test(r.text)) ? 'credit' : a.sign === '-' || DEBIT.test(cueText) ? 'debit' : null,
        date: d?.date || (headerDates ? section : null),
        failed: FAILED.test(r.text),
        line: i,
      };
      txs.push(cur);
      curAt = i;
      pending = [];
      continue;
    }
    if (d && dateOnly(r, d)) {
      if (headerDates) section = d.date;
      else if (cur && !cur.date && i - curAt <= 3) cur.date = d.date;
      else section = d.date;
      if (cur && FAILED.test(r.text)) cur.failed = true;
      continue;
    }
    if (cur && i - curAt <= 3) {
      // Lines under an entry: its name (PhonePe), date + status, or "Debited from …".
      if (d && !cur.date) cur.date = d.date;
      if (FAILED.test(r.text)) cur.failed = true;
      if (!cur.direction && CREDIT.test(r.text)) cur.direction = 'credit';
      if (!cur.direction && DEBIT.test(r.text)) cur.direction = 'debit';
      const nm = nameOf(d ? strip(r.text, d) : r.text);
      if (!cur.title && nm) {
        cur.title = nm;
        continue;
      }
    }
    const nm = nameOf(r.text);
    if (nm) pending.push(r.text);
  }

  for (const t of txs) if (!t.title) t.title = t.direction === 'credit' ? 'Money received' : 'Payment';
  return txs;

  /** The entry's amount on a line: a currency-marked one, else a right-aligned decimal. */
  function amountOn(r) {
    const marked = markedAmounts(r.text).filter((x) => x.value > 0);
    if (marked.length) return marked.at(-1);
    if (r.right != null && r.right < 0.75) return null;
    const dec = decimalAmounts(r.text).filter((x) => x.value > 0 && x.end >= r.text.length - 3);
    return dec.length ? { ...dec.at(-1), currency: null } : null;
  }
}

/** Same transaction read twice (overlapping screenshots): same amount, day and name. */
export function dedupeTransactions(txs) {
  const seen = new Set();
  const key = (t) => [t.amount.toFixed(2), t.date ? `${t.date.getFullYear()}-${pad(t.date.getMonth() + 1)}-${pad(t.date.getDate())}` : '', t.title.toLowerCase().replace(/[^a-z0-9]/g, '')].join('|');
  return txs.filter((t) => {
    const k = key(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
