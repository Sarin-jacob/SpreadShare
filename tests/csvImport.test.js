import { describe, it, expect } from 'vitest';
import { parseCsv, isSplitwise, readSplitwise, splitwiseToEntry, guessPeople, readGenericCsv, splitwiseCategory } from '../src/lib/csvImport.js';

const now = new Date(2026, 9, 4);

describe('parseCsv', () => {
  it('handles quotes, commas and newlines inside fields', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', 'two\nlines', '3'],
    ]);
  });
});

const SPLITWISE = `Date,Description,Category,Cost,Currency,Asha K,Ravi,Me Tester
2026-09-01,Dinner at Toit,Dining out,600.00,INR,-200.00,-200.00,400.00
2026-09-02,Cab,Taxi,300.00,INR,200.00,-100.00,-100.00
2026-09-03,Ravi paid Me Tester,Payment,150.00,INR,0.00,150.00,-150.00
2026-09-04,Groceries,Groceries,900.00,INR,300.00,300.00,-600.00

,Total balance,,,INR,300.00,150.00,-450.00`;

describe('Splitwise export', () => {
  const rows = parseCsv(SPLITWISE);
  const sw = readSplitwise(rows, { now });

  it('is recognised and read', () => {
    expect(isSplitwise(rows[0])).toBe(true);
    expect(sw.people).toEqual(['Asha K', 'Ravi', 'Me Tester']);
    expect(sw.entries).toHaveLength(4);
    expect(sw.entries.map((e) => e.kind)).toEqual(['expense', 'expense', 'payment', 'expense']);
    expect(splitwiseCategory('Dining out')).toBe('Food');
  });

  const who = (p) => ({ 'Asha K': 'asha', Ravi: 'ravi', 'Me Tester': 'me' })[p];

  it('rebuilds a single-payer expense exactly', () => {
    expect(splitwiseToEntry(sw.entries[0], who)).toEqual({
      type: 'EXPENSE_ADD',
      payers: [{ user: 'me', value: 600 }],
      allocations: [{ user: 'me', value: 200 }, { user: 'asha', value: 200 }, { user: 'ravi', value: 200 }],
    });
  });

  it('turns payments into settle-ups', () => {
    expect(splitwiseToEntry(sw.entries[2], who)).toEqual({ type: 'TRANSFER', from: 'ravi', to: 'me', amount: 150 });
  });

  it('keeps balances right with several payers', () => {
    const e = splitwiseToEntry(sw.entries[3], who);
    const net = {};
    for (const p of e.payers) net[p.user] = (net[p.user] || 0) + p.value;
    for (const a of e.allocations) net[a.user] = (net[a.user] || 0) - a.value;
    expect(net).toEqual({ asha: 300, ravi: 300, me: -600 });
  });

  it('matches names to members', () => {
    const profiles = { 'a@x': { name: 'Asha Kumar' }, 'me@x': { name: 'Me Tester' } };
    expect(guessPeople(sw.people, ['a@x', 'me@x'], profiles, 'me@x')).toEqual({ 'Asha K': 'a@x', Ravi: null, 'Me Tester': 'me@x' });
  });
});

describe('generic CSV', () => {
  it('reads a bank CSV with account details above the table', () => {
    const rows = parseCsv(`Account No,XX1234
Statement period,Sep 2026
Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
02/09/26,UPI-SWIGGY-swiggy@ybl,1234,245.00,,24755.00
05/09/26,NEFT-ACME SALARY,5678,,50000.00,74755.00`);
    expect(readGenericCsv(rows, { now }).map((t) => [t.title, t.amount, t.direction])).toEqual([
      ['UPI-SWIGGY-swiggy@ybl', 245, 'debit'],
      ['NEFT-ACME SALARY', 50000, 'credit'],
    ]);
  });

  it('reads a home-made expense sheet', () => {
    const rows = parseCsv('Date,Item,Amount,Paid by\n2026-09-01,Milk,60,Asha\n2026-09-02,Bread,"1,040.50",Me');
    expect(readGenericCsv(rows, { now }).map((t) => [t.title, t.amount, t.paidBy])).toEqual([
      ['Milk', 60, 'Asha'],
      ['Bread', 1040.5, 'Me'],
    ]);
  });

  it('says so when it finds no table', () => {
    expect(readGenericCsv(parseCsv('foo,bar\n1,2'))).toBeNull();
  });
});
