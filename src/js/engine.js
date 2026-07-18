// src/js/engine.js

// Fixes JS floating point precision errors (e.g., 0.1 + 0.2 !== 0.3)
const roundMoney = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

/**
 * Replays the append-only ledger events to compute the active group state.
 * This is a Pure Function: it does not mutate the input array.
 * 
 * @param {Array} rawEvents - Raw event rows
 * @returns {Object} Reconstructed state containing totalSpent, members, and formatted expenses
 */
export function computeLedgerState(rawEvents) {
  const state = { totalSpent: 0, members: {}, expenses: [] };
  
  // Track processed/deleted UUIDs to neutralize synchronization race conditions
  const processedEventIds = new Set();
  const deletedEventIds = new Set();

  const discoverMember = (email) => {
    if (!state.members[email]) state.members[email] = { paid: 0, owes: 0, netBalance: 0 };
  };

  // 1. Sort a COPY of the events chronologically (Never mutate the source array!)
  const events = [...rawEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // 2. Extract global deletion tokens first
  events.forEach(e => {
    const id = e.eventId || e.event_id;
    if (e.event_type === 'EXPENSE_DELETE') {
      const payload = typeof e.payload_json === 'string' ? JSON.parse(e.payload_json) : e.payload_json;
      deletedEventIds.add(payload.target_event_id);
    }
  });

  // 3. Replay transactional event logs stream
  for (const event of events) {
    const id = event.eventId || event.event_id;
    
    // ─── DEDUPLICATION & DELETION ENFORCEMENT ───
    if (processedEventIds.has(id) || deletedEventIds.has(id) || event.event_type === 'EXPENSE_DELETE') {
      continue; 
    }
    processedEventIds.add(id);

    const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
    const actor = event.actor_identity;
    discoverMember(actor);

    if (event.event_type === 'MEMBER_JOINED') {
      discoverMember(payload.member_email);
      continue;
    }

    const amount = roundMoney(parseFloat(payload.evaluated_amount) || 0);
    const targetPeer = payload.target_peer_identity || "";
    if (targetPeer) discoverMember(targetPeer);

    switch (event.event_type) {
      case 'EXPENSE_ADD':
        state.totalSpent = roundMoney(state.totalSpent + amount);
        
        // DYNAMIC MULTI-PAYER CREDIT PROCESSING
        if (payload.payers && payload.payers.length > 0) {
          payload.payers.forEach(p => {
            discoverMember(p.user);
            state.members[p.user].paid = roundMoney(state.members[p.user].paid + (parseFloat(p.value) || 0));
          });
        } else {
          state.members[actor].paid = roundMoney(state.members[actor].paid + amount);
        }
        
        // SPLIT DEBITS COMPUTATIONS
        if (payload.allocations && payload.allocations.length > 0) {
          payload.allocations.forEach(alloc => {
            discoverMember(alloc.user);
            state.members[alloc.user].owes = roundMoney(state.members[alloc.user].owes + (parseFloat(alloc.value) || 0));
          });
        }
        break;

      case 'TRANSFER':
        state.members[actor].paid = roundMoney(state.members[actor].paid + amount);
        state.members[targetPeer].owes = roundMoney(state.members[targetPeer].owes + amount);
        break;

      case 'LOAN':
        const rate = parseFloat(payload.interest_rate) || 0;
        const type = payload.interest_type || 'NONE';
        const finalValue = roundMoney(amount * ((type === 'NONE') ? 1.0 : (1 + (rate / 100))));
        
        state.members[actor].paid = roundMoney(state.members[actor].paid + finalValue);
        state.members[targetPeer].owes = roundMoney(state.members[targetPeer].owes + finalValue);
        break;
    }

    state.expenses.push({
      eventId: id,
      title: payload.title,
      type: event.event_type,
      category: payload.category || 'General',
      amount: amount,
      payer: actor,
      target: targetPeer,
      timestamp: payload.custom_timestamp || event.timestamp,
      receiptUrl: payload.receipt_local_url || null,
      rawPayload: payload // Store raw payload for the UI to reconstruct specific views
    });
  }

  // 4. Calculate final net positions
  Object.keys(state.members).forEach(m => {
    const member = state.members[m];
    member.netBalance = roundMoney(member.paid - member.owes);
  });
  
  return state;
}