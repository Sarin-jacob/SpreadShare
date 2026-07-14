// src/js/ui/groupDetail.js
import { evaluateAdvancedLedgerState } from '../engine.js';

/**
 * Computes calculations and updates the active group view DOM state seamlessly across sessions
 * @param {Array} currentGroupEvents - Immutable ledger events slice filtered for this group
 * @param {string} userEmailAddress - Identity email of the active client node
 */
export function repaintGroupDetailUI(currentGroupEvents, userEmailAddress) {
  const state = evaluateAdvancedLedgerState(currentGroupEvents);
  
  // 1. Render Dynamic Calculated Balance Grid Matrices
  const summaryGrid = document.getElementById('balance-summary-grid');
  if (summaryGrid) {
    summaryGrid.innerHTML = '';
    Object.keys(state.members).forEach(member => {
      const data = state.members[member];
      const isPositive = data.netBalance >= 0;
      const textColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
      
      summaryGrid.innerHTML += `
        <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-xl flex flex-col justify-between">
          <span class="text-[10px] text-slate-400 font-medium truncate">${member === userEmailAddress ? 'You' : member}</span>
          <span class="text-sm font-black tracking-tight ${textColor} mt-1">${isPositive ? '+' : ''}${data.netBalance.toFixed(2)}</span>
        </div>`;
    });
  }

  // 2. Render Historical Transaction Logs Feed Stream
  const feed = document.getElementById('group-ledger-feed');
  if (feed) {
    feed.innerHTML = '';
    
    if (state.expenses.length === 0) {
      feed.innerHTML = `
        <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full">
          <p class="text-xs text-slate-400">No recorded stream activities mapped inside ledger.</p>
        </div>`;
      return;
    }

    [...state.expenses].reverse().forEach(exp => {
      let badgeColor = "bg-slate-100 dark:bg-slate-900 text-slate-500";
      let displayTitle = exp.title;
      
      if (exp.type === 'TRANSFER') {
        badgeColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
        displayTitle = `Settlement transfer sent to: ${exp.target}`;
      } else if (exp.type === 'LOAN') {
        badgeColor = "bg-violet-500/10 text-violet-500 border border-violet-500/20";
        displayTitle = `Issued dynamic Loan to: ${exp.target}`;
      }

      feed.innerHTML += `
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs">
          <div class="space-y-1 max-w-[65%]">
            <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${displayTitle}</div>
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
}