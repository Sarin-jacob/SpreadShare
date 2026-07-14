import { resetCalculator, handleKeyPress } from '../calculator.js';
import { writeToStore } from '../db.js';

// Internal DOM selectors cache bound directly to this component's lifecycle
let $form = null;
let $typeSelect = null;
let $loanContainer = null;

export function mountExpenseFormComponent(containerElement, onSubmitCallback) {
  // 1. Inject the pure component HTML layout structure directly
  containerElement.innerHTML = `
    <div class="space-y-4 animate-fade-in">
      <div class="flex items-center space-x-2">
        <button data-route="group-detail" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>
        <h3 class="text-sm font-bold">New Ledger Entry</h3>
      </div>

      <form id="comp-expense-form" class="space-y-3" onsubmit="return false;">
        <!-- Calculator Screen Output display frame -->
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-mono shadow-inner">
          <span class="block text-left text-[9px] text-slate-500 uppercase font-bold tracking-wider">Arithmetic Parser</span>
          <div id="calc-display-expression" class="text-xs text-slate-400 min-h-4 truncate">0</div>
          <div id="calc-display-value" class="text-3xl font-black text-emerald-400 mt-1 truncate">0.00</div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <input type="text" id="comp-exp-title" required placeholder="Description / Peer Email..." class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none">
          <select id="comp-exp-type" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold focus:outline-none">
            <option value="EXPENSE_ADD">🍔 Standard Shared Expense</option>
            <option value="TRANSFER">💸 Cash Settlement Transfer</option>
            <option value="LOAN">📈 Loan Issuance Event</option>
          </select>
        </div>

        <!-- Conditional loan settings block -->
        <div id="comp-loan-options" class="hidden grid grid-cols-2 gap-2 p-3 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-2xl">
          <select id="comp-loan-interest-type" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs focus:outline-none"><option value="SIMPLE">Simple Flat Rate</option></select>
          <input type="number" id="comp-loan-interest-rate" value="5" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono focus:outline-none">
        </div>

        <!-- Calculator Dial Number Pad Core Buttons Grid -->
        <div class="grid grid-cols-4 gap-1.5 p-2 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-mono">
          <!-- Pad generation loop maps buttons layout -->
          ${['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL'].map(char => `
            <button type="button" class="comp-calc-btn h-14 text-xl bg-white dark:bg-slate-900 rounded-xl font-bold shadow-2xs cursor-pointer active:scale-95 transition-transform" data-val="${char}">${char}</button>
          `).join('')}
          <button type="submit" id="comp-btn-submit" class="bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 font-black rounded-xl text-lg cursor-pointer active:scale-95 transition-all">OK</button>
        </div>
      </form>
    </div>
  `;

  // 2. Query target selector nodes scoped exclusively inside this instance
  $form = document.getElementById('comp-expense-form');
  $typeSelect = document.getElementById('comp-comp-exp-type');
  $loanContainer = document.getElementById('comp-loan-options');

  // 3. Attach component level layout event interactions cleanly
  bindComponentEvents(onSubmitCallback);
}

function bindComponentEvents(onSubmitCallback) {
  // Wire type-selection visibility triggers internally
  document.getElementById('comp-exp-type').addEventListener('change', (e) => {
    const loanPanel = document.getElementById('comp-loan-options');
    if (e.target.value === 'LOAN') loanPanel.classList.remove('hidden');
    else loanPanel.classList.add('hidden');
  });

  // Intercept inner pad clicks
  document.querySelectorAll('.comp-calc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      handleKeyPress(e.target.getAttribute('data-val'));
    });
  });

  // Handle local form submission dispatch arrays safely
  $form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const fields = {
      title: document.getElementById('comp-exp-title').value,
      type: document.getElementById('comp-exp-type').value,
      amount: parseFloat(document.getElementById('calc-display-value').innerText) || 0,
      expression: document.getElementById('calc-display-expression').innerText
    };
    
    onSubmitCallback(fields);
  });
}