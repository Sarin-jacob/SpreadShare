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
  const state = { totalSpent: 0, members: {}, expenses: [], profiles: {} };
  
  // Track processed/deleted UUIDs to neutralize synchronization race conditions
  const processedEventIds = new Set();
  const deletedEventIds = new Set();

  const discoverMember = (email, name = null, picture = null) => {
    if (!state.members[email]) state.members[email] = { paid: 0, owes: 0, netBalance: 0 };
    if (!state.profiles[email]) state.profiles[email] = { name: email.split('@')[0], picture: null };
    if (name) state.profiles[email].name = name;
    if (picture) state.profiles[email].picture = picture;
  };;

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
    discoverMember(actor, payload.actor_name, payload.actor_picture);

    if (event.event_type === 'MEMBER_JOINED') {
      discoverMember(payload.member_email, payload.member_name, payload.member_picture);
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
      rawPayload: payload
    });
  }

  // 4. Calculate final net positions
  Object.keys(state.members).forEach(m => {
    const member = state.members[m];
    member.netBalance = roundMoney(member.paid - member.owes);
  });
  
  return state;
}

/**
 * Minimum Cash Flow Algorithm
 * Simplifies a complex web of debts into the minimum number of direct transfers.
 * 
 * @param {Object} membersMap - The members object from computeLedgerState 
 * @returns {Array} Array of simplified settlement objects { from, to, amount }
 */
export function optimizeDebts(membersMap) {
  const debtors = [];
  const creditors = [];

  // 1. Separate into buckets based on net position
  Object.entries(membersMap).forEach(([email, data]) => {
    // Use 0.01 threshold to avoid microscopic floating point ghosts
    if (data.netBalance < -0.01) {
      debtors.push({ email, amount: Math.abs(data.netBalance) });
    } else if (data.netBalance > 0.01) {
      creditors.push({ email, amount: data.netBalance });
    }
  });

  // 2. Sort descending to settle largest debts first (heuristic for fewer transactions)
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0; // Debtors pointer
  let j = 0; // Creditors pointer

  // 3. Greedily match debtors to creditors
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    // The maximum we can settle right now is the smaller of the two balances
    const settledAmount = Math.min(debtor.amount, creditor.amount);
    
    settlements.push({
      from: debtor.email,
      to: creditor.email,
      amount: roundMoney(settledAmount)
    });

    // Deduct the settled amount from both
    debtor.amount = roundMoney(debtor.amount - settledAmount);
    creditor.amount = roundMoney(creditor.amount - settledAmount);

    // Move pointers if a balance is fully resolved
    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return settlements;
}