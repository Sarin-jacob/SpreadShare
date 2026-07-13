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