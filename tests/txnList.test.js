import { describe, it, expect } from 'vitest';
import { parseTransactionList, findDate, dedupeTransactions } from '../src/lib/txnList.js';

const now = new Date(2026, 9, 4, 12);
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
const simple = (txs) => txs.map((t) => [t.title, t.amount, t.direction, iso(t.date)]);

describe('findDate', () => {
  it.each([
    ['12 Sep', '2026-09-12'],
    ['12 Sept 2025', '2025-09-12'],
    ['Sep 12, 2026', '2026-09-12'],
    ['12/09/2026', '2026-09-12'],
    ['03-10-26', '2026-10-03'],
    ['Yesterday, 8:30 PM', '2026-10-03'],
    ['28 Dec', '2025-12-28'], // no year: the most recent one that isn't in the future
  ])('%s → %s', (text, expected) => {
    expect(iso(findDate(text, now)?.date)).toBe(expected);
  });

  it('ignores times and plain numbers', () => {
    expect(findDate('9:41', now)).toBeNull();
    expect(findDate('Flat 302', now)).toBeNull();
  });
});

describe('parseTransactionList', () => {
  it('reads a GPay-style list (name + amount, date below)', () => {
    const txs = parseTransactionList(['9:41', 'Transaction history', 'Swiggy ₹245', '12 Sep', 'Rahul Kumar +₹1,200', '11 Sep', 'Uber India ₹186.50', '10 Sep'], { now });
    expect(simple(txs)).toEqual([
      ['Swiggy', 245, null, '2026-09-12'],
      ['Rahul Kumar', 1200, 'credit', '2026-09-11'],
      ['Uber India', 186.5, null, '2026-09-10'],
    ]);
  });

  it('reads a PhonePe-style list (label + amount, name below)', () => {
    const txs = parseTransactionList([
      'Paid to ₹250', 'Rahul Kumar', '12 Sep 2026 Debited from',
      'Received from ₹500', 'Asha K', '11 Sep 2026 Credited to',
      'Paid to ₹99', 'Netflix', '10 Sep 2026 Failed',
    ], { now });
    expect(simple(txs)).toEqual([
      ['Rahul Kumar', 250, 'debit', '2026-09-12'],
      ['Asha K', 500, 'credit', '2026-09-11'],
      ['Netflix', 99, 'debit', '2026-09-10'],
    ]);
    expect(txs.map((t) => t.failed)).toEqual([false, false, true]);
  });

  it('reads a Paytm-style list (label and name on the amount line)', () => {
    const txs = parseTransactionList(['Paid to Swiggy - Rs.245', '12 Sep, 8:30 PM', 'Received from Asha + Rs.300', '11 Sep, 1:15 PM'], { now });
    expect(simple(txs)).toEqual([
      ['Swiggy', 245, 'debit', '2026-09-12'],
      ['Asha', 300, 'credit', '2026-09-11'],
    ]);
  });

  it('uses date section headers for the entries under them', () => {
    const txs = parseTransactionList(['12 September', 'Swiggy ₹245', 'Zomato ₹380', '11 September', 'Uber ₹200'], { now });
    expect(simple(txs).map((t) => [t[0], t[3]])).toEqual([
      ['Swiggy', '2026-09-12'],
      ['Zomato', '2026-09-12'],
      ['Uber', '2026-09-11'],
    ]);
  });

  it('takes a name printed above its amount', () => {
    const txs = parseTransactionList(['Swiggy', '₹245', '12 Sep'], { now });
    expect(simple(txs)).toEqual([['Swiggy', 245, null, '2026-09-12']]);
  });

  it('reads OCR’s rupee-sign slips and skips totals', () => {
    const txs = parseTransactionList(['Total spent ₹2,345', 'Zepto ?412', '9 Sep'], { now });
    expect(simple(txs)).toEqual([['Zepto', 412, null, '2026-09-09']]);
  });

  it('reads a bank statement, with direction from the running balance', () => {
    const txs = parseTransactionList([
      'Date Narration Withdrawal Deposit Balance',
      '01/09/2026 Opening balance 0.00 25,000.00',
      '02/09/2026 UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl 245.00 24,755.00',
      '05/09/2026 NEFT/SALARY ACME CORP 50,000.00 74,755.00',
      '07/09/2026 POS/AMAZON PAY INDIA 1,299.00 73,456.00',
    ], { now });
    expect(simple(txs).slice(1)).toEqual([
      ['SWIGGY', 245, 'debit', '2026-09-02'],
      ['NEFT SALARY ACME CORP'.split(' ').slice(1).join(' '), 50000, 'credit', '2026-09-05'],
      ['AMAZON PAY INDIA', 1299, 'debit', '2026-09-07'],
    ]);
  });

  it('ignores numbers inside names unless they are right-aligned amounts', () => {
    const txs = parseTransactionList([{ text: 'Flat 302 maintenance', right: 0.5 }, { text: 'Electricity 1450.00', right: 0.95 }], { now });
    expect(simple(txs)).toEqual([['Electricity', 1450, null, null]]);
  });
});

describe('dedupeTransactions', () => {
  it('drops entries repeated across overlapping screenshots', () => {
    const a = parseTransactionList(['Swiggy ₹245', '12 Sep', 'Uber ₹186', '11 Sep'], { now });
    const b = parseTransactionList(['Uber ₹186', '11 Sep', 'Zepto ₹99', '10 Sep'], { now });
    expect(dedupeTransactions([...a, ...b]).map((t) => t.title)).toEqual(['Swiggy', 'Uber', 'Zepto']);
  });
});
