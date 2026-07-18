// src/js/components/groupDetail.js
import { evaluateAdvancedLedgerState } from '../engine.js';

export function mountGroupDetailComponent(containerElement, currentGroupEvents, userEmailAddress) {
  const state = evaluateAdvancedLedgerState(currentGroupEvents);
  const activeName = localStorage.getItem('ss_active_sheet_name') || 'Active Room';
  const activeId = localStorage.getItem('ss_active_sheet_id') || 'None';

  containerElement.innerHTML = `
    <div class="space-y-4 animate-fade-in">
      <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 dark:from-accent-950 dark:to-slate-900 dark:border-accent-900/40">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-base font-black tracking-tight text-white">${activeName}</h2>
            <span class="text-[9px] text-accent-300 font-mono block truncate max-w-[180px]">ID: ${activeId}</span>
          </div>
          <div class="flex space-x-1.5">
            <button type="button" data-action="invite" class="bg-slate-800 hover:bg-slate-700 text-accent-400 text-xs font-bold py-1.5 px-2.5 rounded-lg border border-slate-700 cursor-pointer flex items-center space-x-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
              <span id="invite-btn-text">Invite</span>
            </button>
            <button type="button" data-route="add-expense" class="bg-white text-slate-950 dark:bg-accent-500 dark:text-slate-950 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 shadow-sm cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
              <span>Log Item</span>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2" id="detail-balances-grid"></div>
      </div>

      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs space-y-2">
        <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Group Roster</h4>
        <div class="flex flex-wrap gap-1.5" id="detail-roster-tags"></div>
      </div>

      <div class="space-y-2">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Group Log Stream</h3>
        <div class="space-y-2" id="detail-ledger-feed"></div>
      </div>
    </div>
  `;

  const $balancesGrid = document.getElementById('detail-balances-grid');
  Object.keys(state.members).forEach(member => {
    const data = state.members[member];
    const isPositive = data.netBalance >= 0;
    const textColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    $balancesGrid.innerHTML += `
      <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-xl flex flex-col justify-between">
        <span class="text-[10px] text-slate-400 font-medium truncate">${member === userEmailAddress ? 'You' : member}</span>
        <span class="text-sm font-black tracking-tight ${textColor} mt-1">${isPositive ? '+' : ''}${data.netBalance.toFixed(2)}</span>
      </div>`;
  });

  const $rosterTags = document.getElementById('detail-roster-tags');
  Object.keys(state.members).forEach(memberEmail => {
    $rosterTags.innerHTML += `
      <span class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[10px] px-2.5 py-1 rounded-md max-w-[160px] truncate">
        👤 ${memberEmail === userEmailAddress ? 'You' : memberEmail.split('@')[0]}
      </span>`;
  });

  const $feed = document.getElementById('detail-ledger-feed');
  if (state.expenses.length === 0) {
    $feed.innerHTML = `<div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full"><p class="text-xs text-slate-400">No transactions recorded yet.</p></div>`;
    return;
  }

  // REPLAY FEEDS SYSTEM WITH REAL-TIME DEBT INDICATOR MARKERS
  [...currentGroupEvents].reverse().forEach(event => {
    if (event.event_type === 'MEMBER_JOINED') return;

    const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
    const amount = parseFloat(payload.evaluated_amount) || 0;
    const actor = event.actor_identity;
    
    let badgeColor = "bg-slate-100 dark:bg-slate-900 text-slate-500";
    let desc = payload.title;
    let contextPersonalDebtString = "";

    // ─── CONTEXTUAL BALANCE CALCULATION LOGIC STRINGS ───
    if (event.event_type === 'EXPENSE_ADD') {
      const allAllocations = payload.allocations || [];
      const userShareMeta = allAllocations.find(a => a.user === userEmailAddress);
      const userOwesAmount = userShareMeta ? parseFloat(userShareMeta.value) || 0 : 0;

      if (actor === userEmailAddress) {
        const totalOwedToMe = amount - userOwesAmount;
        contextPersonalDebtString = totalOwedToMe > 0 
          ? `<span class="text-emerald-600 dark:text-emerald-400 font-bold">You are owed INR ${totalOwedToMe.toFixed(2)}</span>`
          : `<span class="text-slate-400">You covered your exact share</span>`;
      } else {
        contextPersonalDebtString = userOwesAmount > 0
          ? `<span class="text-rose-600 dark:text-rose-400 font-bold">You owe INR ${userOwesAmount.toFixed(2)}</span>`
          : `<span class="text-slate-400">You aren't in this split</span>`;
      }
    } else if (event.event_type === 'TRANSFER') {
      badgeColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
      const target = payload.target_peer_identity || '';
      if (actor === userEmailAddress) {
        desc = `You sent settlement to ${target.split('@')[0]}`;
        contextPersonalDebtString = `<span class="text-emerald-500 font-semibold">Sent payment</span>`;
      } else if (target === userEmailAddress) {
        desc = `${actor.split('@')[0]} sent you a settlement`;
        contextPersonalDebtString = `<span class="text-emerald-500 font-semibold">Received payment</span>`;
      } else {
        desc = `${actor.split('@')[0]} settled with ${target.split('@')[0]}`;
        contextPersonalDebtString = `<span class="text-slate-400">Peer settlement</span>`;
      }
    } else if (event.event_type === 'LOAN') {
      badgeColor = "bg-violet-500/10 text-violet-500 border border-violet-500/20";
      const target = payload.target_peer_identity || '';
      const rate = parseFloat(payload.interest_rate) || 0;
      const type = payload.interest_type || 'NONE';
      const principalPlusInterest = amount * ((type === 'NONE') ? 1.0 : (1 + (rate / 100)));

      if (actor === userEmailAddress) {
        desc = `You issued a loan to ${target.split('@')[0]}`;
        contextPersonalDebtString = `<span class="text-emerald-600 font-bold">Lent asset (Owed ${principalPlusInterest.toFixed(2)})</span>`;
      } else if (target === userEmailAddress) {
        desc = `${actor.split('@')[0]} issued you a loan`;
        contextPersonalDebtString = `<span class="text-rose-600 font-bold">Borrowed asset (Owe ${principalPlusInterest.toFixed(2)})</span>`;
      } else {
        desc = `${actor.split('@')[0]} lent assets to ${target.split('@')[0]}`;
        contextPersonalDebtString = `<span class="text-slate-400">Peer loan transaction</span>`;
      }
    }

    const itemRow = document.createElement('div');
    itemRow.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs cursor-pointer hover:border-accent-500/30 transition-colors";
    itemRow.innerHTML = `
      <div class="space-y-1 max-w-[65%]">
        <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${desc}</div>
        <div class="text-[10px] block font-medium">${contextPersonalDebtString}</div>
        <div class="flex items-center space-x-1.5 text-[9px] text-slate-400 pt-0.5">
          <span class="px-1.5 py-0.2 rounded font-bold text-[8px] uppercase tracking-wide ${badgeColor}">${payload.category || 'General'}</span>
          <span>&bull;</span>
          <span>By: ${actor === userEmailAddress ? 'You' : actor.split('@')[0]}</span>
        </div>
      </div>
      <div class="text-right space-y-0.5 font-mono">
        <div class="font-black text-slate-900 dark:text-slate-100">INR ${amount.toFixed(2)}</div>
        <div class="text-[9px] text-slate-400">${new Date(event.timestamp).toLocaleDateString()}</div>
      </div>`;
    
    // Clicking the item opens the comprehensive itemized breakdown sheet layout view
    itemRow.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ss-open-expense-detail', { detail: { event } }));
    });

    $feed.appendChild(itemRow);
  });
}