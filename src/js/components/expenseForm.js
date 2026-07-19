// src/js/components/ExpenseForm.js
import { store } from '../store.js';
import { LedgerService } from '../services/LedgerService.js';
import { computeLedgerState } from '../engine.js';
import { Calculator } from '../calculator.js';
import { AppRouter } from '../router.js';
import { CurrencyService } from '../services/CurrencyService.js';

// Safe inline arithmetic parser for split boxes
const evaluateInlineMath = (str) => {
  try {
    const clean = (str || '').replace(/[^0-9+\-*/.()]/g, '');
    if (!clean) return 0;
    const result = new Function('return ' + clean)();
    return isNaN(result) || !isFinite(result) ? 0 : result;
  } catch (e) {
    return 0;
  }
};

export class ExpenseForm {
  constructor(containerElement) {
    this.container = containerElement;
    this.calculator = null;
    this.activeRoster = [];
    this.receiptBase64 = null;
    this.editingEventId = null;
    this.activeTab = 'EXPENSE_ADD'; 
    this.exchangeMultiplier = 1.0;

    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.render();
    this.cacheDOM();
    this.attachListeners();
    this.attachDesktopKeyboardSupport();
  }

  onStateChange(state) {
    if (state.currentView !== 'add-expense') return;
    const computedState = computeLedgerState(state.groupEvents);
    this.activeRoster = Object.keys(computedState.members).length > 0 
      ? Object.keys(computedState.members) 
      : [state.userProfile?.email || 'Unknown'];
    this.updateDropdowns();
  }

  render() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const localISOTime = now.toISOString().slice(0, 16);

    this.container.innerHTML = `
      <div class="space-y-5 animate-fade-in pb-12 max-w-lg mx-auto relative">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <button type="button" data-route="group-detail" class="text-slate-400 hover:text-slate-800 dark:hover:text-white p-2 -ml-2 rounded-full transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-black tracking-tight" id="form-header-title">Log Transaction</h3>
          <button id="cancel-edit-btn" class="hidden text-[10px] uppercase tracking-wider text-rose-500 font-bold bg-rose-500/10 px-3 py-1.5 rounded-full transition-all">Cancel Edit</button>
        </div>

        <!-- Segmented Tabs -->
        <div class="flex p-1 space-x-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl shadow-inner border border-slate-200/50 dark:border-slate-700/50">
          <button data-tab="EXPENSE_ADD" class="form-tab flex-1 py-2 text-xs font-bold rounded-lg shadow-sm bg-white text-slate-800 dark:bg-slate-700 dark:text-white transition-all cursor-pointer">Expense</button>
          <button data-tab="TRANSFER" class="form-tab flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all cursor-pointer">Transfer</button>
          <button data-tab="LOAN" class="form-tab flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all cursor-pointer">Loan</button>
        </div>

        <form id="comp-expense-form" class="space-y-4" onsubmit="return false;">
          
          <!-- HYBRID CALCULATOR DISPLAY (Clickable on Mobile) -->
          <div id="calc-display-zone" class="relative bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-5 rounded-3xl shadow-sm focus-within:border-accent-500 focus-within:ring-4 focus-within:ring-accent-500/20 transition-all group overflow-hidden cursor-pointer md:cursor-default">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-400 to-emerald-400 opacity-50"></div>
            
            <div class="flex justify-between items-start mb-2">
              <span class="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Total Amount</span>
              <div class="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-200 transition-colors pointer-events-auto">
                <select id="comp-currency" class="bg-transparent text-xs font-bold text-accent-600 dark:text-accent-400 focus:outline-none appearance-none cursor-pointer">
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AED">AED</option>
                </select>
                <svg class="w-3 h-3 text-accent-500/50" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <div class="text-right">
              <div id="calc-display-expression" class="text-xs text-slate-400 min-h-[1rem] truncate font-mono">0</div>
              <div id="calc-display-value" class="text-4xl font-black text-slate-800 dark:text-white mt-1 truncate tracking-tight">0.00</div>
              <div id="calc-converted-value" class="text-[10px] text-emerald-500 font-bold hidden mt-1">≈ 0.00 INR</div>
            </div>
            
            <p class="hidden md:block text-[9px] text-slate-400 text-center mt-3 font-medium">✨ Type numbers directly on your keyboard</p>
            <p class="md:hidden text-[9px] text-accent-500 text-center mt-3 font-bold uppercase tracking-wider animate-pulse">Tap to open Calculator</p>
          </div>

          <!-- COMMON FIELDS -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Description</label>
              <input type="text" id="comp-exp-title" required placeholder="What was this for?" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 focus:outline-none transition-all">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Date</label>
              <input type="datetime-local" id="comp-exp-datetime" value="${localISOTime}" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 focus:outline-none transition-all">
            </div>
          </div>

          <!-- TAB 1: EXPENSE -->
          <div id="section-expense" class="space-y-4 animate-fade-in">
            <div class="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 p-4 rounded-2xl shadow-2xs space-y-3">
              <div class="flex justify-between items-center">
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Who Paid?</label>
                <select id="comp-payer-mode" class="bg-slate-100 dark:bg-slate-900 border border-transparent hover:border-slate-300 py-1.5 px-2 rounded-lg text-[10px] font-bold focus:outline-none cursor-pointer transition-colors">
                  <option value="SINGLE">Single Person</option>
                  <option value="MULTIPLE">Multiple People</option>
                </select>
              </div>
              <div id="comp-payer-single-slot">
                <select id="comp-single-payer-dropdown" class="w-full roster-dropdown bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-semibold focus:outline-none cursor-pointer"></select>
              </div>
              <div id="comp-payer-multiple-slot" class="space-y-2 hidden max-h-40 overflow-y-auto pr-1"></div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Category</label>
                <select id="comp-exp-category" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold focus:outline-none cursor-pointer">
                  <option value="Food">Food & Dining</option>
                  <option value="Utilities">Utilities & Bills</option>
                  <option value="Travel">Transportation</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="General">General/Other</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Split Strategy</label>
                <select id="comp-exp-strategy" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold focus:outline-none cursor-pointer">
                  <option value="EQUALLY">Split Equally</option>
                  <option value="SHARES">Split By Shares</option>
                  <option value="EXACT">Split Exact Amounts</option>
                  <option value="ADJUSTMENT">Relative (+/-)</option>
                </select>
              </div>
            </div>

            <div id="comp-advanced-split-block" class="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/20 p-4 rounded-2xl space-y-3 hidden">
              <h4 id="comp-split-hint" class="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">Allocation Parameters</h4>
              <div id="comp-split-members-list" class="space-y-2 max-h-40 overflow-y-auto pr-1"></div>
              <p class="text-[9px] text-indigo-400/80 font-medium pt-1">💡 You can type math equations directly (e.g. 100/3)</p>
            </div>

            <div class="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between mb-2">
                <span>Final Output Preview</span>
                <span id="comp-preview-error" class="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded normal-case hidden font-bold text-[9px]">Sum mismatch</span>
              </h4>
              <div id="comp-live-calculation-preview" class="grid grid-cols-2 gap-2 text-[11px]"></div>
            </div>

            <div id="receipt-upload-zone" class="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-accent-500 dark:hover:border-accent-500 rounded-2xl p-4 text-center cursor-pointer bg-white/40 dark:bg-slate-900/40 transition-colors group">
              <input type="file" id="receipt-file-input" class="hidden" accept="image/*">
              <div class="flex flex-col items-center justify-center space-y-1 text-slate-400 group-hover:text-accent-500 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <span class="text-[10px] font-bold uppercase tracking-wider" id="receipt-zone-status">Attach Bill Receipt</span>
              </div>
            </div>
          </div>

          <!-- TAB 2: TRANSFER -->
          <div id="section-transfer" class="space-y-4 hidden animate-fade-in">
            <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 p-4 rounded-2xl space-y-4 relative">
              <div>
                <label class="block text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1.5 ml-1">Sender (Who Paid)</label>
                <select id="transfer-sender" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 text-sm font-semibold focus:outline-none"></select>
              </div>
              <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-amber-100 dark:bg-amber-900 p-2 rounded-full border border-amber-200 dark:border-amber-700 text-amber-500 shadow-sm mt-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1.5 ml-1">Receiver (Who got it)</label>
                <select id="transfer-receiver" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 text-sm font-semibold focus:outline-none"></select>
              </div>
            </div>
          </div>

          <!-- TAB 3: LOAN -->
          <div id="section-loan" class="space-y-4 hidden animate-fade-in">
            <div class="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-700/30 p-4 rounded-2xl space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1.5 ml-1">Lender</label>
                  <select id="loan-lender" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700/50 rounded-xl p-2.5 text-xs font-semibold focus:outline-none"></select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1.5 ml-1">Borrower</label>
                  <select id="loan-borrower" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700/50 rounded-xl p-2.5 text-xs font-semibold focus:outline-none"></select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3 pt-3 border-t border-violet-200 dark:border-violet-700/30">
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1.5 ml-1">Interest Type</label>
                  <select id="loan-interest-type" class="w-full bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700/50 rounded-xl p-2.5 text-xs font-medium focus:outline-none">
                    <option value="SIMPLE">Simple Flat Rate</option>
                    <option value="COMPOUND">Compound Dynamic</option>
                    <option value="NONE" selected>0% Fixed Principal</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1.5 ml-1">Rate (%)</label>
                  <input type="number" id="loan-interest-rate" value="0" placeholder="e.g. 5" class="w-full bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700/50 rounded-xl p-2.5 text-xs font-mono focus:outline-none">
                </div>
              </div>
            </div>
          </div>

          <!-- DESKTOP SUBMIT -->
          <button type="submit" id="comp-btn-submit-desktop" class="w-full bg-accent-600 hover:bg-accent-700 text-white font-black rounded-2xl text-sm py-4 cursor-pointer transition-colors shadow-sm tracking-wide uppercase active:scale-[0.98]">
            Save Transaction
          </button>
        </form>

        <!-- ─── MOBILE CALCULATOR MODAL (BOTTOM SHEET) ─── -->
        <div id="mobile-calc-modal" class="fixed inset-0 z-[100] hidden bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end animate-fade-in md:hidden">
          <div class="bg-slate-100 dark:bg-slate-900 rounded-t-3xl p-5 pb-8 shadow-2xl transform transition-transform border-t border-slate-200 dark:border-slate-800">
            <div class="flex justify-between items-center mb-4">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Amount Input</span>
              <button type="button" id="close-calc-modal" class="bg-accent-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all">Done</button>
            </div>
            
            <div class="grid grid-cols-4 gap-2">
              ${['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL'].map(char => `
                <button type="button" class="calc-btn h-14 text-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl font-bold shadow-sm active:scale-95 transition-all border border-slate-200 dark:border-slate-700" data-val="${char}">${char}</button>
              `).join('')}
              <button type="button" id="comp-btn-submit-mobile" class="bg-accent-600 text-white font-black rounded-2xl text-lg active:scale-95 transition-all shadow-md flex items-center justify-center">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$form = this.container.querySelector('#comp-expense-form');
    this.$title = this.container.querySelector('#comp-exp-title');
    this.$datetime = this.container.querySelector('#comp-exp-datetime');
    this.$cancelEditBtn = this.container.querySelector('#cancel-edit-btn');
    this.$headerTitle = this.container.querySelector('#form-header-title');

    this.$sectionExpense = this.container.querySelector('#section-expense');
    this.$sectionTransfer = this.container.querySelector('#section-transfer');
    this.$sectionLoan = this.container.querySelector('#section-loan');
    this.$tabButtons = this.container.querySelectorAll('.form-tab');

    this.$currency = this.container.querySelector('#comp-currency');
    this.$convertedValue = this.container.querySelector('#calc-converted-value');
    this.$displayZone = this.container.querySelector('#calc-display-zone');
    this.$calcModal = this.container.querySelector('#mobile-calc-modal');
    this.$closeCalcModal = this.container.querySelector('#close-calc-modal');
    this.$mobileSubmit = this.container.querySelector('#comp-btn-submit-mobile');

    this.$payerMode = this.container.querySelector('#comp-payer-mode');
    this.$singleSlot = this.container.querySelector('#comp-payer-single-slot');
    this.$multiSlot = this.container.querySelector('#comp-payer-multiple-slot');
    this.$category = this.container.querySelector('#comp-exp-category');
    this.$strategySelect = this.container.querySelector('#comp-exp-strategy');
    this.$splitBlock = this.container.querySelector('#comp-advanced-split-block');
    this.$splitMembersList = this.container.querySelector('#comp-split-members-list');
    this.$splitHint = this.container.querySelector('#comp-split-hint');
    this.$previewContainer = this.container.querySelector('#comp-live-calculation-preview');
    this.$previewError = this.container.querySelector('#comp-preview-error');
    
    this.$uploadZone = this.container.querySelector('#receipt-upload-zone');
    this.$fileInput = this.container.querySelector('#receipt-file-input');
    this.$zoneStatus = this.container.querySelector('#receipt-zone-status');

    this.$transferSender = this.container.querySelector('#transfer-sender');
    this.$transferReceiver = this.container.querySelector('#transfer-receiver');
    this.$loanLender = this.container.querySelector('#loan-lender');
    this.$loanBorrower = this.container.querySelector('#loan-borrower');
    this.$loanInterestType = this.container.querySelector('#loan-interest-type');
    this.$loanInterestRate = this.container.querySelector('#loan-interest-rate');

    this.calculator = new Calculator(this.container, () => this.calculateLiveOutputPreview());
  }

  attachDesktopKeyboardSupport() {
    window.addEventListener('keydown', this._handleKeydown = (e) => {
      if (store.getState().currentView !== 'add-expense') return;
      const activeTag = document.activeElement.tagName.toLowerCase();
      if (['input', 'textarea', 'select'].includes(activeTag)) return; 
      const validKeys = ['0','1','2','3','4','5','6','7','8','9','.','+','-','*','/','(',')','Backspace'];
      if (validKeys.includes(e.key)) {
        e.preventDefault();
        if (e.key === 'Backspace') this.calculator.handleInput('DEL');
        else this.calculator.handleInput(e.key);
      }
    });
  }

  updateDropdowns() {
    const state = store.getState();
    const profiles = computeLedgerState(state.groupEvents).profiles;
    
    const optionsHtml = this.activeRoster.map(m => {
      const name = profiles[m]?.name || m.split('@')[0];
      return `<option value="${m}">${name}</option>`;
    }).join('');
    
    this.container.querySelectorAll('.roster-dropdown').forEach(select => select.innerHTML = optionsHtml);

    const userEmail = state.userProfile?.email;
    if (this.activeRoster.includes(userEmail)) {
      this.container.querySelector('#comp-single-payer-dropdown').value = userEmail;
      this.$transferSender.value = userEmail;
      this.$loanLender.value = userEmail;
    }

    const peerEmail = this.activeRoster.find(m => m !== userEmail) || userEmail;
    this.$transferReceiver.value = peerEmail;
    this.$loanBorrower.value = peerEmail;

    this.$multiSlot.innerHTML = this.activeRoster.map(member => {
      const name = profiles[member]?.name || member.split('@')[0];
      return `
        <div class="flex justify-between items-center bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
          <span class="truncate max-w-[65%] font-semibold text-xs text-slate-600 dark:text-slate-300 ml-1">${name} paid</span>
          <input type="text" inputmode="text" data-payer-share="${member}" placeholder="0.00" class="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 text-right font-mono rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/30 text-xs transition-all">
        </div>
      `;
    }).join('');

    this.renderItemizedInputs();
  }

  attachListeners() {
    // Modal logic
    this.$displayZone.addEventListener('click', (e) => {
      if(e.target.closest('#comp-currency')) return;
      if (window.innerWidth < 768) {
        this.$calcModal.classList.remove('hidden');
      }
    });

    this.$closeCalcModal.addEventListener('click', () => {
      this.$calcModal.classList.add('hidden');
    });

    this.$mobileSubmit.addEventListener('click', () => {
      this.$calcModal.classList.add('hidden');
      this.handleSubmit();
    });

    this.$tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.target.getAttribute('data-tab');
        this.$tabButtons.forEach(b => {
          b.classList.remove('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-sm');
          b.classList.add('text-slate-500');
        });
        e.target.classList.add('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-sm');
        e.target.classList.remove('text-slate-500');

        this.$sectionExpense.classList.toggle('hidden', this.activeTab !== 'EXPENSE_ADD');
        this.$sectionTransfer.classList.toggle('hidden', this.activeTab !== 'TRANSFER');
        this.$sectionLoan.classList.toggle('hidden', this.activeTab !== 'LOAN');
      });
    });

    this.$currency.addEventListener('change', async (e) => {
      const selectedCurrency = e.target.value;
      if (selectedCurrency === 'INR') {
        this.exchangeMultiplier = 1.0;
        this.$convertedValue.classList.add('hidden');
      } else {
        this.$convertedValue.classList.remove('hidden');
        this.$convertedValue.innerText = "Fetching rate...";
        this.exchangeMultiplier = await CurrencyService.getMultiplier(selectedCurrency, 'INR');
      }
      this.calculateLiveOutputPreview();
    });

    this.$payerMode.addEventListener('change', (e) => {
      this.$singleSlot.classList.toggle('hidden', e.target.value !== 'SINGLE');
      this.$multiSlot.classList.toggle('hidden', e.target.value === 'SINGLE');
    });

    this.$strategySelect.addEventListener('change', () => this.renderItemizedInputs());

    this.container.addEventListener('input', (e) => {
      if (e.target.matches('[data-member-allocation], [data-payer-share]')) {
        this.calculateLiveOutputPreview();
      }
    });
    this.container.addEventListener('blur', (e) => {
       if (e.target.matches('[data-member-allocation], [data-payer-share]')) {
         if (e.target.value.trim() !== '') {
           e.target.value = evaluateInlineMath(e.target.value);
         }
       }
    }, true);

    this.$uploadZone.addEventListener('click', () => this.$fileInput.click());
    this.$fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this.$zoneStatus.innerText = "Converting...";
      const reader = new FileReader();
      reader.onload = (event) => {
        this.receiptBase64 = event.target.result;
        this.$zoneStatus.innerText = `✓ ${file.name.slice(0, 15)}...`;
        this.$zoneStatus.classList.add('text-accent-500');
        this.$uploadZone.classList.add('border-accent-500', 'bg-accent-50');
      };
      reader.readAsDataURL(file);
    });

    this.$form.addEventListener('submit', () => this.handleSubmit());
    this.$cancelEditBtn.addEventListener('click', () => this.resetForm());
  }

  renderItemizedInputs() {
    if (this.activeTab !== 'EXPENSE_ADD') return;
    const strategy = this.$strategySelect.value;
    
    if (strategy === 'EQUALLY') { 
      this.$splitBlock.classList.add('hidden'); 
      this.calculateLiveOutputPreview(); 
      return; 
    }
    
    this.$splitBlock.classList.remove('hidden');
    const state = store.getState();
    const profiles = computeLedgerState(state.groupEvents).profiles;

    this.$splitMembersList.innerHTML = this.activeRoster.map(member => {
      const name = profiles[member]?.name || member.split('@')[0];
      return `
        <div class="flex justify-between items-center bg-white dark:bg-slate-900 p-2 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
          <span class="font-semibold text-xs text-slate-600 dark:text-slate-300 truncate ml-1">${name}</span>
          <input type="text" inputmode="text" data-member-allocation="${member}" placeholder="${strategy === 'SHARES' ? '1' : '0.00'}" class="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 p-1.5 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-accent-500/40 text-xs transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600">
        </div>
      `;
    }).join('');

    if (strategy === 'SHARES') this.$splitHint.innerText = "Assign Weight Shares";
    if (strategy === 'EXACT') this.$splitHint.innerText = "Enter Exact Cash Amounts";
    if (strategy === 'ADJUSTMENT') this.$splitHint.innerText = "Relative Adjustments (+/-)";

    this.calculateLiveOutputPreview();
  }

  calculateLiveOutputPreview() {
    if (this.activeTab !== 'EXPENSE_ADD') return;
    
    const baseAmount = this.calculator.total || 0;
    const normalizedTotal = baseAmount * this.exchangeMultiplier;
    
    if (this.exchangeMultiplier !== 1.0) {
      this.$convertedValue.innerText = `≈ ${normalizedTotal.toFixed(2)} INR`;
    }

    const strategy = this.$strategySelect.value;
    this.$previewError.classList.add('hidden');
    this.$previewContainer.innerHTML = '';
    if (this.activeRoster.length === 0) return;

    let allocations = {};

    if (strategy === 'EQUALLY') {
      const share = normalizedTotal / this.activeRoster.length;
      this.activeRoster.forEach(m => allocations[m] = share);
    } else {
      const inputs = Array.from(this.container.querySelectorAll('[data-member-allocation]'));
      
      if (strategy === 'EXACT') {
        let runningSum = 0;
        let untouchedInputs = [];

        inputs.forEach(i => {
          i.placeholder = "0.00"; 
          if (i.value.trim() === "") {
            untouchedInputs.push(i);
          } else {
            runningSum += evaluateInlineMath(i.value);
          }
        });

        let autoFilledMember = null;
        let remainder = 0;
        
        // N-1 PLACEHOLDER MAGIC
        if (untouchedInputs.length === 1 && runningSum <= normalizedTotal) {
          remainder = normalizedTotal - runningSum;
          untouchedInputs[0].placeholder = `Auto: ${remainder.toFixed(2)}`;
          autoFilledMember = untouchedInputs[0].getAttribute('data-member-allocation');
          runningSum += remainder; 
        }

        this.activeRoster.forEach(m => { 
          const inputElement = this.container.querySelector(`[data-member-allocation="${m}"]`);
          allocations[m] = (m === autoFilledMember) ? remainder : evaluateInlineMath(inputElement?.value); 
        });

        if (Math.abs(runningSum - normalizedTotal) > 0.01) {
          this.$previewError.classList.remove('hidden');
        }
      } 
      else {
        let values = {};
        inputs.forEach(i => values[i.getAttribute('data-member-allocation')] = evaluateInlineMath(i.value));

        if (strategy === 'SHARES') {
          let sumWeights = Object.values(values).reduce((a, b) => a + b, 0);
          this.activeRoster.forEach(m => allocations[m] = sumWeights > 0 ? normalizedTotal * (values[m] / sumWeights) : 0);
        } else if (strategy === 'ADJUSTMENT') {
          let sumAdjustments = Object.values(values).reduce((a, b) => a + b, 0);
          const baseShare = (normalizedTotal - sumAdjustments) / this.activeRoster.length;
          this.activeRoster.forEach(m => allocations[m] = baseShare + (values[m] || 0));
        }
      }
    }

    const state = store.getState();
    const profiles = computeLedgerState(state.groupEvents).profiles;

    Object.keys(allocations).forEach(member => {
      const name = profiles[member]?.name || member.split('@')[0];
      this.$previewContainer.innerHTML += `
        <div class="flex justify-between items-center bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800 shadow-2xs">
          <span class="truncate max-w-[60%] text-slate-500 font-medium text-[10px] ml-1">${name}</span>
          <span class="font-black font-mono text-slate-800 dark:text-slate-200 text-xs">INR ${allocations[member].toFixed(2)}</span>
        </div>`;
    });
    
    this.currentAllocationsMatrix = allocations;
  }

  async handleSubmit() {
    if (this.calculator.total <= 0) return alert("Amount must evaluate above 0.00");
    const normalizedTotal = this.calculator.total * this.exchangeMultiplier;

    const payload = {
      title: this.$title.value,
      raw_amount_string: this.calculator.expression,
      evaluated_amount: normalizedTotal,
      foreign_amount: this.calculator.total,
      foreign_currency: this.$currency.value,
      exchange_rate: this.exchangeMultiplier,
      currency: 'INR',
      custom_timestamp: new Date(this.$datetime.value).toISOString(),
    };

    if (this.activeTab === 'EXPENSE_ADD') {
      payload.category = this.$category.value;
      payload.split_strategy = this.$strategySelect.value;
      payload.allocations = Object.keys(this.currentAllocationsMatrix).map(user => ({ user, value: this.currentAllocationsMatrix[user] }));
      payload.payers = [];
      if (this.receiptBase64) payload.receipt_local_url = this.receiptBase64;

      if (this.$payerMode.value === 'SINGLE') {
        payload.target_peer_identity = this.container.querySelector('#comp-single-payer-dropdown').value;
        payload.payers = [{ user: payload.target_peer_identity, value: normalizedTotal }];
      } else {
        let runSum = 0;
        this.container.querySelectorAll('[data-payer-share]').forEach(input => {
          const user = input.getAttribute('data-payer-share');
          const v = evaluateInlineMath(input.value);
          runSum += v;
          if (v > 0) payload.payers.push({ user, value: v });
        });
        if (Math.abs(runSum - normalizedTotal) > 0.02) {
          return alert(`Multi-payers sum must match total (${normalizedTotal.toFixed(2)})`);
        }
      }
    } else if (this.activeTab === 'TRANSFER') {
      if (this.$transferSender.value === this.$transferReceiver.value) return alert("Sender and Receiver cannot be the same.");
      payload.category = "Financial";
      payload.override_actor_identity = this.$transferSender.value;
      payload.target_peer_identity = this.$transferReceiver.value;

    } else if (this.activeTab === 'LOAN') {
      if (this.$loanLender.value === this.$loanBorrower.value) return alert("Lender and Borrower cannot be the same.");
      payload.category = "Financial";
      payload.override_actor_identity = this.$loanLender.value;
      payload.target_peer_identity = this.$loanBorrower.value;
      payload.interest_type = this.$loanInterestType.value;
      payload.interest_rate = parseFloat(this.$loanInterestRate.value) || 0;
    }

    try {
      const activeGroupId = store.getState().activeGroupId;
      if (this.editingEventId) {
        await LedgerService.appendLocalEvent(activeGroupId, 'EXPENSE_DELETE', { target_event_id: this.editingEventId });
      }
      await LedgerService.appendLocalEvent(activeGroupId, this.activeTab, payload);
      this.resetForm();
      AppRouter.navigate('group-detail');
    } catch (err) {
      alert(`Ledger Submit Failure: ${err.message}`);
    }
  }

  loadExpenseForEdit(eventNode) {
      this.editingEventId = eventNode.eventId || eventNode.event_id;
      const payload = eventNode.rawPayload || (typeof eventNode.payload_json === 'string' ? JSON.parse(eventNode.payload_json) : eventNode.payload_json);
      
      this.$headerTitle.innerText = "Edit Transaction";
      this.$cancelEditBtn.classList.remove('hidden');
      this.$title.value = payload.title;
  
      const tabTarget = this.container.querySelector(`[data-tab="${eventNode.event_type || 'EXPENSE_ADD'}"]`);
      if (tabTarget) tabTarget.click();
  
      this.calculator.expression = payload.raw_amount_string || payload.evaluated_amount.toString();
      this.calculator.evaluateExpression();
  
      setTimeout(() => {
        if (this.activeTab === 'EXPENSE_ADD') {
          this.$category.value = payload.category || 'General';
          this.$strategySelect.value = payload.split_strategy || 'EQUALLY';
          
          if (payload.payers && payload.payers.length > 1) {
            this.$payerMode.value = 'MULTIPLE';
            this.$payerMode.dispatchEvent(new Event('change'));
            payload.payers.forEach(p => {
              const input = this.container.querySelector(`[data-payer-share="${p.user}"]`);
              if (input) input.value = p.value;
            });
          } else if (payload.payers && payload.payers.length === 1) {
            this.container.querySelector('#comp-single-payer-dropdown').value = payload.payers[0].user;
          }
  
          this.receiptBase64 = payload.receipt_local_url || null;
          if (this.receiptBase64) {
            this.$zoneStatus.innerText = "✓ Receipt Loaded";
            this.$uploadZone.classList.add('border-accent-500', 'bg-accent-50');
          }
          
          this.renderItemizedInputs();
        } else if (this.activeTab === 'TRANSFER') {
          this.$transferSender.value = eventNode.actor_identity;
          this.$transferReceiver.value = payload.target_peer_identity;
        } else if (this.activeTab === 'LOAN') {
          this.$loanLender.value = eventNode.actor_identity;
          this.$loanBorrower.value = payload.target_peer_identity;
          this.$loanInterestType.value = payload.interest_type || 'NONE';
          this.$loanInterestRate.value = payload.interest_rate || 0;
        }
      }, 50);
  }

  resetForm() {
    this.editingEventId = null;
    this.receiptBase64 = null;
    this.$headerTitle.innerText = "Log Transaction";
    this.$cancelEditBtn.classList.add('hidden');
    this.$form.reset();
    
    this.$zoneStatus.innerText = "Attach Bill Receipt";
    this.$uploadZone.classList.remove('border-accent-500', 'bg-accent-50');
    this.calculator.reset();
    
    this.container.querySelector('[data-tab="EXPENSE_ADD"]').click();
    this.$payerMode.value = 'SINGLE';
    this.$payerMode.dispatchEvent(new Event('change'));
    this.$strategySelect.value = 'EQUALLY';
    this.renderItemizedInputs();
  }

  destroy() {
    this.unsubscribe();
    this.calculator.destroy();
    if (this._handleKeydown) window.removeEventListener('keydown', this._handleKeydown);
  }
}