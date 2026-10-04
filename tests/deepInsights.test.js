import { describe, it, expect } from 'vitest';
import { myExpenses, monthCompare, monthlyTrend, topPlaces, biggest, sharedWith, covered, monthCalendar, recurringPerMonth } from '../src/lib/deepInsights.js';

const me = 'me@x.dev';
const asha = 'asha@x.dev';
const ravi = 'ravi@x.dev';
let n = 0;
const exp = (title, amount, date, { payer = me, with: others = [asha], category = 'Food', extra = {} } = {}) => {
  const people = [me, ...others];
  return {
    spreadsheetId: 'g',
    eventId: `e${++n}`,
    timestamp: date.toISOString(),
    event_type: 'EXPENSE_ADD',
    actor_identity: payer,
    payload_json: {
      title,
      evaluated_amount: amount,
      category,
      custom_timestamp: date.toISOString(),
      payers: [{ user: payer, value: amount }],
      allocations: people.map((u) => ({ user: u, value: amount / people.length })),
      ...extra,
    },
  };
};

const now = new Date(2026, 9, 15, 12); // 15 Oct
const events = [
  exp('Swiggy dinner', 600, new Date(2026, 9, 2)), // share 300, paid 600
  exp('Groceries', 400, new Date(2026, 9, 10), { payer: asha, category: 'Groceries' }), // share 200
  exp('Swiggy lunch', 300, new Date(2026, 9, 12), { with: [asha, ravi] }), // share 100
  exp('Cab', 200, new Date(2026, 8, 5), { category: 'Travel' }), // Sep 5: share 100
  exp('Rent', 20000, new Date(2026, 8, 1), { payer: asha, category: 'Stay', extra: { recurring: { every: 'month', series: 's', owner: asha } } }), // share 10000
  exp('Movie', 500, new Date(2026, 8, 25), { category: 'Entertainment' }), // after the same point last month
];
const rows = myExpenses({ g: events }, me);

describe('deep insights', () => {
  it('collects your share and what you paid', () => {
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.x.title === 'Swiggy dinner')).toMatchObject({ share: 300, paid: 600 });
  });

  it('compares this month with last month at the same point', () => {
    const m = monthCompare(rows, now);
    expect(m.soFar).toBe(600);
    expect(m.lastSamePoint).toBe(10100); // rent + cab, before 15 Sep
    expect(m.lastFull).toBe(10350);
    expect(m.forecast).toBe(1240); // 600 / 15 days × 31
    expect(m.categories[0]).toMatchObject({ category: 'Stay', now: 0, before: 10000 });
  });

  it('builds a six-month trend', () => {
    const t = monthlyTrend(rows, { now });
    expect(t).toHaveLength(6);
    expect(t.at(-1)).toMatchObject({ month: '2026-10', total: 600 });
    expect(t.at(-2).byCategory).toMatchObject({ Stay: 10000, Travel: 100, Entertainment: 250 });
  });

  it('ranks places, biggest expenses and people', () => {
    expect(topPlaces(rows)[0]).toMatchObject({ name: 'Rent', total: 10000 });
    expect(topPlaces(rows.filter((r) => r.date.getMonth() === 9)).map((p) => p.name)).toEqual(['Swiggy dinner', 'Groceries', 'Swiggy lunch']);
    expect(biggest(rows, { limit: 2 }).map((r) => r.x.title)).toEqual(['Rent', 'Swiggy dinner']);
    expect(sharedWith(rows, me).map((p) => [p.member, p.count])).toEqual([[asha, 6], [ravi, 1]]);
  });

  it('works out what you covered for others', () => {
    expect(covered(rows.filter((r) => r.date.getMonth() === 9))).toEqual({ paid: 900, share: 600, covered: 300 });
  });

  it('lays out a Monday-first calendar', () => {
    const c = monthCalendar(rows, now);
    expect(c.values).toHaveLength(31);
    expect(c.values[1]).toBe(300);
    expect(c.offset).toBe(3); // 1 Oct 2026 is a Thursday
  });

  it('adds up recurring commitments per month', () => {
    expect(recurringPerMonth(rows)).toMatchObject({ total: 10000, items: [{ title: 'Rent', monthly: 10000 }] });
  });
});
