import { describe, it, expect } from 'vitest';
import { findDuplicates } from '../src/lib/duplicates.js';
import { dueOccurrences, nthOccurrence, periodKey, nextOccurrence, occurrenceId, upcomingRecurring } from '../src/lib/recurring.js';
import { isUpiId, upiPayLink } from '../src/lib/upi.js';
import { computeLedgerState, displayName } from '../src/lib/engine.js';
import { mergeMap } from '../src/lib/members.js';
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

describe('members without Google accounts', () => {
  const amma = 'guest:amma123456';
  const joinAmma = ev('MEMBER_JOINED', me, { member_email: amma, member_name: 'Amma', guest: true }, '2026-09-01T00:00:00.000Z');
  // Amma paid 600 for dinner, split three ways; I paid her back 200.
  const dinner = ev('EXPENSE_ADD', amma, {
    title: 'Dinner', evaluated_amount: 600, logged_by: me,
    payers: [{ user: amma, value: 600 }],
    allocations: [{ user: me, value: 200 }, { user: asha, value: 200 }, { user: amma, value: 200 }],
    receipt_items: [{ name: 'Thali', amount: 600, members: [me, asha, amma], shares: { [amma]: 1, [me]: 1, [asha]: 1 } }],
  }, '2026-09-02T00:00:00.000Z');
  const payBack = ev('TRANSFER', me, { title: 'Payment', evaluated_amount: 200, target_peer_identity: amma }, '2026-09-03T00:00:00.000Z');

  it('splits with a guest like any member', () => {
    const L = computeLedgerState([joinAmma, dinner, payBack]);
    expect(L.profiles[amma]).toMatchObject({ name: 'Amma', guest: true });
    expect(L.members[amma].netBalance).toBe(200);
    expect(L.members[me].netBalance).toBe(0);
  });

  it('moves everything to the account the guest is linked to', () => {
    const mom = 'mom@x.dev';
    const momJoins = ev('MEMBER_JOINED', mom, { member_email: mom, member_name: 'Mom' }, '2026-09-04T00:00:00.000Z');
    const link = ev('MEMBER_MERGED', me, { from: amma, into: mom }, '2026-09-05T00:00:00.000Z');
    const L = computeLedgerState([joinAmma, dinner, payBack, momJoins, link]);
    expect(L.members[amma]).toBeUndefined();
    expect(L.members[mom].netBalance).toBe(200);
    expect(L.profiles[mom].name).toBe('Mom');
    const x = L.expenses.find((e) => e.title === 'Dinner');
    expect(x.payer).toBe(mom);
    expect(x.payload.allocations.map((a) => a.user)).toContain(mom);
    expect(x.payload.receipt_items[0].shares[mom]).toBe(1);
  });

  it('never merges a real account away, and ignores loops', () => {
    expect(mergeMap([ev('MEMBER_MERGED', me, { from: asha, into: me })])).toEqual({});
    expect(mergeMap([ev('MEMBER_MERGED', me, { from: 'guest:a', into: 'guest:b' }), ev('MEMBER_MERGED', me, { from: 'guest:b', into: 'guest:a' })])).toEqual({});
    expect(mergeMap([ev('MEMBER_MERGED', me, { from: 'guest:a', into: 'guest:b' }), ev('MEMBER_MERGED', me, { from: 'guest:b', into: me })])).toEqual({ 'guest:a': me, 'guest:b': me });
  });

  it('names guests "Guest" before their name is known', () => {
    expect(displayName('guest:zz', {}, me)).toBe('Guest');
  });
});

describe('split presets', () => {
  it('lists saved splits, skips deleted ones, and follows linked guests', () => {
    const p1 = ev('SPLIT_PRESET', me, { name: 'Rent 60/40', strategy: 'SHARES', inputs: { [me]: '3', 'guest:g1': '2' } }, '2026-09-01T00:00:00.000Z', 'p1');
    const p2 = ev('SPLIT_PRESET', me, { name: 'Just us', strategy: 'EQUALLY', members: [me, asha] }, '2026-09-01T00:00:01.000Z', 'p2');
    const del = ev('EXPENSE_DELETE', me, { target_event_id: 'p2' }, '2026-09-02T00:00:00.000Z');
    const link = ev('MEMBER_MERGED', me, { from: 'guest:g1', into: asha }, '2026-09-03T00:00:00.000Z');
    const L = computeLedgerState([p1, p2, del, link]);
    expect(L.presets).toEqual([{ id: 'p1', name: 'Rent 60/40', strategy: 'SHARES', members: [], inputs: { [me]: '3', [asha]: '2' } }]);
  });
});

describe('group budget', () => {
  it('takes the latest budget setting, any time', () => {
    const L = computeLedgerState([
      ev('GROUP_SETTINGS', me, { budget: 50000, budget_period: 'total' }, '2026-09-01T00:00:00.000Z'),
      expense('Villa', 21000, '2026-09-02T00:00:00.000Z'),
      ev('GROUP_SETTINGS', me, { budget: 60000, budget_period: 'month' }, '2026-09-03T00:00:00.000Z'),
    ]);
    expect(L.budget).toEqual({ amount: 60000, period: 'month' });
    expect(computeLedgerState([ev('GROUP_SETTINGS', me, { budget: 100 }), ev('GROUP_SETTINGS', me, { budget: 0 }, '2026-09-09T00:00:00.000Z')]).budget).toBeNull();
  });
});

describe('upcoming recurring', () => {
  it('lists what repeats in the next week, soonest first', () => {
    const rent = expense('Rent', 30000, new Date(2026, 6, 1, 9).toISOString(), { recurring: { every: 'month', series: 's1', owner: me } });
    const gym = expense('Gym', 1500, new Date(2026, 8, 20, 9).toISOString(), { recurring: { every: 'month', series: 's2', owner: me } });
    const up = upcomingRecurring({ flat: [rent], me: [gym] }, { now: new Date(2026, 9, 28, 12) });
    expect(up.map((u) => [u.title, u.when.getDate(), u.when.getMonth()])).toEqual([['Rent', 1, 10]]);
  });
});
