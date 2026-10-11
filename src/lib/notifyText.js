// src/lib/notifyText.js
// What to tell you about: new activity from other people (found when a group syncs) and
// reminders for recurring bills. Pure; notify.svelte.js shows them.
import { computeLedgerState, displayName, eventIdOf, parsePayload } from './engine.js';
import { nextOccurrence } from './recurring.js';
import { splitTags } from './tags.js';
import { money } from './format.js';

const MAX_PER_GROUP = 3; // more than this from one sync → one summary notification

/**
 * Notifications for events that just arrived from other members.
 * @param fresh the new events (not in the local cache before this sync)
 * @param all every event of the group after the sync
 * @param opts { me, groupId, groupName, kinds: { activity, payments } }
 * @returns [{ title, body, url, tag }]
 */
export function describeActivity(fresh, all, { me, groupId, groupName, kinds = { activity: true, payments: true } }) {
  const L = computeLedgerState(all);
  const cur = L.currency || undefined;
  const byId = new Map(all.map((e) => [eventIdOf(e), e]));
  const live = new Map(L.expenses.map((x) => [x.eventId, x]));
  const name = (email) => displayName(email, L.profiles, me);
  const involves = (p, actor) =>
    actor === me || p.target_peer_identity === me || p.logged_by === me ||
    (p.allocations || []).some((a) => a.user === me && parseFloat(a.value) > 0) || (p.payers || []).some((x) => x.user === me);
  const replaced = new Set(fresh.map((e) => parsePayload(e).replaces).filter(Boolean));
  const url = (eventId) => (eventId ? `#/g/${groupId}/e/${eventId}` : `#/g/${groupId}`);

  const out = [];
  for (const e of fresh) {
    let p;
    try {
      p = parsePayload(e);
    } catch {
      continue;
    }
    const by = p.logged_by || e.actor_identity;
    if (by === me) continue; // your own entries, from another device
    const who = name(by);
    const id = eventIdOf(e);
    const x = live.get(id);
    const title = splitTags(p.title || 'an entry').text;

    if (e.event_type === 'EXPENSE_ADD' && kinds.activity && x && involves(x.payload, x.payer)) {
      const share = (x.payload.allocations || []).filter((a) => a.user === me).reduce((s, a) => s + (parseFloat(a.value) || 0), 0);
      out.push({
        title: groupName,
        body: `${who} ${p.replaces ? 'edited' : 'added'} “${title}” · ${money(x.amount, cur)}${share > 0 ? ` · your share ${money(share, cur)}` : ''}`,
        url: url(id),
      });
    } else if (e.event_type === 'TRANSFER' && kinds.payments && x) {
      if (x.target === me) out.push({ title: groupName, body: `${name(x.payer)} paid you ${money(x.amount, cur)}`, url: url(id) });
      else if (x.payer === me) out.push({ title: groupName, body: `${who} recorded that you paid ${name(x.target)} ${money(x.amount, cur)}`, url: url(id) });
    } else if (e.event_type === 'COMMENT' && kinds.activity) {
      const target = live.get(p.target_event_id) || L.expenses.find((y) => y.payload.replaces === p.target_event_id);
      if (target && involves(target.payload, target.payer)) {
        out.push({ title: groupName, body: `${who} on “${splitTags(target.title).text}”: ${String(p.text || '').slice(0, 120)}`, url: url(target.eventId) });
      }
    } else if (e.event_type === 'EXPENSE_DELETE' && kinds.activity && !replaced.has(p.target_event_id)) {
      const gone = byId.get(p.target_event_id);
      if (!gone || gone.event_type === 'COMMENT' || gone.event_type === 'MEMBER_JOINED' || gone.event_type === 'SPLIT_PRESET') continue;
      let gp;
      try {
        gp = parsePayload(gone);
      } catch {
        continue;
      }
      if (involves(gp, gone.actor_identity)) out.push({ title: groupName, body: `${who} deleted “${splitTags(gp.title || 'an entry').text}”`, url: url() });
    } else if (e.event_type === 'MEMBER_JOINED' && kinds.activity && p.member_email !== me && !p.guest) {
      out.push({ title: groupName, body: `${p.member_name || name(p.member_email)} joined the group`, url: url() });
    }
  }

  if (out.length > MAX_PER_GROUP) {
    return [{ title: groupName, body: `${out.length} updates: ${out.slice(0, 2).map((n) => n.body).join(' · ')}…`, url: url(), tag: `group-${groupId}` }];
  }
  return out.map((n, i) => ({ ...n, tag: `${groupId}-${eventIdOf(fresh[i] || {}) || i}-${n.body.length}` }));
}

/**
 * Reminders for recurring bills you share in: at 9 am the day before (or straight away when that
 * has passed but the bill is still ahead).
 * @param groups { [groupId]: events }; names { [groupId]: name }
 * @returns [{ id, at: ms, title, body, url }]
 */
export function reminderSchedule(groups, names, me, { now = new Date(), days = 8 } = {}) {
  const until = now.getTime() + days * 86_400_000;
  const out = [];
  for (const [groupId, events] of Object.entries(groups)) {
    const L = computeLedgerState(events);
    for (const x of L.expenses) {
      const r = x.payload.recurring;
      if (x.type !== 'EXPENSE_ADD' || !r?.every) continue;
      const share = (x.payload.allocations || []).filter((a) => a.user === me).reduce((s, a) => s + (parseFloat(a.value) || 0), 0);
      if (share <= 0 && x.payer !== me) continue;
      const due = nextOccurrence(x.timestamp, r.every, now);
      if (!due || due.getTime() > until) continue;
      const dayBefore = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1, 9, 0);
      const cur = L.currency || undefined;
      const tomorrow = dayBefore.getTime() > now.getTime() || due.getDate() !== now.getDate();
      out.push({
        id: `rec-${r.series}-${due.toISOString().slice(0, 10)}`,
        at: Math.max(dayBefore.getTime(), Math.min(now.getTime(), due.getTime())),
        title: `${splitTags(x.title).text} is due ${tomorrow ? 'tomorrow' : 'today'}`,
        body: `${money(x.amount, cur)} in ${names[groupId] || 'your group'}${share > 0 ? ` · your share ${money(share, cur)}` : ''}. It's added automatically.`,
        url: `#/g/${groupId}`,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
