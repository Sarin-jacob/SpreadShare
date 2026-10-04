import { describe, it, expect } from 'vitest';
import { findDuplicates } from '../src/lib/duplicates.js';
import { dueOccurrences, nthOccurrence, periodKey, nextOccurrence, occurrenceId } from '../src/lib/recurring.js';
import { isUpiId, upiPayLink } from '../src/lib/upi.js';
import { computeLedgerState } from '../src/lib/engine.js';
import { describeChanges } from '../src/lib/history.js';

const me = 'me@x.dev';
const asha = 'asha@x.dev';
let n = 0;
const ev = (type, actor, payload, ts = '2026-09-01T10:00:00.000Z', eventId = `e${++n}`) => ({
  spreadsheetId: 'g',
  eventId,
  timestamp: ts,
  event_type: type,
  actor_identity: actor,
  payload_json: payload,
});
const expense = (title, amount, when, extra = {}) =>
  ev('EXPENSE_ADD', me, {
    title,
    evaluated_amount: amount,
    custom_timestamp: when,
    payers: [{ user: me, value: amount }],
    allocations: [{ user: me, value: amount / 2 }, { user: asha, value: amount / 2 }],
    ...extra,
  }, when);

describe('findDuplicates', () => {
  const L = computeLedgerState([
    expense('Dinner at Toit', 2400, '2026-09-26T20:00:00.000Z'),
    expense('Groceries', 860, '2026-09-20T10:00:00.000Z', { receipt_scan: { merchant: 'Ratnadeep Super Market' } }),
    expense('Cab', 2400, '2026-08-01T10:00:00.000Z'),
  ]);

  it('flags the same amount around the same time', () => {
    const d = findDuplicates(L.expenses, { amount: 2400, when: '2026-09-27T09:00' });
    expect(d.map((x) => x.title)).toEqual(['Dinner at Toit']);
  });

  it('allows small differences (rounding, tip)', () => {
    expect(findDuplicates(L.expenses, { amount: 2405, when: '2026-09-26T21:00' })).toHaveLength(1);
    expect(findDuplicates(L.expenses, { amount: 2500, when: '2026-09-26T21:00' })).toHaveLength(0);
  });

  it('looks further back for the same shop', () => {
    const d = findDuplicates(L.expenses, { amount: 860, when: '2026-09-25T10:00', merchant: 'RATNADEEP SUPER MARKET' });
    expect(d.map((x) => x.title)).toEqual(['Groceries']);
    expect(findDuplicates(L.expenses, { amount: 860, when: '2026-09-25T10:00' })).toHaveLength(0);
  });

  it('skips the entry being edited', () => {
    const id = L.expenses.find((x) => x.title === 'Dinner at Toit').eventId;
    expect(findDuplicates(L.expenses, { amount: 2400, when: '2026-09-26T20:00' }, { excludeId: id })).toHaveLength(0);
  });
});

describe('recurring', () => {
  it('repeats monthly on the same day, clamped to short months', () => {
    const start = new Date(2026, 0, 31, 9, 0);
    expect(nthOccurrence(start, 'month', 1).getDate()).toBe(28); // Feb 2026
    expect(nthOccurrence(start, 'month', 2).getDate()).toBe(31); // March
    expect(nthOccurrence(new Date(2026, 8, 1), 'week', 2).getDate()).toBe(15);
    expect(periodKey(new Date(2026, 9, 1), 'month')).toBe('2026-10');
  });

  const rent = expense('Rent', 30000, new Date(2026, 6, 1, 9).toISOString(), { recurring: { every: 'month', series: 's1', owner: me } });

  it('creates the missing months, each with a fixed ID', () => {
    const due = dueOccurrences([rent], me, new Date(2026, 9, 4));
    expect(due.map((d) => d.eventId)).toEqual(['rec-s1-2026-08', 'rec-s1-2026-09', 'rec-s1-2026-10']);
    expect(due[0].payload).toMatchObject({ title: 'Rent', evaluated_amount: 30000, recurring_from: 's1', period: '2026-08' });
    expect(due[0].payload.recurring).toBeUndefined();
    expect(due[0].actor).toBe(me);
  });

  it('skips months that exist, including deleted ones', () => {
    const aug = ev('EXPENSE_ADD', me, { title: 'Rent' }, '2026-08-01T00:00:00.000Z', occurrenceId('s1', '2026-08'));
    const delSep = ev('EXPENSE_DELETE', me, { target_event_id: 'rec-s1-2026-09' });
    const sep = ev('EXPENSE_ADD', me, { title: 'Rent' }, '2026-09-01T00:00:00.000Z', 'rec-s1-2026-09');
    const due = dueOccurrences([rent, aug, sep, delSep], me, new Date(2026, 9, 4));
    expect(due.map((d) => d.eventId)).toEqual(['rec-s1-2026-10']);
  });

  it('only the owner adds copies', () => {
    expect(dueOccurrences([rent], asha, new Date(2026, 9, 4))).toEqual([]);
  });

  it('counts a repeated ID once in balances', () => {
    const copy = ev('EXPENSE_ADD', me, { title: 'Rent', evaluated_amount: 100, payers: [{ user: me, value: 100 }], allocations: [{ user: asha, value: 100 }] }, '2026-08-01T00:00:00.000Z', 'rec-s1-2026-08');
    const L = computeLedgerState([copy, { ...copy }]);
    expect(L.members[asha].netBalance).toBe(-100);
  });

  it('gives the next date', () => {
    expect(nextOccurrence(new Date(2026, 6, 1, 9), 'month', new Date(2026, 9, 4)).getMonth()).toBe(10);
  });

  it('describes turning repeats off', () => {
    expect(describeChanges({ recurring: { every: 'month' } }, {}, { money: String, name: String, date: String, category: String })).toContain('Repeats monthly → never');
  });
});

describe('UPI', () => {
  it('validates UPI IDs', () => {
    expect(isUpiId('asha.k@okhdfcbank')).toBe(true);
    expect(isUpiId('9876543210@ybl')).toBe(true);
    expect(isUpiId('asha')).toBe(false);
    expect(isUpiId('a@1bank')).toBe(false);
  });

  it('builds a pay link with amount and note', () => {
    const link = upiPayLink({ upiId: 'Asha@OKAXIS', name: 'Asha K', amount: 975, note: 'Goa Trip settle-up' });
    expect(link).toBe('upi://pay?pa=asha%40okaxis&pn=Asha%20K&cu=INR&am=975.00&tn=Goa%20Trip%20settle-up');
  });

  it('reads the latest UPI ID from PROFILE events', () => {
    const L = computeLedgerState([
      ev('MEMBER_JOINED', asha, { member_email: asha, member_name: 'Asha' }),
      ev('PROFILE', asha, { upi_id: 'old@ybl' }, '2026-09-01T00:00:00.000Z'),
      ev('PROFILE', asha, { upi_id: 'Asha@OKAXIS' }, '2026-09-02T00:00:00.000Z'),
    ]);
    expect(L.profiles[asha].upi).toBe('asha@okaxis');
    expect(L.expenses).toHaveLength(0);
  });
});

describe('group currency', () => {
  it('takes the currency set before the first entry', () => {
    const L = computeLedgerState([
      ev('MEMBER_JOINED', me, { member_email: me }, '2026-09-01T00:00:00.000Z'),
      ev('GROUP_SETTINGS', me, { currency: 'eur' }, '2026-09-01T00:00:01.000Z'),
    ]);
    expect(L.currency).toBe('EUR');
  });

  it('ignores a change once there are entries (amounts are stored in the old currency)', () => {
    const L = computeLedgerState([
      ev('GROUP_SETTINGS', me, { currency: 'EUR' }, '2026-09-01T00:00:00.000Z'),
      expense('Dinner', 100, '2026-09-02T00:00:00.000Z'),
      ev('GROUP_SETTINGS', me, { currency: 'USD' }, '2026-09-03T00:00:00.000Z'),
    ]);
    expect(L.currency).toBe('EUR');
  });

  it('defaults to none (the app currency)', () => {
    expect(computeLedgerState([expense('x', 1, '2026-09-01T00:00:00.000Z')]).currency).toBeNull();
  });
});
