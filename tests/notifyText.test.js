import { describe, it, expect } from 'vitest';
import { describeActivity, reminderSchedule } from '../src/lib/notifyText.js';

const me = 'me@x.dev';
const asha = 'asha@x.dev';
const kiran = 'kiran@x.dev';
let n = 0;
const ev = (type, actor, payload, ts = '2026-10-01T10:00:00.000Z', eventId = `e${++n}`) => ({ spreadsheetId: 'g', eventId, timestamp: ts, event_type: type, actor_identity: actor, payload_json: payload });
const joined = [me, asha, kiran].map((m) => ev('MEMBER_JOINED', m, { member_email: m, member_name: { [me]: 'Me', [asha]: 'Asha', [kiran]: 'Kiran' }[m] }, '2026-09-01T00:00:00.000Z'));
const dinner = (by = asha, people = [me, asha]) =>
  ev('EXPENSE_ADD', by, { title: 'Dinner #goa', evaluated_amount: 600, logged_by: by, payers: [{ user: by, value: 600 }], allocations: people.map((u) => ({ user: u, value: 600 / people.length })) });
const opts = { me, groupId: 'g', groupName: 'Goa Trip' };

describe('activity notifications', () => {
  it('tells you about an expense you are in, with your share', () => {
    const d = dinner();
    const [note, ...rest] = describeActivity([d], [...joined, d], opts);
    expect(rest).toEqual([]);
    expect(note).toMatchObject({ title: 'Goa Trip', url: `#/g/g/e/${d.eventId}` });
    expect(note.body).toMatch(/^Asha added “Dinner” · .*600.* · your share .*300/);
  });

  it('skips your own entries and ones you are not part of', () => {
    const mine = dinner(me);
    const notMine = dinner(asha, [asha, kiran]);
    expect(describeActivity([mine, notMine], [...joined, mine, notMine], opts)).toEqual([]);
  });

  it('tells you when someone pays you', () => {
    const t = ev('TRANSFER', kiran, { title: 'Payment', evaluated_amount: 500, target_peer_identity: me, logged_by: kiran });
    expect(describeActivity([t], [...joined, t], opts)[0].body).toMatch(/^Kiran paid you .*500/);
    expect(describeActivity([t], [...joined, t], { ...opts, kinds: { activity: true, payments: false } })).toEqual([]);
  });

  it('reports an edit once, not as a delete plus an add', () => {
    const d = dinner();
    const del = ev('EXPENSE_DELETE', asha, { target_event_id: d.eventId, logged_by: asha });
    const edit = ev('EXPENSE_ADD', asha, { title: 'Dinner', evaluated_amount: 800, logged_by: asha, replaces: d.eventId, payers: [{ user: asha, value: 800 }], allocations: [{ user: me, value: 400 }, { user: asha, value: 400 }] });
    const notes = describeActivity([del, edit], [...joined, d, del, edit], opts);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toMatch(/^Asha edited “Dinner”/);
  });

  it('includes comments on your entries', () => {
    const d = dinner(me);
    const c = ev('COMMENT', asha, { target_event_id: d.eventId, text: 'Thanks!', logged_by: asha });
    expect(describeActivity([c], [...joined, d, c], opts)[0].body).toBe('Asha on “Dinner”: Thanks!');
  });

  it('sums up a busy sync in one notification', () => {
    const many = [dinner(), dinner(), dinner(), dinner()];
    const notes = describeActivity(many, [...joined, ...many], opts);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ tag: 'group-g' });
    expect(notes[0].body).toMatch(/^4 updates:/);
  });
});

describe('recurring reminders', () => {
  it('reminds the day before a bill you share in', () => {
    const rent = ev('EXPENSE_ADD', asha, {
      title: 'Rent', evaluated_amount: 30000, custom_timestamp: new Date(2026, 8, 1, 9).toISOString(),
      payers: [{ user: asha, value: 30000 }], allocations: [{ user: me, value: 15000 }, { user: asha, value: 15000 }],
      recurring: { every: 'month', series: 'r1', owner: asha },
    }, new Date(2026, 8, 1, 9).toISOString());
    const [r] = reminderSchedule({ g: [...joined, rent] }, { g: 'Flat' }, me, { now: new Date(2026, 9, 28, 12) });
    expect(r).toMatchObject({ title: 'Rent is due tomorrow', url: '#/g/g' });
    expect(r.id).toMatch(/^rec-r1-/);
    expect(new Date(r.at)).toEqual(new Date(2026, 9, 31, 9, 0));
    expect(r.body).toMatch(/in Flat · your share/);
  });
});
