// src/lib/members.js
// Members without a Google account ("guests"). A guest is an identity like "guest:k7f3a2" with a
// name, added by anyone in the group; others log expenses and payments for them. When the person
// joins with Google, a MEMBER_MERGED event { from: guestId, into: email } moves everything the
// guest had to their account: the ledger reads every past entry as theirs.

export const GUEST_PREFIX = 'guest:';
export const isGuest = (id) => String(id || '').startsWith(GUEST_PREFIX);
export const newGuestId = () => GUEST_PREFIX + crypto.randomUUID().replace(/-/g, '').slice(0, 10);

/**
 * guestId → the identity everything should count under, following chains (a → b → c).
 * Deleted merge events don't count. Only guests can be merged, so real accounts never vanish.
 */
export function mergeMap(events, deleted = new Set()) {
  const direct = {};
  for (const e of events) {
    if (e.event_type !== 'MEMBER_MERGED' || deleted.has(e.eventId || e.event_id)) continue;
    let p;
    try {
      p = typeof e.payload_json === 'string' ? JSON.parse(e.payload_json) : e.payload_json || {};
    } catch {
      continue;
    }
    if (isGuest(p.from) && p.into && p.into !== p.from) direct[p.from] = p.into;
  }
  const out = {};
  for (const from of Object.keys(direct)) {
    let to = direct[from];
    const seen = new Set([from]);
    while (direct[to] && !seen.has(to)) {
      seen.add(to);
      to = direct[to];
    }
    if (!seen.has(to)) out[from] = to;
  }
  return out;
}

/** A copy of an event payload with every member identity passed through `A`. */
export function remapPayload(p, A) {
  const user = (x) => (x && x.user ? { ...x, user: A(x.user) } : x);
  const out = { ...p };
  if (p.payers) out.payers = p.payers.map(user);
  if (p.allocations) out.allocations = p.allocations.map(user);
  if (p.split_members) out.split_members = p.split_members.map(A);
  if (p.target_peer_identity) out.target_peer_identity = A(p.target_peer_identity);
  if (p.logged_by) out.logged_by = A(p.logged_by);
  if (p.split_inputs) out.split_inputs = Object.fromEntries(Object.entries(p.split_inputs).map(([k, v]) => [A(k), v]));
  if (p.receipt_items) {
    out.receipt_items = p.receipt_items.map((i) => ({
      ...i,
      members: (i.members || []).map(A),
      ...(i.shares ? { shares: Object.fromEntries(Object.entries(i.shares).map(([k, v]) => [A(k), v])) } : {}),
    }));
  }
  return out;
}
