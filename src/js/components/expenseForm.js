// src/js/components/expenseForm.js
import { resetCalculator, handleKeyPress } from '../calculator.js';

export function mountExpenseFormComponent(containerElement, activeMembersArray, onSubmitCallback) {
  containerElement.innerHTML = `
    <div class="space-y-4 animate-fade-in">
      <div class="flex items-center space-x-2">
        <button type="button" data-route="group-detail" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>
        <h3 class="text-sm font-bold">New Ledger Entry</h3>
      </div>

      <form id="comp-expense-form" class="space-y-3" onsubmit="return false;">
        <!-- Calculator Numerical Readout Frame -->
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-mono shadow-inner">
          <span class="block text-left text-[9px] text-slate-500 uppercase font-bold tracking-wider">Arithmetic Parser</span>
          <div id="calc-display-expression" class="text-xs text-slate-400 min-h-4 truncate">0</div>
          <div id="calc-display-value" class="text-3xl font-black text-emerald-400 mt-1 truncate">0.00</div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description / Target Email</label>
            <input type="text" id="comp-exp-title" required placeholder="Dinner / user@email.com..." class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Transaction Type</label>
            <select id="comp-exp-type" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold focus:outline-none text-slate-900 dark:text-slate-100">
              <option value="EXPENSE_ADD">🍔 Standard Shared Expense</option>
              <option value="TRANSFER">💸 Cash Settlement Transfer</option>
              <option value="LOAN">📈 Loan Issuance Event</option>
            </select>
          </div>
        </div>

        <!-- Conditional Interest-Loan Parameter Dock -->
        <div id="comp-loan-options" class="hidden grid grid-cols-2 gap-2 p-3 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-2xl">
          <div>
            <label class="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Interest Logic Model</label>
            <select id="comp-loan-interest-type" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-medium focus:outline-none text-slate-900 dark:text-slate-100">
              <option value="SIMPLE">Simple Flat Rate</option>
              <option value="NONE">0% Fixed Principal</option>
            </select>
          </div>
          <div>
            <label class="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Annual Interest Rate (%)</label>
            <input type="number" id="comp-loan-interest-rate" value="5" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono focus:outline-none text-slate-900 dark:text-slate-100">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category</label>
            <select id="comp-exp-category" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-medium focus:outline-none text-slate-900 dark:text-slate-100">
              <option value="Food">Food & Dining</option>
              <option value="Utilities">Utilities & Bills</option>
              <option value="Travel">Transportation</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Financial">Settlements & Loans</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Split Strategy</label>
            <select id="comp-exp-strategy" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-medium focus:outline-none text-slate-900 dark:text-slate-100">
              <option value="EQUALLY">Split Equally Among All</option>
              <option value="SHARES">Split By Shares / Weights</option>
              <option value="EXACT">Split By Exact Amounts</option>
              <option value="ADJUSTMENT">Split By Plus/Minus Adjustments</option>
            </select>
          </div>
        </div>

        <!-- NEW ADVANCED ADVANCED ITEMIZATION INPUT BLOCK -->
        <div id="comp-advanced-split-block" class="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 p-3 rounded-2xl space-y-2 hidden">
          <h4 id="comp-split-hint" class="text-[9px] font-bold text-accent-500 uppercase tracking-wider">Allocation Parameters</h4>
          <div id="comp-split-members-list" class="space-y-1.5 max-h-40 overflow-y-auto pr-1"></div>
        </div>

        <!-- Upload Zone -->
        <div id="receipt-upload-zone" class="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-accent-500/40 rounded-2xl p-3 text-center cursor-pointer transition-colors bg-white/40 dark:bg-slate-800/20">
          <input type="file" id="receipt-file-input" class="hidden" accept="image/*">
          <div class="flex items-center justify-center space-x-2 text-slate-400">
            <svg class="w-4 h-4 fill-none stroke-currentColor stroke-width="2" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span class="text-xs font-bold text-slate-500 dark:text-slate-300" id="receipt-zone-status">Attach Bill Image Receipt</span>
          </div>
        </div>

        <!-- Calculator Pad -->
        <div class="grid grid-cols-4 gap-2 p-2 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 font-mono">
          ${['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL'].map(char => `
            <button type="button" class="comp-calc-btn h-14 text-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-xl font-bold shadow-2xs cursor-pointer flex items-center justify-center active:scale-95 transition-transform" data-val="${char}">${char}</button>
          `).join('')}
          <button type="submit" id="comp-btn-submit" class="bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 font-black rounded-xl text-lg cursor-pointer flex items-center justify-center active:scale-95 transition-all">OK</button>
        </div>
      </form>
    </div>
  `;

  const $strategySelect = document.getElementById('comp-exp-strategy');
  const $splitBlock = document.getElementById('comp-advanced-split-block');
  const $splitHint = document.getElementById('comp-split-hint');
  const $membersList = document.getElementById('comp-split-members-list');

  // Triggered dynamically whenever strategies change
  const renderItemizedInputs = () => {
    const strategy = $strategySelect.value;
    if (strategy === 'EQUALLY') {
      $splitBlock.classList.add('hidden');
      return;
    }
    
    $splitBlock.classList.remove('hidden');
    $membersList.innerHTML = '';

    let inputPlaceholder = "1";
    if (strategy === 'SHARES') $splitHint.innerText = "Assign Weight Shares (e.g., 2, 1, 0)";
    if (strategy === 'EXACT') { $splitHint.innerText = "Enter Exact Cash Amounts"; inputPlaceholder = "0.00"; }
    if (strategy === 'ADJUSTMENT') { $splitHint.innerText = "Enter Premium (+) or Deduction (-)"; inputPlaceholder = "0.00"; }

    activeMembersArray.forEach(member => {
      const row = document.createElement('div');
      row.className = "flex justify-between items-center text-xs bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800";
      row.innerHTML = `
        <span class="font-mono text-[10px] text-slate-500 truncate max-w-[60%]">${member}</span>
        <input type="text" data-member-allocation="${member}" value="${strategy === 'SHARES' ? '1' : '0'}" placeholder="${inputPlaceholder}" class="w-24 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-1.5 rounded-lg text-right font-mono focus:outline-none focus:border-accent-500 text-slate-900 dark:text-slate-100">
      `;
      $membersList.appendChild(row);
    });
  };

  $strategySelect.addEventListener('change', renderItemizedInputs);

  document.getElementById('comp-exp-type').addEventListener('change', (e) => {
    const loanPanel = document.getElementById('comp-loan-options');
    const splitStrategyRow = $strategySelect.closest('div');
    if (e.target.value === 'LOAN') {
      loanPanel.classList.remove('hidden');
      $strategySelect.value = 'EQUALLY';
      splitStrategyRow.classList.add('opacity-40', 'pointer-events-none');
      $splitBlock.classList.add('hidden');
    } else {
      loanPanel.classList.add('hidden');
      splitStrategyRow.classList.remove('opacity-40', 'pointer-events-none');
    }
  });

  containerElement.querySelectorAll('.comp-calc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => handleKeyPress(e.target.getAttribute('data-val')));
  });

  document.getElementById('comp-expense-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Read individual allocation custom values out of row elements dynamically
    const allocationInputs = containerElement.querySelectorAll('[data-member-allocation]');
    const explicitInputsMap = {};
    allocationInputs.forEach(input => {
      explicitInputsMap[input.getAttribute('data-member-allocation')] = parseFloat(input.value) || 0;
    });

    onSubmitCallback({
      title: document.getElementById('comp-exp-title').value,
      type: document.getElementById('comp-exp-type').value,
      category: document.getElementById('comp-exp-category').value,
      strategy: $strategySelect.value,
      interestType: document.getElementById('comp-loan-interest-type').value,
      interestRate: document.getElementById('comp-loan-interest-rate').value,
      amount: parseFloat(document.getElementById('calc-display-value').innerText) || 0,
      expression: document.getElementById('calc-display-expression').innerText,
      rawAllocationsMap: explicitInputsMap
    });
  });
}