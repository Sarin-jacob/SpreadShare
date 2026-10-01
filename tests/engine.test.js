import { describe, it, expect } from 'vitest';
import { computeLedgerState, optimizeDebts } from '../src/lib/engine.js';
import { processAnalytics } from '../src/lib/insights.js';

const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
let seq = 0;
const ev = (type, actor, payload, daysAgo = 1) => ({
  eventId: `e${++seq}`,
  timestamp: day(daysAgo),
  event_type: type,
  actor_identity: actor,
  payload_json: { custom_timestamp: day(daysAgo), ...payload },
});
const expense = (payer, amount, allocations, extra = {}) =>
  ev('EXPENSE_ADD', payer, {
    title: 'x',
    evaluated_amount: amount,
    payers: [{ user: payer, value: amount }],
    allocations: Object.entries(allocations).map(([user, value]) => ({ user, value })),
    ...extra,
  });

describe('computeLedgerState', () => {
  const dinner = expense('me', 3000, { me: 1000, asha: 1000, ravi: 1000 }, { category: 'Food' });
  const scooter = expense('asha', 1200, { me: 600, asha: 600 }, { category: 'Travel' });
  const payment = ev('TRANSFER', 'ravi', { evaluated_amount: 500, target_peer_identity: 'me' });

  it('nets payers, shares and transfers', () => {
    const s = computeLedgerState([dinner, scooter, payment]);
    expect(s.members.me.netBalance).toBe(900);
    expect(s.members.asha.netBalance).toBe(-400);
    expect(s.members.ravi.netBalance).toBe(-500);
    expect(s.totalSpent).toBe(4200);
  });

  it('balances always sum to zero', () => {
    const s = computeLedgerState([dinner, scooter, payment]);
    const total = Object.values(s.members).reduce((t, m) => t + m.netBalance, 0);
    expect(Math.abs(total)).toBeLessThan(0.01);
  });

  it('ignores deleted entries', () => {
    const del = ev('EXPENSE_DELETE', 'me', { target_event_id: dinner.eventId });
    const s = computeLedgerState([dinner, scooter, del]);
    expect(s.expenses.map((x) => x.eventId)).toEqual([scooter.eventId]);
    expect(s.members.me.netBalance).toBe(-600);
  });

  it('applies simple interest on loans', () => {
    const loan = ev('LOAN', 'me', { evaluated_amount: 1000, target_peer_identity: 'ravi', interest_type: 'SIMPLE', interest_rate: 10 });
    expect(computeLedgerState([loan]).members.ravi.netBalance).toBe(-1100);
  });

  it("doesn't rename the payer of a transfer logged by someone else (legacy rows)", () => {
    const legacy = ev('TRANSFER', 'ravi', { evaluated_amount: 1, target_peer_identity: 'me', actor_name: 'Logger' });
    expect(computeLedgerState([legacy]).profiles.ravi.name).not.toBe('Logger');
  });

  it('skips corrupt rows instead of failing', () => {
    const broken = { eventId: 'bad', timestamp: day(1), event_type: 'EXPENSE_ADD', actor_identity: 'me', payload_json: '{nope' };
    expect(() => computeLedgerState([broken, dinner])).not.toThrow();
  });
});

describe('optimizeDebts', () => {
  it('produces the minimal set of payments', () => {
    const members = { me: { netBalance: 900 }, asha: { netBalance: -400 }, ravi: { netBalance: -500 } };
    expect(optimizeDebts(members)).toEqual([
      { from: 'ravi', to: 'me', amount: 500 },
      { from: 'asha', to: 'me', amount: 400 },
    ]);
  });

  it('returns nothing when everyone is settled', () => {
    expect(optimizeDebts({ a: { netBalance: 0 }, b: { netBalance: 0.004 } })).toEqual([]);
  });
});

describe('processAnalytics', () => {
  const recent = expense('me', 300, { me: 100, asha: 200 }, { category: 'Food' });
  const old = expense('me', 999, { me: 999 }, { category: 'Food' });
  old.payload_json.custom_timestamp = day(400);

  it('counts only your share when scoped to you', () => {
    expect(processAnalytics([recent], 'me', 30).total).toBe(100);
    expect(processAnalytics([recent], null, 30).total).toBe(300);
  });

  it('respects the time window and builds one trend bucket per day', () => {
    const d = processAnalytics([recent, old], 'me', 30);
    expect(d.count).toBe(1);
    expect(d.trend).toHaveLength(30);
    expect(processAnalytics([recent, old], 'me', 0).count).toBe(2);
  });
});
