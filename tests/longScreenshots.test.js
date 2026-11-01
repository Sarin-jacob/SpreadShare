// Long scrolling screenshots and coloured amounts: image scaling, text colour, credit / debit.
import { describe, it, expect } from 'vitest';
import { fitScale, MAX_SOURCE, MAX_OUTPUT } from '../src/lib/receipt/image.js';
import { inkColor, TALL } from '../src/lib/receipt/preprocess.js';
import { parseTransactionList } from '../src/lib/txnList.js';

describe('image scale', () => {
  it('long scrolling screenshots keep their width (read in slices)', () => {
    expect(5844 / 1080).toBeGreaterThan(TALL);
    expect(fitScale(1080, 5844, MAX_SOURCE)).toBe(1); // not shrunk to 554 px wide
    expect(fitScale(1440, 9000, MAX_OUTPUT)).toBeCloseTo(1280 / 1440);
    expect(fitScale(1080, 30000, MAX_OUTPUT)).toBeCloseTo(12000 / 30000); // capped height
  });

  it('photos and normal phone screenshots fit as before', () => {
    expect(2400 / 1080).toBeLessThan(TALL); // 20:9 phones
    expect(fitScale(1080, 2400, MAX_OUTPUT)).toBe(1);
    expect(fitScale(3000, 4000, MAX_OUTPUT)).toBeCloseTo(2400 / 4000);
  });
});

/** RGBA pixels of a box: `textShare` of them in `ink` on `bg`. */
function pixels(bg, ink, textShare = 0.25, n = 400) {
  const d = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) d.set([...(i < n * textShare ? ink : bg), 255], i * 4);
  return d;
}

describe('text colour', () => {
  it.each([
    ['green on white (GPay credit)', [255, 255, 255], [16, 140, 64], 'green'],
    ['green on dark (dark mode)', [18, 18, 18], [80, 200, 120], 'green'],
    ['red on white', [255, 255, 255], [210, 40, 40], 'red'],
    ['black on white (a spend)', [255, 255, 255], [20, 20, 20], null],
    ['white on dark', [18, 18, 18], [235, 235, 235], null],
    ['grey on white', [255, 255, 255], [120, 120, 120], null],
  ])('%s', (_, bg, ink, want) => {
    expect(inkColor(pixels(bg, ink))).toBe(want);
  });

  it('nothing to go on in a blank box', () => {
    expect(inkColor(pixels([255, 255, 255], [255, 255, 255]))).toBe(null);
    expect(inkColor(new Uint8ClampedArray(8))).toBe(null);
  });
});

describe('credit or debit from the amount’s colour', () => {
  const now = new Date(2026, 9, 20);
  const list = (rows) => parseTransactionList(rows, { now });

  it('a green amount without its "+" (OCR dropped it) is money received', () => {
    const [t] = list([{ text: 'Rahul Sharma ₹500', right: 0.95, ink: 'green' }, { text: '18 Oct', right: 0.3 }]);
    expect(t.direction).toBe('credit');
  });

  it('black amounts are spends when the words say so, and unknown otherwise', () => {
    const [a, b] = list([
      { text: 'Paid to Swiggy ₹250', right: 0.95 },
      { text: 'Blue Tokai Coffee ₹180', right: 0.95 },
    ]);
    expect(a.direction).toBe('debit');
    expect(b.direction).toBe(null);
  });

  it('a printed sign beats the colour', () => {
    const [t] = list([{ text: 'Refund reversal -₹99', right: 0.95, ink: 'green' }]);
    expect(t.direction).toBe('debit');
  });

  it('red is a weak cue: words that say received still win', () => {
    const [a, b] = list([
      { text: 'Received from Asha ₹300', right: 0.95, ink: 'red' },
      { text: 'Electricity bill ₹1,450', right: 0.95, ink: 'red' },
    ]);
    expect(a.direction).toBe('credit');
    expect(b.direction).toBe('debit');
  });
});
