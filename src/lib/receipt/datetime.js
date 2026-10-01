// Vendored from receipt_test@8125280 , bench/lib/datetime.js. Keep in sync with that repo; avoid local edits.
// Date and time of a receipt from its OCR lines.
//
// Every date/time-looking string becomes a candidate; candidates are scored by
// their label ("Bill Date", "Time"), position, and agreement with each other
// (a date and a time on the same line usually belong together). Ambiguous
// numeric dates (03/06/2016) are resolved by, in order: a weekday printed next
// to it, other unambiguous dates on the same receipt, then the currency's
// regional convention (US$ → month first, otherwise day first).

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// "Date" also as OCR commonly garbles it on forms: Dare, Dale, Dafe, Oate.
const DATE_LABEL = /\b(bill|invoice|inv|receipt|txn|transaction|order|purchase|sale|doc(ument)?)?\s*(date|dated|dt|dare|dale|dafe|oate|dat)\b|\bdatum\b|\bfecha\b|\bdate\s*&\s*time\b/i;
const TIME_LABEL = /\b(time|tm|zeit|hora)\b/i;
// Dates that are not the transaction date: due, expiry, delivery / pick-up notes, birth dates…
const WEAK_LABEL = /\b(due|expir\w*|valid|deliver\w*|delinen\w*|pick\s*up|special\s*note|note|return|warranty|from|till|until|birth|dob|mfg|exp)\b/i;

const pad = n => String(n).padStart(2, '0');
const fullYear = y => (y < 100 ? 2000 + y : y);
const thisYear = new Date().getFullYear();
const okYear = y => y >= 1990 && y <= thisYear + 1;
const okDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate();
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const weekday = (y, m, d) => WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];

// OCR glues things together: "26-06-201813:37:55", "1/31/202606:13PM", "2024@20:12".
function unglue(text) {
  return text
    .replace(/(\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2})(?=\d{1,2}[:.]\d{2})/g, '$1 ')
    .replace(/(\d{1,2}[:.]\d{2})(?=[AaPp][Mm]\b)/g, '$1 ')
    .replace(new RegExp(String.raw`\b${MON}([a-z]*\.?\s+)(\d{1,2})((?:19|20)\d{2})\b`, 'gi'), '$1$2$3 $4') // "Jul 142024"
    .replace(/@/g, ' @ ');
}

// All date candidates on one line: { y, m, d } or ambiguous { a, b, y }.
function dateCandidates(text) {
  const out = [];
  let m;
  const re = [
    // 2024-08-08, 2024/8/8
    [new RegExp(String.raw`(?<!\d)((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)`, 'g'), m => ({ y: +m[1], m: +m[2], d: +m[3] })],
    // 15 July 2025, 17th May, 2023, 31-Dec-25, 22 MAR 2018
    [new RegExp(String.raw`(?<!\d)(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*${MON}[a-z]*\.?[\s\-/.,]*'?(\d{4}|\d{2})(?!\d)`, 'gi'), m => ({ y: fullYear(+m[3]), m: MONTHS[m[2].slice(0, 3).toLowerCase()], d: +m[1] })],
    // October 14, 2022 / Jul 14 2024
    [new RegExp(String.raw`\b${MON}[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)`, 'gi'), m => ({ y: +m[3], m: MONTHS[m[1].slice(0, 3).toLowerCase()], d: +m[2] })],
    // 21/07/24, 1.8.23, 06/01/2016, 21-7-2024
    // (a ":" before is fine , "Date:21-7-2024" , unless it follows a digit, i.e. a time)
    [/(?<!\d)(?<!\d[./-])(?<!\d:)(\d{1,2})\s?([-/.])\s?(\d{1,2})\2\s?(\d{4}|\d{2})(?![\d:]|\.\d)/g, m => ({ a: +m[1], b: +m[3], y: fullYear(+m[4]), numeric: true })],
    // Handwritten mixes separators ("27-09.2026"); only trusted with a full 19xx/20xx year.
    [/(?<!\d)(?<!\d[./-])(?<!\d:)(\d{1,2})\s?([-/.])\s?(\d{1,2})(?!\2)[-/.]\s?((?:19|20)\d{2})(?![\d:])/g, m => ({ a: +m[1], b: +m[3], y: +m[4], numeric: true })],
    // Year cut off by the photo edge / OCR ("11.08.202"): completed from other dates on the receipt.
    [/(?<!\d)(?<!\d[./-])(?<!\d:)(\d{1,2})([-/.])(\d{1,2})\2((?:19|20)\d)(?!\d)/g, m => ({ a: +m[1], b: +m[3], yPrefix: m[4], numeric: true })],
  ];
  for (const [rx, fn] of re) {
    rx.lastIndex = 0;
    while ((m = rx.exec(text))) out.push({ ...fn(m), raw: m[0].trim(), index: m.index });
  }
  return out;
}

// Times on one line: 22:08, 09:10 PM, 13:29:17, 15:10 hrs, 1.25 PM.
function timeCandidates(text) {
  const out = [];
  const rx = /(?<![\d.])(?<!\d:)([01]?\d|2[0-3])\s?([:.])\s?([0-5]\d)(?:\2([0-5]\d))?(?:\s*([AaPp])\.?\s?[Mm]\.?\b)?(\s*hrs?\b)?(?![\d])/g;
  let m;
  while ((m = rx.exec(text))) {
    const [, hh, sep, mm, ss, ap, hrs] = m;
    // "12.50" is far more likely money than a time: dots need seconds, AM/PM or "hrs".
    if (sep === '.' && !ss && !ap && !hrs) continue;
    let h = +hh;
    if (ap) {
      if (h < 1 || h > 12) continue;
      const pm = /p/i.test(ap);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    out.push({ h, m: +mm, s: ss != null ? +ss : null, ampm: !!ap, hrs: !!hrs, raw: m[0].trim(), index: m.index });
  }
  return out;
}

const regionalDayFirst = currency => !/^(USD)$/.test(currency ?? '') ;

export function extractDateTime(lines, { currency } = {}) {
  const pageBottom = Math.max(1, ...lines.map(l => l.cy ?? 0));
  const dates = [], times = [];
  lines.forEach((l, i) => {
    const text = unglue(l.text);
    const statusBar = l.tag === 'ignore' && (l.cy ?? 0) < pageBottom * 0.05;
    const labelled = DATE_LABEL.test(text);
    const weak = WEAK_LABEL.test(text);
    // "03/06/2016 05:25 PM EXPIRES 06/04/16": "expires" only weakens the date after it.
    const cands = dateCandidates(text).sort((a, b) => a.index - b.index);
    cands.forEach((c, k) => {
      const before = text.slice(k ? cands[k - 1].index + cands[k - 1].raw.length : 0, c.index);
      c.weakHere = WEAK_LABEL.test(before) || (k === 0 && weak && !cands.slice(1).length);
    });
    for (const c of cands) {
      dates.push({ ...c, line: i, text, labelled, weak: c.weakHere, statusBar });
      // Right after a date, "16 00 19" is a time whose colons OCR dropped.
      const after = text.slice(c.index + c.raw.length).match(/^\s+([01]?\d|2[0-3])\s([0-5]\d)(?:\s([0-5]\d))?\b/);
      if (after) times.push({ h: +after[1], m: +after[2], s: after[3] != null ? +after[3] : null, raw: after[0].trim(), index: 0, line: i, labelled: true, statusBar, at: false });
    }
    for (const t of timeCandidates(text)) {
      // A time that is really part of a phone number / ID ("0674-23:01") is rare; skip when digits touch.
      times.push({ ...t, line: i, labelled: TIME_LABEL.test(text) || labelled, statusBar, at: /@\s*$/.test(text.slice(0, t.index)) });
    }
  });

  // Complete truncated years from a full year seen elsewhere on the receipt; drop them otherwise.
  const fullYears = dates.filter(c => c.y && !c.yPrefix).map(c => String(c.y));
  for (let k = dates.length - 1; k >= 0; k--) {
    const c = dates[k];
    if (!c.yPrefix) continue;
    const y = fullYears.find(y => y.startsWith(c.yPrefix));
    if (y) c.y = +y; else dates.splice(k, 1);
  }
  // A bare date on its own line takes the meaning of the label line next to it ("Special Note:" / "15.08.2026").
  for (const c of dates) {
    if (c.labelled || c.weak || /[a-z]{3}/i.test(c.text.replace(c.raw, ''))) continue;
    const near = [lines[c.line - 1], lines[c.line + 1]].filter(Boolean).map(l => l.text);
    if (near.some(t => WEAK_LABEL.test(t) && !/\d/.test(t))) c.weak = true;
  }

  // Day-first or month-first? Weekday next to the date, else other dates on the receipt, else region.
  const unambiguous = dates.filter(c => c.numeric && (c.a > 12) !== (c.b > 12));
  const receiptDayFirst = unambiguous.length ? unambiguous.filter(c => c.a > 12).length >= unambiguous.length / 2 : regionalDayFirst(currency);
  const resolved = [];
  for (const c of dates) {
    let opts;
    if (!c.numeric) opts = [{ y: c.y, m: c.m, d: c.d }];
    else {
      const dm = { y: c.y, m: c.b, d: c.a }, md = { y: c.y, m: c.a, d: c.b };
      opts = [dm, md].filter(o => okDay(o.y, o.m, o.d));
      if (opts.length === 2) {
        const wd = c.text.toLowerCase().match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
        const byWeekday = wd ? opts.filter(o => weekday(o.y, o.m, o.d) === wd[1]) : [];
        opts = byWeekday.length === 1 ? byWeekday : [receiptDayFirst ? dm : md];
      }
    }
    const o = opts.find(o => okYear(o.y) && okDay(o.y, o.m, o.d));
    if (o) resolved.push({ ...c, value: iso(o.y, o.m, o.d) });
  }

  const timeOnLine = new Set(times.filter(t => !t.statusBar).map(t => t.line));
  const scoreDate = c => (c.labelled ? 3 : 0) - (c.weak ? 3 : 0) - (c.statusBar ? 10 : 0)
    + (timeOnLine.has(c.line) || timeOnLine.has(c.line + 1) ? 1.5 : 0)
    + (c.numeric ? 0 : 0.5)             // spelled-out months are rarely anything else
    - c.line / Math.max(10, lines.length) // earlier is likelier (header)
    - (/\bprint/i.test(c.text) ? 0.5 : 0);
  // A due / delivery / expiry date is never the transaction date: better no date than that one.
  const usable = resolved.filter(c => !c.weak || c.labelled);
  usable.sort((a, b) => scoreDate(b) - scoreDate(a));
  const date = usable[0] ?? null;

  const scoreTime = t => (t.labelled ? 2 : 0) - (t.statusBar ? 10 : 0)
    + (date && t.line === date.line ? 3 : date && Math.abs(t.line - date.line) === 1 ? 1.5 : 0)
    + (t.ampm || t.hrs ? 1 : 0) + (t.s != null ? 0.5 : 0) + (t.at ? 1 : 0)
    - t.line / Math.max(10, lines.length);
  const ranked = times.filter(t => !t.statusBar).sort((a, b) => scoreTime(b) - scoreTime(a));
  const time = ranked[0] ?? null;

  return {
    date: date?.value ?? null,
    date_raw: date?.raw ?? null,
    time: time ? `${pad(time.h)}:${pad(time.m)}${time.s != null ? ':' + pad(time.s) : ''}` : null,
    time_raw: time?.raw ?? null,
  };
}
