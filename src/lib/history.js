// src/lib/history.js
// Edit history and comments for ledger entries. Pure functions over the raw event log.
//
// An edit is recorded as EXPENSE_DELETE(old) + a new entry whose payload has `replaces: oldId`,
// so versions form a chain. Comments are COMMENT events ({ target_event_id, text }) and follow the
// chain, so a comment on an old version still shows on the current one. Older clients ignore
// COMMENT events entirely, and deleting a comment reuses EXPENSE_DELETE on the comment's id.
import { parsePayload, eventIdOf, deletedIds } from './engine.js';

const payloadOf = (e) => {
  try {
    return parsePayload(e);
  } catch {
    return {};
  }
};

/** Map of eventId → the id of the version that replaced it. */
function replacedBy(events) {
  const next = new Map();
  for (const e of events) {
    const prev = payloadOf(e).replaces;
    if (prev) next.set(prev, eventIdOf(e));
  }
  return next;
}

/** Follows edits forward to the newest version of an entry. */
export function latestVersionId(events, eventId, next = replacedBy(events)) {
  let id = eventId;
  const seen = new Set();
  while (next.has(id) && !seen.has(id)) {
    seen.add(id);
    id = next.get(id);
  }
  return id;
}

/** Every version of the entry, oldest first: [{ eventId, event, payload, at, by }]. */
export function versionChain(events, eventId) {
  const byId = new Map(events.map((e) => [eventIdOf(e), e]));
  const chain = [];
  const seen = new Set();
  let id = eventId;
  while (id && byId.has(id) && !seen.has(id)) {
    seen.add(id);
    const event = byId.get(id);
    const payload = payloadOf(event);
    chain.unshift({ eventId: id, event, payload, at: event.timestamp, by: payload.logged_by || event.actor_identity });
    id = payload.replaces;
  }
  return chain;
}

/** Comments on any version of the entry, oldest first. */
export function commentsFor(events, eventId) {
  const ids = new Set(versionChain(events, eventId).map((v) => v.eventId));
  const deleted = deletedIds(events);
  return events
    .filter((e) => e.event_type === 'COMMENT' && !deleted.has(eventIdOf(e)) && ids.has(payloadOf(e).target_event_id))
    .map((e) => ({ eventId: eventIdOf(e), by: e.actor_identity, at: e.timestamp, text: payloadOf(e).text || '' }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

/** For the activity feed: newest-version id → { comments, edited }. */
export function entryMeta(events) {
  const next = replacedBy(events);
  const deleted = deletedIds(events);
  const meta = new Map();
  const get = (id) => meta.get(id) ?? (meta.set(id, { comments: 0, edited: false }), meta.get(id));
  for (const e of events) {
    const p = payloadOf(e);
    if (e.event_type === 'COMMENT' && !deleted.has(eventIdOf(e)) && p.target_event_id) {
      get(latestVersionId(events, p.target_event_id, next)).comments++;
    } else if (p.replaces) {
      get(eventIdOf(e)).edited = true;
    }
  }
  return meta;
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const normSplit = (p) =>
  (p.allocations || [])
    .map((a) => [a.user, Math.round((parseFloat(a.value) || 0) * 100)])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
// Who paid, and each payer's fraction (amount changes are reported separately).
const normPayers = (p) => {
  const list = p.payers || [];
  const total = list.reduce((s, a) => s + (parseFloat(a.value) || 0), 0) || 1;
  return list
    .map((a) => [a.user, Math.round(((parseFloat(a.value) || 0) / total) * 1000)])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
};

/**
 * Plain-language list of what changed between two versions.
 * @param fmt { money(n), name(email), date(iso), category(value) }
 */
export function describeChanges(prev, next, fmt) {
  const out = [];
  const amt = (p) => Math.round((parseFloat(p.evaluated_amount) || 0) * 100) / 100;
  if (amt(prev) !== amt(next)) out.push(`Amount ${fmt.money(amt(prev))} → ${fmt.money(amt(next))}`);
  if ((prev.title || '') !== (next.title || '')) out.push(`Title “${prev.title || ''}” → “${next.title || ''}”`);
  if ((prev.category || '') !== (next.category || '') && next.category !== 'Financial') {
    out.push(`Category ${fmt.category(prev.category)} → ${fmt.category(next.category)}`);
  }
  const day = (p) => String(p.custom_timestamp || '').slice(0, 10);
  if (day(prev) && day(next) && day(prev) !== day(next)) out.push(`Date ${fmt.date(prev.custom_timestamp)} → ${fmt.date(next.custom_timestamp)}`);
  if (!sameJson(normPayers(prev), normPayers(next))) {
    const who = (p) => (p.payers || []).map((x) => fmt.name(x.user)).join(', ') || '—';
    out.push(`Paid by ${who(prev)} → ${who(next)}`);
  }
  if (!sameJson(normSplit(prev), normSplit(next)) || (prev.split_strategy || 'EQUALLY') !== (next.split_strategy || 'EQUALLY')) out.push('Split changed');
  if ((prev.target_peer_identity || '') !== (next.target_peer_identity || '') && next.target_peer_identity) {
    out.push(`To ${fmt.name(prev.target_peer_identity)} → ${fmt.name(next.target_peer_identity)}`);
  }
  if ((prev.notes || '') !== (next.notes || '')) out.push(next.notes ? (prev.notes ? 'Note edited' : 'Note added') : 'Note removed');
  if ((prev.receipt_local_url || '') !== (next.receipt_local_url || '')) out.push(next.receipt_local_url ? 'Receipt changed' : 'Receipt removed');
  const every = (q) => ({ week: 'weekly', month: 'monthly' })[q.recurring?.every] || 'never';
  if (every(prev) !== every(next)) out.push(`Repeats ${every(prev)} → ${every(next)}`);
  return out.length ? out : ['No visible changes'];
}
