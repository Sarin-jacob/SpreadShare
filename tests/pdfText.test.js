import { describe, it, expect } from 'vitest';
import { runsToOcrItems, hasUsableText, isPdf } from '../src/lib/receipt/pdfText.js';
import { toBoxes } from '../src/lib/receipt/ocr.js';
import { solveReceipt } from '../src/lib/receipt/solver.js';
import { normalize } from '../src/lib/receipt/schema.js';
import { audit } from '../src/lib/receipt/audit.js';

/** pdf.js-style text runs: [str, x, row] at 7 px per character, rows 28 px apart. */
const runs = (rows) =>
  rows.flatMap((cols, r) => cols.map(([str, x]) => ({ str, x, y: 40 + r * 28, w: str.length * 7, h: 14 })));

const ebill = runs([
  [['Spice Route Kitchen', 180]],
  [['Order #48213', 40], ['Date: 28/09/2026 21:14', 300]],
  [['Paneer Tikka', 40], ['2 x 280.00', 300], ['560.00', 460]],
  [['Garlic Naan', 40], ['3 x 60.00', 300], ['180.00', 460]],
  [['Sweet Lime Soda', 40], ['120.00', 460]],
  [['Item Total', 40], ['860.00', 460]],
  [['Packaging Charges', 40], ['20.00', 467]],
  [['GST 5%', 40], ['43.00', 467]],
  [['Grand Total', 40], ['₹923.00', 453]],
  [['Paid via UPI', 40]],
]);

describe('runsToOcrItems', () => {
  it('turns runs into PaddleOCR-shaped boxes', () => {
    const [item] = runsToOcrItems([{ str: 'Total', x: 10, y: 20, w: 35, h: 14 }]);
    expect(item).toEqual({ text: 'Total', score: 1, poly: [[10, 20], [45, 20], [45, 34], [10, 34]] });
  });

  it('splits column padding inside one run, keeps normal word spacing', () => {
    const items = runsToOcrItems([{ str: 'Grand Total        923.00', x: 0, y: 0, w: 250, h: 10 }]);
    expect(items.map((i) => i.text)).toEqual(['Grand Total', '923.00']);
    expect(items[1].poly[0][0]).toBeGreaterThan(items[0].poly[1][0]);
  });

  it('drops empty runs', () => {
    expect(runsToOcrItems([{ str: '   ', x: 0, y: 0, w: 10, h: 10 }, { str: 'x', x: 0, y: 0, w: 0, h: 10 }])).toEqual([]);
  });
});

describe('hasUsableText', () => {
  it('accepts real bills and rejects scanned / near-empty PDFs', () => {
    expect(hasUsableText(ebill)).toBe(true);
    expect(hasUsableText([])).toBe(false);
    expect(hasUsableText([{ str: 'Scanned by CamScanner' }])).toBe(false);
  });
});

describe('text PDF → solver (no OCR)', () => {
  // eslint-disable-next-line no-unused-vars
  const { _lines, _debug, ...raw } = solveReceipt(toBoxes(runsToOcrItems(ebill)));
  const r = normalize(raw);

  it('reads totals, items and charges exactly', () => {
    expect(r.total).toBe(923);
    expect(r.subtotal).toBe(860);
    expect(r.items.map((i) => [i.name, i.total])).toEqual([
      ['Paneer Tikka', 560],
      ['Garlic Naan', 180],
      ['Sweet Lime Soda', 120],
    ]);
    expect(r.charges.map((c) => c.amount)).toEqual([20]);
    expect(r.taxes.map((t) => t.amount)).toEqual([43]);
    expect(audit(r).ok).toBe(true);
  });

  it('reads merchant, date and time', () => {
    expect(r).toMatchObject({ merchant: 'Spice Route Kitchen', date: '2026-09-28', time: '21:14', currency: 'INR' });
  });
});

describe('isPdf', () => {
  it('detects PDFs by type or extension', () => {
    expect(isPdf({ type: 'application/pdf', name: 'x' })).toBe(true);
    expect(isPdf({ type: '', name: 'Invoice.PDF' })).toBe(true);
    expect(isPdf({ type: 'image/png', name: 'a.png' })).toBe(false);
  });
});
