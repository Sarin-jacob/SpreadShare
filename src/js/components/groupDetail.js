// src/js/components/groupDetail.js
import { evaluateAdvancedLedgerState } from '../engine.js';

export function mountGroupDetailComponent(containerElement, currentGroupEvents, userEmailAddress) {
  const state = evaluateAdvancedLedgerState(currentGroupEvents);
  const activeName = localStorage.getItem('ss_active_sheet_name') || 'Active Room';
  const activeId = localStorage.getItem('ss_active_sheet_id') || 'None';

  containerElement.innerHTML = `
    <div class="space-y-4 animate-fade-in">
      <!-- Dynamic Dashboard Net Matrices Cards summary block -->
      <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 dark:from-accent-950 dark:to-slate-900 dark:border-accent-900/40">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-base font-black tracking-tight text-white">${activeName}</h2>
            <span class="text-[9px] text-accent-300 font-mono">ID: ${activeId}</span>
          </div>
          <div class="flex space-x-1.5">
            <button data-route="dashboard" class="bg-slate-800 text-slate-300 text-xs font-bold py-1.5 px-2.5 rounded-lg border border-slate-700 cursor-pointer">Back</button>
            <button data-route="add-expense" class="bg-white text-slate-950 dark:bg-accent-500 dark:text-slate-950 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 shadow-sm cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
              <span>Log Item</span>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2" id="detail-balances-grid"></div>
      </div>

      <!-- Transaction Event History Timelines -->
      <div class="space-y-2">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Group Log Stream</h3>
        <div class="space-y-2" id="detail-ledger-feed"></div>
      </div>
    </div>
  `;

  // Render the balances grid
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

  // Render the log stream feed
  const $feed = document.getElementById('detail-ledger-feed');
  if (state.expenses.length === 0) {
    $feed.innerHTML = `
      <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full">
        <p class="text-xs text-slate-400">No recorded stream activities mapped inside ledger.</p>
      </div>`;
    return;
  }

  [...state.expenses].reverse().forEach(exp => {
    let badgeColor = "bg-slate-100 dark:bg-slate-900 text-slate-500";
    let desc = exp.title;
    
    if (exp.type === 'TRANSFER') {
      badgeColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
      desc = `Settlement transfer sent to: ${exp.target}`;
    } else if (exp.type === 'LOAN') {
      badgeColor = "bg-violet-500/10 text-violet-500 border border-violet-500/20";
      desc = `Issued dynamic Loan to: ${exp.target}`;
    }

    $feed.innerHTML += `
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs">
        <div class="space-y-1 max-w-[65%]">
          <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${desc}</div>
          <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-medium">
            <span class="truncate">Actor: ${exp.payer === userEmailAddress ? 'You' : exp.payer}</span>
            <span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            <span class="px-1.5 py-0.2 rounded font-bold text-[8px] uppercase tracking-wide ${badgeColor}">${exp.category}</span>
          </div>
        </div>
        <div class="text-right space-y-0.5">
          <div class="font-mono font-black text-slate-900 dark:text-slate-100">INR ${exp.amount.toFixed(2)}</div>
          <div class="text-[9px] text-slate-400">${new Date(exp.timestamp).toLocaleDateString()}</div>
        </div>
      </div>`;
  });
}