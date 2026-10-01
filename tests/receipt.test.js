import { describe, it, expect } from 'vitest';
import { toBoxes } from '../src/lib/receipt/ocr.js';
import { solveReceipt } from '../src/lib/receipt/solver.js';
import { normalize } from '../src/lib/receipt/schema.js';
import { audit } from '../src/lib/receipt/audit.js';
import { receiptToDraft, receiptDateTime, guessCategory, compactScan } from '../src/lib/receipt/draft.js';
import { splitByItems } from '../src/lib/split.js';

/** Builds PaddleOCR-shaped boxes from [text, x] runs per row (10 px per character, rows 30 px apart). */
function ocrRows(rows, { charW = 10, h = 20 } = {}) {
  const items = [];
  rows.forEach((runs, r) => {
    for (const [text, x, scale = 1] of runs) {
      const y = r * 30, w = text.length * charW * scale, hh = h * scale;
      items.push({ text, score: 0.98, poly: [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]] });
    }
  });
  return toBoxes(items);
}

const read = (rows) => {
  // eslint-disable-next-line no-unused-vars
  const { _lines, _debug, ...raw } = solveReceipt(ocrRows(rows));
  return normalize(raw);
};

const cafe = [
  [['CAFE MOCHA', 100, 1.6]],
  [['12 MG Road, Bengaluru 560001', 40]],
  [['Date: 14/09/2026', 0], ['19:42', 300]],
  [['Cappuccino', 0], ['2 x 120.00', 200], ['240.00', 400]],
  [['Veg Sandwich', 0], ['180.00', 400]],
  [['Brownie', 0], ['110.00', 400]],
  [['Subtotal', 0], ['530.00', 400]],
  [['CGST 2.5%', 0], ['13.25', 410]],
  [['SGST 2.5%', 0], ['13.25', 410]],
  [['Grand Total', 0], ['₹556.50', 390]],
  [['Cash', 0], ['600.00', 400]],
  [['Change', 0], ['43.50', 410]],
];

describe('vendored receipt solver', () => {
  const r = read(cafe);

  it('reads the totals block', () => {
    expect(r.total).toBe(556.5);
    expect(r.subtotal).toBe(530);
    expect(r.taxes.map((t) => t.amount)).toEqual([13.25, 13.25]);
    expect(r.currency).toBe('INR');
  });

  it('reads the items, including qty × price', () => {
    expect(r.items.map((i) => [i.name, i.total])).toEqual([
      ['Cappuccino', 240],
      ['Veg Sandwich', 180],
      ['Brownie', 110],
    ]);
    expect(r.items[0]).toMatchObject({ qty: 2, unit_price: 120 });
  });

  it('reads merchant, date and time', () => {
    expect(r.merchant).toBe('CAFE MOCHA');
    expect(r.date).toBe('2026-09-14');
    expect(r.time).toBe('19:42');
  });

  it('passes its own arithmetic self-check', () => {
    expect(audit(r).ok).toBe(true);
  });
});

describe('receiptToDraft', () => {
  const now = new Date(2026, 9, 2, 10, 0);
  const draft = receiptToDraft(read(cafe), { now });

  it('maps a scan onto expense fields', () => {
    expect(draft).toMatchObject({ amount: 556.5, currency: 'INR', title: 'Cafe Mocha', when: '2026-09-14T19:42', category: 'Food' });
    expect(draft.items.map((i) => i.name)).toEqual(['Cappuccino', 'Veg Sandwich', 'Brownie']);
  });

  it('rejects future and implausibly old dates', () => {
    expect(receiptDateTime('2026-12-25', null, now)).toBeNull();
    expect(receiptDateTime('2015-01-01', null, now)).toBeNull();
    expect(receiptDateTime('2026-10-01', null, now)).toBe('2026-10-01T12:00');
    expect(receiptDateTime('2026-10-01|2026-01-10', '09:05:00', now)).toBe('2026-10-01T09:05');
  });

  it('guesses categories from merchant, then items', () => {
    expect(guessCategory({ merchant: 'Apollo Pharmacy' })).toBe('Health');
    expect(guessCategory({ merchant: 'XYZ', items: [{ name: 'Petrol' }] })).toBe('Travel');
    expect(guessCategory({ merchant: 'Unknown Co' })).toBeNull();
  });

  it('keeps a compact copy of the scan', () => {
    const c = compactScan(read(cafe));
    expect(c).toMatchObject({ merchant: 'CAFE MOCHA', total: 556.5, subtotal: 530 });
    expect(JSON.stringify(c).length).toBeLessThan(2000);
  });
});

describe('splitByItems', () => {
  const items = [
    { name: 'Cappuccino', amount: '240', members: ['a', 'b'] },
    { name: 'Sandwich', amount: 180, members: ['a'] },
    { name: 'Brownie', amount: '110', members: ['c'] },
  ];

  it('spreads tax proportionally and lands on the exact total', () => {
    const r = splitByItems(556.5, items);
    // a: 120 + 180 = 300, b: 120, c: 110 → scaled by 556.5 / 530 = 1.05
    expect(r.alloc).toEqual({ a: 315, b: 126, c: 115.5 });
    expect(r).toMatchObject({ itemsTotal: 530, extras: 26.5 });
  });

  it('handles discounts on an item line', () => {
    const r = splitByItems(90, [
      { name: 'Pizza', amount: 100, members: ['a', 'b'] },
      { name: 'Coupon', amount: -10, members: ['a', 'b'] },
    ]);
    expect(r.alloc).toEqual({ a: 45, b: 45 });
  });

  it('requires prices and people for every item', () => {
    expect(splitByItems(10, [{ name: 'x', amount: 'abc', members: ['a'] }]).error).toMatch(/price/);
    expect(splitByItems(10, [{ name: 'x', amount: 5, members: [] }]).error).toMatch(/Pick who/);
    expect(splitByItems(10, []).error).toBeTruthy();
  });
});

describe('item names', () => {
  it('drops trailing tax flags and fixes SHOUTY caps', () => {
    const items = receiptToDraft({ items: [{ name: 'T-Saha Bread *#', total: 4.14 }, { name: 'MASALA DOSA', total: 90 }] }).items;
    expect(items.map((i) => i.name)).toEqual(['T-Saha Bread', 'Masala Dosa']);
  });
});
