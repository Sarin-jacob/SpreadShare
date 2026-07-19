// src/js/engine.js
const roundMoney = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

export function optimizeDebts(membersMap) {
  const debtors = [];
  const creditors = [];

  Object.entries(membersMap).forEach(([email, data]) => {
    if (data.netBalance < -0.01) debtors.push({ email, amount: Math.abs(data.netBalance) });
    else if (data.netBalance > 0.01) creditors.push({ email, amount: data.netBalance });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settledAmount = Math.min(debtor.amount, creditor.amount);
    
    settlements.push({ from: debtor.email, to: creditor.email, amount: roundMoney(settledAmount) });
    
    debtor.amount = roundMoney(debtor.amount - settledAmount);
    creditor.amount = roundMoney(creditor.amount - settledAmount);
    
    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }
  return settlements;
}

export function computeLedgerState(rawEvents) {
  const state = { totalSpent: 0, members: {}, expenses: [], profiles: {} };
  const processedEventIds = new Set();
  const deletedEventIds = new Set();

  const discoverMember = (email, name = null, picture = null) => {
    if (!email) return;
    if (!state.members[email]) state.members[email] = { paid: 0, owes: 0, netBalance: 0 };
    if (!state.profiles[email]) state.profiles[email] = { name: email.split('@')[0], picture: null };
    if (name) state.profiles[email].name = name;
    if (picture) state.profiles[email].picture = picture;
  };

  const events = [...rawEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  events.forEach(e => {
    const id = e.eventId || e.event_id;
    if (e.event_type === 'EXPENSE_DELETE') {
      const payload = typeof e.payload_json === 'string' ? JSON.parse(e.payload_json) : e.payload_json;
      deletedEventIds.add(payload.target_event_id);
    }
  });

  for (const event of events) {
    const id = event.eventId || event.event_id;
    if (processedEventIds.has(id) || deletedEventIds.has(id) || event.event_type === 'EXPENSE_DELETE') continue; 
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

    // CORE MATH CALCULATIONS
    if (event.event_type === 'EXPENSE_ADD') {
      state.totalSpent = roundMoney(state.totalSpent + amount);
      
      // Who paid?
      if (payload.payers && payload.payers.length > 0) {
        payload.payers.forEach(p => {
          discoverMember(p.user);
          state.members[p.user].paid += parseFloat(p.value) || 0;
        });
      } else {
        state.members[actor].paid += amount;
      }

      // Who owes?
      if (payload.allocations) {
        payload.allocations.forEach(alloc => {
          discoverMember(alloc.user);
          state.members[alloc.user].owes += parseFloat(alloc.value) || 0;
        });
      }
    } 
    else if (event.event_type === 'TRANSFER') {
      state.members[actor].paid += amount;
      state.members[targetPeer].owes += amount;
    } 
    else if (event.event_type === 'LOAN') {
      let totalOwed = amount;
      if (payload.interest_type === 'SIMPLE' && payload.interest_rate > 0) {
        totalOwed = amount + (amount * (payload.interest_rate / 100));
      }
      state.members[actor].paid += roundMoney(totalOwed);
      state.members[targetPeer].owes += roundMoney(totalOwed);
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

  // Final Net Balance resolution
  Object.keys(state.members).forEach(m => {
    const member = state.members[m];
    member.netBalance = roundMoney(member.paid - member.owes);
  });
  
  return state;
}