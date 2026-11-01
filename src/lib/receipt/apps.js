// Vendored from receipt_test@46e67d0 , bench/lib/apps.js. Keep in sync with that repo; avoid local edits.
// App screenshots: food / grocery delivery and shopping apps (Blinkit, Swiggy, Zomato, Zepto…).
// Which app and page it is, and the details those pages print their own way:
//   "Order delivered on January 21, 10:31 PM", "Arrived at 10:47 pm", "placed yesterday, 9:50 PM"
//   (no year, or no date at all), "Order id" with the id on the next line, "4 items in this order".
// Missing date parts come from the screenshot itself: the date in its file name (or the file's
// time) and the phone's clock in the status bar.
// Also a Blinkit-style order decoder: on low-res images "₹90 ₹64" comes out as "79064" (₹ read as
// a digit, struck-out MRP glued to the price). The bill's "Item total" decides how to split them.

const APPS = [
  ['Blinkit', /com\.grofers|blinkit/i],
  ['Swiggy Instamart', /instamart/i],
  ['Swiggy', /in\.swiggy|swiggy/i],
  ['Zomato', /com\.application\.zomato|zomato/i],
  ['Zepto', /zepto/i],
  ['BigBasket', /bigbasket|bbnow/i],
  ['Flipkart', /com\.flipkart|flipkart/i],
  ['Amazon', /in\.amazon|amazon\.(in|com)|amazon\s*(pay|fresh)/i],
  ['JioMart', /jiomart/i],
  ['Uber', /com\.ubercab|uber\s*(eats|auto|go|moto)/i],
  ['Ola', /olacabs/i],
  ['Rapido', /rapido/i],
];
// Brands named on the screen ("Swiggy One", "Zomato Gold"), and Android screenshot names
// ("Screenshot_2025-10-16-23-00-15-621_in.swiggy.android.jpg").
const textApp = (s) =>
  APPS.find(([, re]) => re.test(s))?.[0] ??
  // Blinkit's order summary (its name isn't on it): these three together, plus ORD… ids.
  (/items?\s*in\s*this\s*order/i.test(s) && /download\s*invoice/i.test(s) && /handling\s*charge|rate\s*now|ordered\s*items/i.test(s) ? 'Blinkit' : null);

const ORDER_PAGE = /order\s*(summary|details|#|id\b)|order\s*(delivered|placed)|arrived\s*at|delivered\s*on|bill\s*total/i;
const CART_PAGE = /checkout|place\s*order|slide\s*to\s*pay|to\s*pay|proceed\s*to\s*pay|pay\s*using|add\s*items|items?\s*added|move\s*to\s*wishlist/i;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?`;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Date (and time, when there) in a file name: Screenshot_2025-10-16-22-59-45, IMG_20250416_132657, IMG-20250916-WA0012. */
export function fileNameDate(name) {
  const m = /(20\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?:[-_ T.]?([0-2]\d)[-_.:]?([0-5]\d)(?:[-_.:]?([0-5]\d))?)?/.exec(String(name || ''));
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
  // Pixel camera names (PXL_…) carry UTC times: keep just the date.
  const time = m[4] != null && !/^PXL_/i.test(name) && +m[4] < 24 ? { h: +m[4], mi: +m[5] } : null;
  return { date: new Date(+m[1], +m[2] - 1, +m[3]), time };
}

/** The phone's clock in a screenshot's status bar (first lines): "10:59", "3:17 PM". */
function statusClock(lines) {
  for (const l of lines.slice(0, 2)) {
    const m = /^\D{0,2}(\d{1,2}):(\d{2})(?!\d)\s*([ap]\.?m\.?)?/i.exec(l.text);
    if (m && +m[1] < 24 && +m[2] < 60) return { h: to24(+m[1], m[3]), mi: +m[2] };
  }
  return null;
}
const to24 = (h, ap) => (!ap ? h : /p/i.test(ap) ? (h % 12) + 12 : h % 12);

/** Date / time parts printed on an order line. Year (or the whole date) may be missing. */
export function readOrderTime(text) {
  const t = String(text);
  const out = {};
  const time = /(?<![\d:])(\d{1,2})[:.](\d{2})(?![\d:])\s*([ap]\.?\s?m\.?)?/i.exec(t);
  if (time && +time[1] < 24 && +time[2] < 60) out.time = { h: to24(+time[1], time[3]), mi: +time[2] };
  let m;
  if ((m = new RegExp(String.raw`(?<![a-z\d])(\d{1,2})(?:st|nd|rd|th)?\s*${MONTH}(?:[\s,']*(\d{4}|'?\d{2}))?(?![a-z])`, 'i').exec(t))) {
    out.day = +m[1];
    out.month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (m[3]) out.year = yearOf(m[3]);
  } else if ((m = new RegExp(String.raw`(?<![a-z])${MONTH}\s*(\d{1,2})(?:st|nd|rd|th)?(?![\d:])(?:,?\s*(\d{4}))?`, 'i').exec(t))) {
    out.month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    out.day = +m[2];
    if (m[3]) out.year = +m[3];
  } else if ((m = /(?<![a-z])(today|yesterday)(?![a-z])/i.exec(t))) {
    out.daysAgo = /yes/i.test(m[1]) ? 1 : 0;
  }
  return out;
}
const yearOf = (s) => {
  const n = +String(s).replace(/'/, '');
  return n < 100 ? 2000 + n : n;
};

// Lines that say when the order happened, best first: placed (when you paid), then delivered.
const WHEN_LINES = [
  /(order(ed)?|booking)?\s*placed|ordered\s*on|order\s*date|booked\s*on|paid\s*on/i,
  /delivered\s*(on|at)|order\s*delivered|arrived\s*(on|at)|completed\s*on/i,
];

/**
 * App details of a solved receipt.
 * @param lines solver lines ({ text, tag, idx, boxesX? })
 * @param {{ fileName?: string, fileTime?: number }} hints where the image came from
 * @returns {{ app: string|null, page: 'order'|'cart'|null, date: string|null, time: string|null,
 *   dateFrom: 'screen'|'file'|null, orderId: string|null, printedItems: number|null }}
 */
export function appDetails(lines, hints = {}) {
  const all = lines.map((l) => l.text).join('\n');
  const app = textApp(hints.fileName ?? '') ?? textApp(all);
  const clock = statusClock(lines);
  // Only screenshots count as app pages (a paper bill can say "Order No" / "Bill Total" too).
  const screenshot = !!(clock || app || /screenshot|screen_?shot|scrn/i.test(hints.fileName ?? ''));
  const page = !screenshot ? null : ORDER_PAGE.test(all) ? 'order' : CART_PAGE.test(all) ? 'cart' : null;

  // When the screenshot was taken: file name, else the file's time; the status-bar clock fills in
  // the time when the name has none.
  const named = fileNameDate(hints.fileName);
  const fileTime = hints.fileTime ? new Date(hints.fileTime) : null;
  const ref = named?.date ?? (fileTime && !Number.isNaN(fileTime.getTime()) ? new Date(fileTime.getFullYear(), fileTime.getMonth(), fileTime.getDate()) : null);
  const refTime = named?.time ?? clock ?? (fileTime && !named ? { h: fileTime.getHours(), mi: fileTime.getMinutes() } : null);

  // The order's own date line.
  let when = null;
  for (const re of WHEN_LINES) {
    const i = lines.findIndex((l) => re.test(l.text));
    if (i < 0) continue;
    // "Order placed" heading with the date on the next line.
    const parts = { ...readOrderTime(lines[i + 1]?.text ?? ''), ...readOrderTime(lines[i].text) };
    if (parts.time || parts.day || parts.daysAgo != null) {
      when = parts;
      break;
    }
  }

  let date = null, time = null, dateFrom = null;
  if (when?.time) time = `${pad(when.time.h)}:${pad(when.time.mi)}`;
  if (when?.day && when.month) {
    let y = when.year ?? ref?.getFullYear() ?? null;
    // No year printed: the latest such date that isn't after the screenshot.
    if (y != null && !when.year && ref && new Date(y, when.month - 1, when.day) > new Date(ref.getTime() + 86_400_000)) y--;
    if (y != null) {
      date = `${y}-${pad(when.month)}-${pad(when.day)}`;
      dateFrom = 'screen';
    }
  } else if (ref && when?.daysAgo != null) {
    date = ymd(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - when.daysAgo));
    dateFrom = 'screen';
  } else if (ref && (when?.time || page || app || clock)) {
    // An app page without a calendar date ("Arrived at 10:47 pm", a cart): the screenshot's day,
    // or the day before when that time is later than the clock on the screenshot.
    const later = when?.time && refTime && when.time.h * 60 + when.time.mi > refTime.h * 60 + refTime.mi + 5;
    date = ymd(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - (later ? 1 : 0)));
    dateFrom = 'screen';
  } else if (ref) {
    date = ymd(ref);
    dateFrom = 'file';
  }

  // A cart is ordered as it's screenshotted: its time is the screenshot's.
  if (!time && page === 'cart' && refTime && dateFrom) time = `${pad(refTime.h)}:${pad(refTime.mi)}`;

  // "Order id" / "Order ID:" with the id on the next line.
  let orderId = null;
  const idAt = lines.findIndex((l) => /^\W*order\s*(id|no\.?|number|#)\s*:?\s*$/i.test(l.text));
  if (idAt >= 0) orderId = /^\s*#?\s*([A-Z0-9][A-Z0-9-]{5,})\s*$/i.exec(lines[idAt + 1]?.text ?? '')?.[1] ?? null;

  // "4 items in this order", "Shipment of 6 items", "Delivered, 3 Items, ₹292".
  const count = /(\d{1,3})\s*items?\s*in\s*(this|your)\s*(order|cart)|shipment\s*of\s*(\d{1,3})\s*items?|delivered\W+(\d{1,3})\s*items?/i.exec(all);
  const printedItems = count ? +(count[1] ?? count[4] ?? count[5]) : null;

  return { app, page, date, time, dateFrom, orderId, printedItems };
}

/**
 * Blinkit-style order rows: name line(s), then "<size> × <qty> [₹MRP] ₹price". Returns items whose
 * prices add up to `itemTotal` (glued / misread prices split by that arithmetic), or null.
 */
export function decodeOrderRows(lines, itemTotal) {
  if (!(itemTotal > 0)) return null;
  const ROW = /^(.*?\S)\s+[x×]\s*(\d{1,2})\s+(.*\d.*?)\s*$/i;
  const rows = [];
  let nameFrom = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/bill\s*(details|summary)|item\s*total|order\s*details/i.test(l.text)) break;
    if (l.tag === 'ignore') {
      nameFrom = i + 1;
      continue;
    }
    const m = ROW.exec(l.text);
    if (!m || !/\d|unit|pack|pair|piece|roll|kg|ml|ltr|\bg\b/i.test(m[1])) continue;
    // Name: the text lines since the previous row, minus product-photo labels left of the column.
    const left = l.boxesX?.[0]?.left ?? -Infinity;
    const name = lines
      .slice(nameFrom, i)
      .filter((x) => x.tag !== 'ignore')
      .map((x) => (x.boxesX?.length ? x.boxesX.filter((b) => b.right >= left).map((b) => b.text).join(' ') : x.text))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    rows.push({ name, qty: +m[2], options: priceOptions(m[3]), line: i });
    nameFrom = i + 1;
  }
  if (rows.length < 2 || rows.some((r) => !r.name || !r.options.length)) return null;

  // Cheapest combination of readings that adds up to the item total (cents, exact).
  const target = Math.round(itemTotal * 100);
  const memo = new Map();
  const best = (i, left) => {
    if (i === rows.length) return left === 0 ? { cost: 0, pick: [] } : null;
    const key = `${i}|${left}`;
    if (memo.has(key)) return memo.get(key);
    let out = null;
    for (const o of rows[i].options) {
      const c = Math.round(o.value * 100);
      if (c > left) continue;
      const rest = best(i + 1, left - c);
      if (rest && (!out || rest.cost + o.cost < out.cost)) out = { cost: rest.cost + o.cost, pick: [o.value, ...rest.pick] };
    }
    memo.set(key, out);
    return out;
  };
  const found = best(0, target);
  if (!found) return null;
  return rows.map((r, k) => ({ name: r.name, qty: r.qty, unit_price: null, total: found.pick[k] }));
}

// Digits a small "₹" is misread as.
const GLYPHS = '71248';
/** The MRP in the digits before a price, with 0–2 misread ₹ around it: [[mrp, glyphsDropped]]. */
function mrpReadings(rest) {
  const out = [];
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    if ((a && !GLYPHS.includes(rest[0])) || (b && !GLYPHS.includes(rest.at(-1)))) continue;
    const m = rest.slice(a, rest.length - b);
    if (m.length >= 2 && m.length <= 4 && m[0] !== '0') out.push([+m, a + b]);
  }
  return out;
}

/**
 * Readings of a row's price part, cheapest (most likely) first. "₹0 ₹61" → 61; "114₹104" → 104;
 * "79064" (₹90 ₹64 with both ₹ misread / dropped) → 64, 4, 906 + 4…; "7114" (₹114) → 114.
 */
export function priceOptions(tail) {
  const out = [];
  const add = (value, cost) => {
    if (value > 0 && !out.some((o) => o.value === value)) out.push({ value, cost });
  };
  // A clean currency-marked last price.
  const marked = [...tail.matchAll(/[₹€#]\s*(\d{1,3}(?:,\d{3})*|\d{1,5})(?:\.(\d{2}))?/g)];
  const lastNum = [...tail.matchAll(/\d[\d,]*(?:\.\d{2})?/g)].at(-1);
  if (marked.length && marked.at(-1).index + marked.at(-1)[0].length >= tail.trimEnd().length) {
    add(+marked.at(-1)[1].replace(/,/g, '') + (marked.at(-1)[2] ? +marked.at(-1)[2] / 100 : 0), 0);
  }
  if (!lastNum) return out;
  const digits = lastNum[0].replace(/,/g, '');
  const separate = (tail.match(/\d[\d,]*/g) || []).length > 1;
  if (digits.includes('.')) {
    add(+digits, 0);
    return out;
  }
  // As read: cheap when it stands on its own and is a plausible price; long runs are glued.
  if (digits.length <= 3 || (digits.length === 4 && separate)) add(+digits, out.length ? 1 : 0);
  // Price = the last 2–4 digits; before it, a ₹ read as a digit ("4125" = ₹125) and / or the
  // struck-out MRP, itself maybe with its ₹ misread ("870769" = ₹70 ₹69). Splits whose MRP is
  // close above the price are likelier (discounts are rarely over 50%).
  const options = [];
  for (let n = 2; n <= Math.min(4, digits.length - 1); n++) {
    const price = +digits.slice(-n);
    if (digits.at(-n) === '0') continue;
    const rest = digits.slice(0, -n);
    let cost = 3;
    if (rest.length === 1 && GLYPHS.includes(rest)) cost = digits.length <= 4 ? 0.8 : 1.5;
    for (const [mrp, glyphs] of mrpReadings(rest)) {
      if (mrp >= price && mrp <= price * 4) cost = Math.min(cost, 1 + (mrp / price - 1) / 2 + glyphs * 0.05);
    }
    options.push([price, cost]);
  }
  options.sort((x, y) => x[1] - y[1]).forEach(([v, c]) => add(v, c));
  if (digits.length === 4 && !separate) add(+digits, 2);
  return out;
}
