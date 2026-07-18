// src/js/engine.js

/**
 * Replays the append-only ledger events to compute the active group state.
 * @param {Array} events - Raw event rows sorted by timestamp/row index
 * @returns {Object} Reconstructed state containing members, total spent, and balances
 */
export function reconstructState(events) {
  const state = {
    totalSpent: 0,
    members: {}, // Map of email -> total spent / balances
    expenses: []
  };

  for (const event of events) {
    if (event.event_type === 'EXPENSE_ADD') {
      const payload = typeof event.payload_json === 'string' 
        ? JSON.parse(event.payload_json) 
        : event.payload_json;
      
      const parsedAmount = parseFloat(payload.evaluated_amount) || 0;
      state.totalSpent += parsedAmount;
      
      const payer = event.actor_identity;
      
      // Initialize payer record
      if (!state.members[payer]) {
        state.members[payer] = { paid: 0, owes: 0, netBalance: 0 };
      }
      state.members[payer].paid += parsedAmount;

      // Process allocations
      if (payload.allocations) {
        payload.allocations.forEach(alloc => {
          const user = alloc.user;
          const share = parseFloat(alloc.value) || 0;
          
          if (!state.members[user]) {
            state.members[user] = { paid: 0, owes: 0, netBalance: 0 };
          }
          state.members[user].owes += share;
        });
      }

      state.expenses.push({
        eventId: event.event_id,
        title: payload.title,
        amount: parsedAmount,
        payer: payer,
        timestamp: event.timestamp
      });
    }
  }

  // Calculate final net positions (Positive = gets money back, Negative = owes money)
  for (const email in state.members) {
    const member = state.members[email];
    member.netBalance = member.paid - member.owes;
  }

  return state;
}

export function evaluateAdvancedLedgerState(events) {
  const state = { totalSpent: 0, members: {}, expenses: [] };

  // Helper to safely initialize a user profile node in our memory balance sheet
  const discoverMember = (email) => {
    if (!state.members[email]) {
      state.members[email] = { paid: 0, owes: 0, netBalance: 0 };
    }
  };

  // Ensure all operations are processed chronologically
  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  for (const event of events) {
    const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
    const actor = event.actor_identity;
    
    discoverMember(actor);

    // Track explicit membership registrations
    if (event.event_type === 'MEMBER_JOINED') {
      discoverMember(payload.member_email);
      continue; // Move to the next log entry row
    }

    const amount = parseFloat(payload.evaluated_amount) || 0;
    const targetPeer = payload.target_peer_identity || "";
    if (targetPeer) discoverMember(targetPeer);

    switch (event.event_type) {
      case 'EXPENSE_ADD':
        state.totalSpent += amount;
        state.members[actor].paid += amount;
        
        if (payload.split_strategy === 'EQUALLY') {
          // Dynamic Roster Split Calculation Rule
          const activeRoster = Object.keys(state.members);
          const proportionalCut = amount / activeRoster.length;
          
          activeRoster.forEach(memberEmail => {
            state.members[memberEmail].owes += proportionalCut;
          });
        }
        break;

      case 'TRANSFER':
        state.members[actor].paid += amount;
        state.members[targetPeer].owes += amount;
        break;

      case 'LOAN':
        const rate = parseFloat(payload.interest_rate) || 0;
        const type = payload.interest_type || 'NONE';
        const multiplier = (type === 'NONE') ? 1.0 : (1 + (rate / 100));
        const finalCompoundValue = amount * multiplier;

        state.members[actor].paid += finalCompoundValue;
        state.members[targetPeer].owes += finalCompoundValue;
        break;
    }

    state.expenses.push({
      eventId: event.eventId || event.event_id,
      title: payload.title,
      type: event.event_type,
      category: payload.category || 'General',
      amount: amount,
      payer: actor,
      target: targetPeer,
      timestamp: event.timestamp
    });
  }

  // Calculate final net positions
  Object.keys(state.members).forEach(m => {
    state.members[m].netBalance = state.members[m].paid - state.members[m].owes;
  });

  return state;
}