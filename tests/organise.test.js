import { describe, it, expect } from 'vitest';
import { extractTags, splitTags, tagCounts } from '../src/lib/tags.js';
import { versionChain, commentsFor, entryMeta, latestVersionId, describeChanges } from '../src/lib/history.js';
import { computeLedgerState } from '../src/lib/engine.js';
import { buildStatement, memberEffect, monthRange, statementText, statementCsv } from '../src/lib/statement.js';
import { budgetStatus, budgetAlert, monthToDate } from '../src/lib/budgets.js';

let n = 0;
const at = (iso) => new Date(iso).toISOString();
const ev = (type, actor, payload, ts) => ({ eventId: `e${++n}`, timestamp: at(ts), event_type: type, actor_identity: actor, payload_json: { custom_timestamp: at(ts), ...payload } });
const expense = (payer, amount, alloc, ts, extra = {}) =>
  ev('EXPENSE_ADD', payer, { title: 'x', evaluated_amount: amount, payers: [{ user: payer, value: amount }], allocations: Object.entries(alloc).map(([user, value]) => ({ user, value })), ...extra }, ts);

describe('tags', () => {
  it('extracts #tags case-insensitively, ignoring "#" inside words', () => {
    expect(extractTags('Dinner #Goa #office', 'note #goa')).toEqual(['goa', 'office']);
    expect(extractTags('Invoice no#123 and C#')).toEqual([]);
    expect(extractTags('(#work) trip, #बेंगलुरु')).toEqual(['work', 'बेंगलुरु']);
  });
  it('splits tags out of a title for display', () => {
    expect(splitTags('Dinner #goa #office')).toEqual({ text: 'Dinner', tags: ['goa', 'office'] });
    expect(splitTags('#goa')).toEqual({ text: '#goa', tags: ['goa'] });
  });
  it('counts tags across entries', () => {
    const xs = [{ payload: { title: 'a #goa' } }, { payload: { title: 'b', notes: '#goa #food' } }];
    expect(tagCounts(xs)).toEqual([{ tag: 'goa', count: 2 }, { tag: 'food', count: 1 }]);
  });
});

describe('history', () => {
  const v1 = expense('me', 400, { me: 200, asha: 200 }, '2026-09-10T10:00', { title: 'Cab', category: 'Travel' });
  const c1 = ev('COMMENT', 'asha', { target_event_id: v1.eventId, text: 'was it 400?' }, '2026-09-10T11:00');
  const del1 = ev('EXPENSE_DELETE', 'me', { target_event_id: v1.eventId }, '2026-09-10T12:00');
  const v2 = expense('me', 450, { me: 225, asha: 225 }, '2026-09-10T12:00', { title: 'Cab', category: 'Travel', replaces: v1.eventId, logged_by: 'me' });
  const c2 = ev('COMMENT', 'me', { target_event_id: v2.eventId, text: 'fixed, it was 450' }, '2026-09-10T12:05');
  const c3 = ev('COMMENT', 'asha', { target_event_id: v2.eventId, text: 'oops' }, '2026-09-10T12:06');
  const delC3 = ev('EXPENSE_DELETE', 'asha', { target_event_id: c3.eventId }, '2026-09-10T12:07');
  const events = [v1, c1, del1, v2, c2, c3, delC3];

  it('chains versions oldest → newest and finds the latest', () => {
    expect(versionChain(events, v2.eventId).map((v) => v.eventId)).toEqual([v1.eventId, v2.eventId]);
    expect(latestVersionId(events, v1.eventId)).toBe(v2.eventId);
  });

  it('carries comments across edits and hides deleted ones', () => {
    expect(commentsFor(events, v2.eventId).map((c) => c.text)).toEqual(['was it 400?', 'fixed, it was 450']);
  });

  it('marks edited entries and counts comments on the newest version', () => {
    expect(entryMeta(events).get(v2.eventId)).toEqual({ comments: 2, edited: true });
  });

  it('describes what changed', () => {
    const fmt = { money: (x) => `₹${x}`, name: (e) => e, date: (d) => d.slice(0, 10), category: (c) => c };
    expect(describeChanges(v1.payload_json, v2.payload_json, fmt)).toEqual(['Amount ₹400 → ₹450', 'Split changed']);
  });

  it('comments never affect balances or the feed', () => {
    const s = computeLedgerState(events);
    expect(s.expenses).toHaveLength(1);
    expect(s.members.me.netBalance).toBe(225);
  });
});

describe('statement', () => {
  const events = [
    expense('me', 300, { me: 100, asha: 200 }, '2026-08-20T12:00', { title: 'Old dinner' }), // August: me +200
    expense('asha', 600, { me: 300, asha: 300 }, '2026-09-05T12:00', { title: 'Groceries' }), // me −300
    ev('TRANSFER', 'asha', { evaluated_amount: 100, target_peer_identity: 'me' }, '2026-09-12T12:00'), // asha paid me → me −100
    expense('ravi', 90, { ravi: 90 }, '2026-09-15T12:00', { title: 'Not me' }),
    expense('me', 50, { me: 25, asha: 25 }, '2026-10-01T12:00', { title: 'Next month' }),
  ];
  const { expenses, members } = computeLedgerState(events);
  const st = buildStatement(expenses, 'me', monthRange('2026-09'));

  it('opening + entries = closing, and skips entries you are not in', () => {
    expect(st.opening).toBe(200);
    expect(st.rows.map((r) => [r.expense.title, r.net, r.balance])).toEqual([
      ['Groceries', -300, -100],
      ['Untitled', -100, -200],
    ]);
    expect(st.closing).toBe(-200);
    expect(st.totals).toMatchObject({ paid: 0, share: 300, received: 100, spent: 690 });
  });

  it('all-time statement matches the app balance', () => {
    const all = buildStatement(expenses, 'me', { from: new Date(0), to: new Date(2100, 0, 1) });
    expect(all.closing).toBe(members.me.netBalance);
  });

  it('effects for payments and loans with interest', () => {
    const loan = { type: 'LOAN', amount: 1000, payer: 'me', target: 'ravi', payload: { interest_type: 'SIMPLE', interest_rate: 10 } };
    expect(memberEffect(loan, 'ravi')).toEqual({ paid: 0, share: 1100, net: -1100 });
  });

  it('exports text and CSV', () => {
    const fmt = { group: 'Flat', person: 'You', period: 'September 2026', money: (x) => `₹${x}`, name: (e) => e, date: (d) => d.slice(5, 10) };
    const text = statementText(st, fmt);
    expect(text).toContain('Opening balance: +₹200');
    expect(text).toContain('Closing balance: −₹200 (owes)');
    const csv = statementCsv(st, fmt).split('\n');
    expect(csv).toHaveLength(5); // header, opening, 2 rows, closing
    expect(csv.at(-1)).toContain('"-200"');
  });
});

describe('budgets', () => {
  const now = new Date(2026, 9, 20, 12);
  const events = [
    expense('me', 2000, { me: 1000, asha: 1000 }, '2026-10-03T12:00', { category: 'Food' }),
    expense('me', 900, { me: 900 }, '2026-10-10T12:00', { category: 'Food' }),
    expense('me', 5000, { me: 5000 }, '2026-09-25T12:00', { category: 'Food' }), // last month: ignored
    expense('me', 300, { me: 300 }, '2026-10-11T12:00', { category: 'Travel' }),
  ];
  const data = monthToDate(events, 'me', now);

  it('uses your share for this month only', () => {
    expect(data.categories).toEqual({ Food: 1900, Travel: 300 });
  });

  it('rates each budget', () => {
    const rows = budgetStatus({ Food: 2000, Travel: 1000, '*': 2100 }, data);
    expect(rows.map((r) => [r.category, r.status])).toEqual([['*', 'over'], ['Food', 'near'], ['Travel', 'ok']]);
  });

  it('alerts only when near or over', () => {
    expect(budgetAlert({ Food: 2000 }, data, 'Food')).toMatchObject({ category: 'Food', status: 'near' });
    expect(budgetAlert({ Travel: 1000 }, data, 'Travel')).toBeNull();
  });
});
