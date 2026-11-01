// App screenshots (Blinkit, Swiggy…): app and page, dates completed from the screenshot, order ids,
// and glued prices split by the bill's arithmetic (src/lib/receipt/apps.js, via solveReceipt hints).
import { describe, it, expect } from 'vitest';
import { toBoxes } from '../src/lib/receipt/ocr.js';
import { solveReceipt } from '../src/lib/receipt/solver.js';
import { normalize } from '../src/lib/receipt/schema.js';
import { fileNameDate, readOrderTime, priceOptions } from '../src/lib/receipt/apps.js';
import { receiptToDraft } from '../src/lib/receipt/draft.js';

/** PaddleOCR-shaped boxes: one row per entry, [text, x] runs (10 px per character, rows 30 px apart). */
function ocrRows(rows) {
  const items = [];
  rows.forEach((runs, r) => {
    for (const [text, x] of typeof runs === 'string' ? [[runs, 0]] : runs) {
      const y = r * 30, w = text.length * 10;
      items.push({ text, score: 0.98, poly: [[x, y], [x + w, y], [x + w, y + 20], [x, y + 20]] });
    }
  });
  return toBoxes(items);
}
const read = (rows, hints) => {
  // eslint-disable-next-line no-unused-vars
  const { _lines, _debug, ...raw } = solveReceipt(ocrRows(rows), hints);
  return normalize(raw);
};
const amounts = (r) => r.items.map((i) => i.total);

describe('screenshot file names', () => {
  it.each([
    ['Screenshot_2025-10-16-22-59-45-621_com.grofers.customerapp.jpg', '2025-10-16', '22:59'],
    ['Screenshot_20251016-225945_Swiggy.jpg', '2025-10-16', '22:59'],
    ['IMG_20250416_132657.jpg', '2025-04-16', '13:26'],
    ['IMG-20250916-WA0012.jpg', '2025-09-16', null], // WhatsApp: the day it arrived
    ['PXL_20260706_054254688.jpg', '2026-07-06', null], // Pixel names use UTC times
  ])('%s', (name, date, time) => {
    const d = fileNameDate(name);
    const iso = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(d.date.getDate()).padStart(2, '0')}`;
    expect(iso).toBe(date);
    expect(d.time ? `${String(d.time.h).padStart(2, '0')}:${String(d.time.mi).padStart(2, '0')}` : null).toBe(time);
  });

  it('nothing for names without a date', () => {
    expect(fileNameDate('image.jpg')).toBe(null);
    expect(fileNameDate('receipt-2025-13-40.jpg')).toBe(null);
  });
});

describe('order lines as apps print them', () => {
  it.each([
    ['Order delivered on January 21, 10:31 PM', { month: 1, day: 21, time: { h: 22, mi: 31 } }],
    ["Placed on Thu, 16 Oct'25, 10:30 PM", { month: 10, day: 16, year: 2025, time: { h: 22, mi: 30 } }],
    ['placed yesterday, 9:50 PM', { daysAgo: 1, time: { h: 21, mi: 50 } }],
    ['Arrived at 10:47 pm', { time: { h: 22, mi: 47 } }],
    ['Delivered on Mon, Dec 11, 2023, 8:18 PM', { month: 12, day: 11, year: 2023, time: { h: 20, mi: 18 } }],
  ])('%s', (text, want) => {
    expect(readOrderTime(text)).toMatchObject(want);
  });
});

describe('glued order prices', () => {
  it.each([
    ['₹0 ₹61', 61], // struck-out MRP read as ₹0
    ['114₹104', 104],
    ['7114', 114], // ₹114 with the ₹ read as 7
    ['79064', 64], // ₹90 ₹64
    ['870769', 69], // ₹70 ₹69, both ₹ misread
  ])('%s → %s is a reading', (tail, price) => {
    expect(priceOptions(tail).map((o) => o.value)).toContain(price);
  });
});

const blinkitOrder = (rows) => [
  [['10:59', 0], ['8.95 KB/s Vo 25', 200]],
  'Order summary',
  'Arrived at 10:47 pm',
  'Download Invoice',
  `${rows.length} items in this order`,
  ...rows.flatMap(([name, row]) => [name, row]),
  'How were your ordered items? Rate now',
  'Bill details',
];

describe('Blinkit order summary screenshot', () => {
  const rows = blinkitOrder([
    ['Amul Taaza Toned Milk', '200 ml x 6 ₹102'],
    ['Vadilal Matka Kulfi', '100 ml x 1 ₹55'],
  ]);
  const r = read(
    [...rows, 'Item total ₹157', 'Handling charge + ₹2', 'Delivery charges FREE', 'Bill total ₹159', 'Order details', 'Order id', 'ORD87777425159'],
    { fileName: 'Screenshot_2025-10-16-22-59-45-621_com.grofers.customerapp.jpg' },
  );

  it('is a Blinkit order', () => {
    expect(r.details.app).toBe('Blinkit');
    expect(r.details.page).toBe('order');
    expect(r.merchant).toBe('Blinkit'); // no shop name on the page; not the first product
  });
  it('dates it from the screenshot, timed by "Arrived at"', () => {
    expect(r.date).toBe('2025-10-16');
    expect(r.time).toBe('22:47');
    expect(receiptToDraft(r, { now: new Date(2025, 9, 17) }).when).toBe('2025-10-16T22:47');
  });
  it('reads the order id from the line under "Order id"', () => {
    expect(r.invoice_number).toBe('ORD87777425159');
  });
  it('reads the bill', () => {
    expect(amounts(r)).toEqual([102, 55]);
    expect(r.items[0].qty).toBe(6);
    expect(r.subtotal).toBe(157);
    expect(r.total).toBe(159);
    expect(r.details.counts.printed_items).toBe(2);
  });

  it('a WhatsApp-blurred copy: glued prices split so they add up to the item total', () => {
    const low = read(
      [
        ...blinkitOrder([
          ['Pass Pass Minty Mix Mouth Freshener', '100 g × 1 79064'],
          ['Salad Mix with Cherry Tomatoes', '100 g × 1 17457'],
          ['Amul Taaza Toned Milk', '200 ml x 6 102'],
          ['Amul Spicy Garlic Cheese Spread', '200 g × 1 7114'],
        ]),
        'Item total 337',
        'Handling charge +47',
        'Bill total 344',
      ],
      { fileName: 'IMG-20250916-WA0012.jpg' },
    );
    expect(amounts(low)).toEqual([64, 57, 102, 114]);
    expect(low.subtotal).toBe(337);
    expect(low.total).toBe(344); // "+47": ₹7 with the ₹ read as 4
  });
});

describe('Swiggy screenshots', () => {
  const order = (deliveredOn) => [
    [['10:52', 0], ['2.68 KB/s Vo 70', 200]],
    'ORDER #227983399518906 HELP',
    'Delivered, 2 Items, 292',
    'Spicy And Chilli Food Hub',
    `Order delivered on ${deliveredOn}`,
    'BILL DETAILS',
    [['Chicken Tikka x 1', 0], ['₹230', 400]],
    [['Roti x 2', 0], ['₹62', 400]],
    [['Item Total', 0], ['₹292.00', 380]],
    [['Bill Total', 0], ['₹292.00', 380]],
  ];

  it('order page: restaurant, order number, year from the screenshot', () => {
    const r = read(order('January 21, 10:31 PM'), { fileName: 'Screenshot_2026-01-21-22-52-20-123_in.swiggy.android.jpg' });
    expect(r.details.app).toBe('Swiggy');
    expect(r.merchant).toBe('Spicy And Chilli Food Hub');
    expect(r.invoice_number).toBe('227983399518906');
    expect(r.date).toBe('2026-01-21');
    expect(r.time).toBe('22:31');
    expect(r.total).toBe(292);
  });

  it('an order from last year, screenshotted after New Year', () => {
    const r = read(order('December 31, 11:10 PM'), { fileName: 'Screenshot_2026-01-01-00-20-00-000_in.swiggy.android.jpg' });
    expect(r.date).toBe('2025-12-31');
  });

  it('cart: dated and timed by the screenshot (from the file time when the name has none)', () => {
    const r = read(
      [
        [['3:17 PM', 0], ['0.8KB/s G+ 39', 200]],
        'Spicy And Chilli Food Hub',
        [['Plain Rice Mini', 0], ['₹71', 400]],
        [['3Pcs Roti+Mix Veg', 0], ['₹62', 400]],
        'Bill Details',
        [['Item Total', 0], ['133', 400]],
        [['To Pay', 0], ['₹133', 400]],
      ],
      { fileName: 'image.png', fileTime: new Date(2024, 3, 4, 15, 18).getTime() },
    );
    expect(r.details.page).toBe('cart');
    expect(r.date).toBe('2024-04-04');
    expect(r.time).toBe('15:17'); // the status-bar clock
  });
});

describe('paper receipts stay paper receipts', () => {
  const bill = [
    'HOTEL SAGAR',
    'Order No 45',
    [['Masala Dosa', 0], ['90.00', 300]],
    [['Coffee', 0], ['30.00', 300]],
    [['Bill Total', 0], ['120.00', 300]],
  ];

  it('no app page without a screenshot (status bar, app, or a screenshot file name)', () => {
    const r = read(bill, { fileName: 'IMG_20260130_101636.jpg' });
    expect(r.details.page).toBe(null);
    expect(r.merchant).toBe('HOTEL SAGAR');
  });

  it('no printed date: the photo’s date, marked as such', () => {
    const r = read(bill, { fileName: 'IMG_20260130_101636.jpg' });
    expect(r.date).toBe('2026-01-30');
    expect(r.details.date_from).toBe('file');
  });

  it('a printed date wins over the photo’s', () => {
    const r = read(['HOTEL SAGAR', 'Date: 28/01/2026', ...bill.slice(1)], { fileName: 'IMG_20260130_101636.jpg' });
    expect(r.date).toBe('2026-01-28');
    expect(r.details.date_from).toBeUndefined();
  });

  it('no hints: as before', () => {
    const r = read(bill);
    expect(r.date).toBe(null);
    expect(r.total).toBe(120);
  });
});

describe('Blinkit scrolling screenshot (19 items, sent downscaled)', () => {
  // OCR of a 270 × 1461 scrolling screenshot read in slices: struck-out MRPs glued to prices,
  // the ₹ read as 7 / 2 / 4 / € / # / ￥, and "Item total ₹1,535" as "71,535".
  const rows = [
    [['01:36', 0]], '←', 'Order summary', 'Arrived at 8:13 pm', 'Download Invoice', '19 items in this order',
    'Amul Fresh Cream', '250 ml x 1 €75',
    'Tata Sampann Paneer Masala', 'Powder with Natural Oils', '100 g x 1 7104101',
    'Amul Fresh Malai Paneer', '200 g × 3 285',
    'Desi Tomato', '500 g × 1 3226',
    'Coriander Bunch', '100 g × 1 75845',
    'Catch Ginger Garlic Paste', '200 g × 1 250€36',
    'Green Chilli', '100 g x 1 20117',
    'Peeled Garlic', '100 g x 1 ￥6548',
    'Whole Farm Premium Kasuri', 'Methi', '50 g x 1 760224',
    'Onion', '1 kg x 1 795€76',
    'Ginger', '200 g × 1 252744',
    'Freedom Refined Sunflower Oil', '1 Itr x 1 2257183',
    'India Gate Everyday Basmati', 'Rice (Medium Grain)', '1 kg × 1 104100',
    'Pragati Pouch Curd', '500 g x ↑ 745',
    'McCain Veggie Fingers', '400 g x 1 180126',
    'Tata Sampann Unpolished Kali', 'Urad (Sabut)', '500 g x † #113105',
    'Mirinda Soft Drink', '750 ml × 1 240',
    'Pepsi Soft Drink', '750 ml x 1 240',
    "Haldiram's Prabhuji Bhujia", '400 g x 1 41232119',
    'How were your ordered items? Rate now',
    'Bill details',
    'MRP €1,756', 'Product discount -7221', 'Item total 71,535', 'Handling charge +29', 'Delivery charges FREE', 'Bill total 1,544',
    'Order details', 'Repeat Order', 'VIEW CART ON NEXT STEP',
  ];
  const r = read(rows, { fileName: 'blinkit-scroll.jpg' });

  it('every item, at the price paid', () => {
    expect(amounts(r)).toEqual([75, 101, 285, 26, 45, 36, 17, 48, 24, 76, 44, 183, 100, 45, 126, 105, 40, 40, 119]);
    expect(r.items[2]).toMatchObject({ name: 'Amul Fresh Malai Paneer', qty: 3 });
    expect(r.items[13].qty).toBe(1); // "x ↑": a misread 1
    expect(r.items.map((i) => i.name)).toContain('Tata Sampann Paneer Masala Powder with Natural Oils');
  });

  it('a bill that adds up: item total, fee and total with the misread ₹ dropped', () => {
    expect(r.subtotal).toBe(1535);
    expect(r.charges.find((c) => /handling/i.test(c.label)).amount).toBe(9);
    expect(r.total).toBe(1544);
    expect(r.merchant).toBe('Blinkit');
  });
});

describe('app bill reconciliation', () => {
  it('drops a misread ₹ only where that makes the bill add up', async () => {
    const { reconcileBill } = await import('../src/lib/receipt/apps.js');
    expect(reconcileBill({ subtotal: 71535, charges: [{ label: 'Handling', amount: 29 }], discounts: [], total: 1544 })).toMatchObject({ subtotal: 1535, charges: [{ amount: 9 }], total: 1544 });
    expect(reconcileBill({ subtotal: 1535, charges: [{ label: 'Handling', amount: 9 }], total: 1544 })).toBe(null); // already adds up
    expect(reconcileBill({ subtotal: 500, charges: [], total: 900 })).toBe(null); // nothing does
  });
});
