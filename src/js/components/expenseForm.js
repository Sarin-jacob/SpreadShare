// src/js/components/ExpenseForm.js
import { store } from '../store.js';
import { LedgerService } from '../services/LedgerService.js';
import { CurrencyService } from '../services/CurrencyService.js';
import { computeLedgerState } from '../engine.js';
import { Calculator } from '../calculator.js';
import { AppRouter } from '../router.js';

export class ExpenseForm {
  constructor(containerElement) {
    this.container = containerElement;
    this.calculator = null;
    this.activeRoster = [];
    this.receiptBase64 = null;
    this.editingEventId = null;
    this.activeTab = 'EXPENSE_ADD'; // 'EXPENSE_ADD' | 'TRANSFER' | 'LOAN'

    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.render();
    this.cacheDOM();
    this.attachListeners();
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
      <div class="space-y-4 animate-fade-in pb-12">
        <div class="flex items-center justify-between space-x-2">
          <div class="flex items-center space-x-2">
            <button type="button" data-route="group-detail" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </button>
            <h3 class="text-sm font-bold" id="form-header-title">Log Transaction</h3>
          </div>
          <button id="cancel-edit-btn" class="hidden text-xs text-rose-500 font-bold bg-rose-500/10 px-2 py-1 rounded-lg">Cancel Edit</button>
        </div>

        <!-- SEGMENTED TABS CONTROLLER -->
        <div class="flex p-1 space-x-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
          <button data-tab="EXPENSE_ADD" class="form-tab flex-1 py-1.5 text-xs font-bold rounded-lg shadow-xs bg-white text-slate-800 dark:bg-slate-700 dark:text-white transition-all">Expense</button>
          <button data-tab="TRANSFER" class="form-tab flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all">Transfer</button>
          <button data-tab="LOAN" class="form-tab flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all">Loan</button>
        </div>

        <form id="comp-expense-form" class="space-y-3" onsubmit="return false;">
          
          <!-- SHARED CALCULATOR DISPLAY -->
          <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-mono shadow-inner relative">
            <span class="block text-left text-[9px] text-slate-500 uppercase font-bold tracking-wider">Arithmetic Parser</span>
            
            <div class="absolute top-4 right-4 flex items-center space-x-1 bg-slate-800 rounded-lg px-2 py-1">
              <select id="comp-currency" class="bg-transparent text-xs font-bold text-emerald-400 focus:outline-none appearance-none cursor-pointer">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
              </select>
              <svg class="w-3 h-3 text-emerald-400/50" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
            </div>

            <div id="calc-display-expression" class="text-xs text-slate-400 min-h-4 mt-4 truncate">0</div>
            <div id="calc-display-value" class="text-3xl font-black text-emerald-400 mt-1 truncate">0.00</div>
            <div id="calc-converted-value" class="text-[10px] text-slate-400 hidden mt-1">≈ 0.00 INR</div>
          </div>

          <!-- COMMON FIELDS: Title & Date -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description / Notes</label>
              <input type="text" id="comp-exp-title" required placeholder="Dinner, Rent..." class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date & Time</label>
              <input type="datetime-local" id="comp-exp-datetime" value="${localISOTime}" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100 font-mono">
            </div>
          </div>

          <!-- ========================================== -->
          <!-- TAB 1: EXPENSE SPECIFIC FIELDS -->
          <!-- ========================================== -->
          <div id="section-expense" class="space-y-3 animate-fade-in">
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl space-y-2">
              <div class="flex justify-between items-center">
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Who Paid?</label>
                <select id="comp-payer-mode" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1 rounded-lg text-[10px] font-bold focus:outline-none">
                  <option value="SINGLE">Single Person</option>
                  <option value="MULTIPLE">Multiple People</option>
                </select>
              </div>
              <div id="comp-payer-single-slot">
                <select id="comp-single-payer-dropdown" class="w-full roster-dropdown bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold focus:outline-none text-slate-900 dark:text-slate-100"></select>
              </div>
              <div id="comp-payer-multiple-slot" class="space-y-1.5 hidden max-h-32 overflow-y-auto"></div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category</label>
                <select id="comp-exp-category" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-medium focus:outline-none text-slate-900 dark:text-slate-100">
                  <option value="Food">Food & Dining</option>
                  <option value="Utilities">Utilities & Bills</option>
                  <option value="Travel">Transportation</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="General">General/Other</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Split Strategy</label>
                <select id="comp-exp-strategy" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-medium focus:outline-none text-slate-900 dark:text-slate-100">
                  <option value="EQUALLY">Split Equally</option>
                  <option value="SHARES">Split By Shares</option>
                  <option value="EXACT">Split Exact Amounts</option>
                  <option value="ADJUSTMENT">Relative Adjustments</option>
                </select>
              </div>
            </div>

            <div id="comp-advanced-split-block" class="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 p-3 rounded-2xl space-y-2 hidden">
              <h4 id="comp-split-hint" class="text-[9px] font-bold text-accent-500 uppercase tracking-wider">Allocation Parameters</h4>
              <div id="comp-split-members-list" class="space-y-1.5 max-h-32 overflow-y-auto pr-1"></div>
            </div>

            <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-3 space-y-2">
              <h4 class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                <span>Output Preview</span>
                <span id="comp-preview-error" class="text-rose-500 normal-case hidden font-medium">Sum error</span>
              </h4>
              <div id="comp-live-calculation-preview" class="grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-500"></div>
            </div>

            <div id="receipt-upload-zone" class="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-accent-500/40 rounded-2xl p-3 text-center cursor-pointer bg-white/40 dark:bg-slate-800/20">
              <input type="file" id="receipt-file-input" class="hidden" accept="image/*">
              <div class="flex items-center justify-center space-x-2 text-slate-400">
                <span class="text-xs font-bold" id="receipt-zone-status">📸 Attach Bill Image Receipt</span>
              </div>
            </div>
          </div>

          <!-- ========================================== -->
          <!-- TAB 2: TRANSFER SPECIFIC FIELDS -->
          <!-- ========================================== -->
          <div id="section-transfer" class="space-y-3 hidden animate-fade-in">
            <div class="bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-2xl space-y-3">
              <div>
                <label class="block text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1">Sender (Who Paid)</label>
                <select id="transfer-sender" class="w-full roster-dropdown bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold focus:outline-none"></select>
              </div>
              <div class="flex justify-center -my-2 relative z-10">
                <div class="bg-amber-100 dark:bg-amber-900/40 p-1.5 rounded-full border border-amber-200 dark:border-amber-700/50 text-amber-500">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1">Receiver (Who got it)</label>
                <select id="transfer-receiver" class="w-full roster-dropdown bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold focus:outline-none"></select>
              </div>
            </div>
          </div>

          <!-- ========================================== -->
          <!-- TAB 3: LOAN SPECIFIC FIELDS -->
          <!-- ========================================== -->
          <div id="section-loan" class="space-y-3 hidden animate-fade-in">
            <div class="bg-violet-500/5 border border-violet-500/20 p-3.5 rounded-2xl space-y-3">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Lender</label>
                  <select id="loan-lender" class="w-full roster-dropdown bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold focus:outline-none"></select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Borrower</label>
                  <select id="loan-borrower" class="w-full roster-dropdown bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold focus:outline-none"></select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 pt-2 border-t border-violet-500/10">
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Interest Type</label>
                  <select id="loan-interest-type" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-medium focus:outline-none">
                    <option value="SIMPLE">Simple Flat Rate</option>
                    <option value="COMPOUND">Compound Dynamic</option>
                    <option value="NONE" selected>0% Fixed Principal</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Rate (%)</label>
                  <input type="number" id="loan-interest-rate" value="0" placeholder="e.g. 5" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono focus:outline-none">
                </div>
              </div>
            </div>
          </div>

          <!-- SHARED CALCULATOR KEYPAD -->
          <div class="grid grid-cols-4 gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 font-mono">
            ${['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL'].map(char => `
              <button type="button" class="calc-btn h-14 text-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-xl font-bold shadow-2xs cursor-pointer active:scale-95" data-val="${char}">${char}</button>
            `).join('')}
            <button type="submit" id="comp-btn-submit" class="bg-emerald-600 text-white font-black rounded-xl text-lg cursor-pointer active:scale-95 shadow-md">OK</button>
          </div>

        </form>
      </div>
    `;
  }

  cacheDOM() {
    this.$form = this.container.querySelector('#comp-expense-form');
    this.$title = this.container.querySelector('#comp-exp-title');
    this.$datetime = this.container.querySelector('#comp-exp-datetime');
    this.$cancelEditBtn = this.container.querySelector('#cancel-edit-btn');
    this.$headerTitle = this.container.querySelector('#form-header-title');

    // Sections
    this.$sectionExpense = this.container.querySelector('#section-expense');
    this.$sectionTransfer = this.container.querySelector('#section-transfer');
    this.$sectionLoan = this.container.querySelector('#section-loan');
    this.$tabButtons = this.container.querySelectorAll('.form-tab');

    // Tab 1: Expense
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

    // Tab 2 & 3 specifics
    this.$transferSender = this.container.querySelector('#transfer-sender');
    this.$transferReceiver = this.container.querySelector('#transfer-receiver');
    this.$loanLender = this.container.querySelector('#loan-lender');
    this.$loanBorrower = this.container.querySelector('#loan-borrower');
    this.$loanInterestType = this.container.querySelector('#loan-interest-type');
    this.$loanInterestRate = this.container.querySelector('#loan-interest-rate');

    this.calculator = new Calculator(this.container, () => this.calculateLiveOutputPreview());
    this.$currency = this.container.querySelector('#comp-currency');
    this.$convertedValue = this.container.querySelector('#calc-converted-value');
    this.exchangeMultiplier = 1.0; // Default to 1:1
  }

  updateDropdowns() {
    const optionsHtml = this.activeRoster.map(m => `<option value="${m}">${m}</option>`).join('');
    
    // Inject options into all dropdowns with the roster-dropdown class
    this.container.querySelectorAll('.roster-dropdown').forEach(select => {
      select.innerHTML = optionsHtml;
    });

    // Default sender/payer to the logged-in user
    const userEmail = store.getState().userProfile?.email;
    if (this.activeRoster.includes(userEmail)) {
      this.container.querySelector('#comp-single-payer-dropdown').value = userEmail;
      this.$transferSender.value = userEmail;
      this.$loanLender.value = userEmail;
    }

    // Default receiver/borrower to the next person in the list if available
    const peerEmail = this.activeRoster.find(m => m !== userEmail) || userEmail;
    this.$transferReceiver.value = peerEmail;
    this.$loanBorrower.value = peerEmail;

    // Repaint Expense Multi-Slot
    this.$multiSlot.innerHTML = this.activeRoster.map(member => `
      <div class="flex justify-between items-center text-xs bg-slate-50 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <span class="truncate max-w-[65%] font-medium text-slate-400">${member.split('@')[0]} paid:</span>
        <input type="number" step="any" data-payer-share="${member}" value="0" class="w-20 bg-white dark:bg-slate-950 border p-1 text-right font-mono rounded-lg focus:outline-none">
      </div>
    `).join('');

    this.renderItemizedInputs();
  }

  attachListeners() {
    // 1. Tab Switching Logic
    this.$tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTab = e.target.getAttribute('data-tab');
        
        // Reset Visuals
        this.$tabButtons.forEach(b => {
          b.classList.remove('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
          b.classList.add('text-slate-500');
        });
        
        // Activate current tab button
        e.target.classList.add('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
        e.target.classList.remove('text-slate-500');

        // Toggle visibility of sections
        this.$sectionExpense.classList.toggle('hidden', this.activeTab !== 'EXPENSE_ADD');
        this.$sectionTransfer.classList.toggle('hidden', this.activeTab !== 'TRANSFER');
        this.$sectionLoan.classList.toggle('hidden', this.activeTab !== 'LOAN');
        
        // Adapt default titles
        if (!this.editingEventId) {
          if (this.activeTab === 'TRANSFER') this.$title.placeholder = "Settled up / Cash...";
          else if (this.activeTab === 'LOAN') this.$title.placeholder = "Borrowed for rent...";
          else this.$title.placeholder = "Dinner, Groceries...";
        }
      });
    });

    // 2. Expense Fields Logic
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

    // 3. Receipt Upload
    this.$uploadZone.addEventListener('click', () => this.$fileInput.click());
    this.$fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      this.$zoneStatus.innerText = "📸 Converting Asset...";
      const reader = new FileReader();
      reader.onload = (event) => {
        this.receiptBase64 = event.target.result;
        this.$zoneStatus.innerText = `✓ Attached: ${file.name.slice(0, 12)}...`;
        this.$zoneStatus.classList.add('text-emerald-500');
      };
      reader.readAsDataURL(file);
    });

    // 4. Form Submission
    this.$form.addEventListener('submit', () => this.handleSubmit());
    this.$cancelEditBtn.addEventListener('click', () => this.resetForm());

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
      this.calculateLiveOutputPreview(); // Recalculate splits with new rate
    });

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
    let placeholder = "0.00";
    
    if (strategy === 'SHARES') { this.$splitHint.innerText = "Assign Weight Shares"; placeholder = "1"; }
    if (strategy === 'EXACT') { this.$splitHint.innerText = "Enter Exact Cash Amounts"; }
    if (strategy === 'ADJUSTMENT') { this.$splitHint.innerText = "Relative Adjustments (+/-)"; }

    this.$splitMembersList.innerHTML = this.activeRoster.map(member => `
      <div class="flex justify-between items-center text-xs bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
        <span class="font-mono text-[10px] text-slate-500 truncate max-w-[60%]">${member}</span>
        <input type="number" step="any" data-member-allocation="${member}" value="${strategy === 'SHARES' ? '1' : '0'}" placeholder="${placeholder}" class="w-24 bg-slate-100 dark:bg-slate-950 border p-1.5 rounded-lg text-right font-mono focus:outline-none">
      </div>
    `).join('');

    this.calculateLiveOutputPreview();
  }

  calculateLiveOutputPreview() {
    if (this.activeTab !== 'EXPENSE_ADD') return;
    
    // CONVERT FOREIGN CURRENCY TO BASE (INR)
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
      const share = normalizedTotal / this.activeRoster.length; // Split the normalized total!
      this.activeRoster.forEach(m => allocations[m] = share);
    } else {
      // ... existing strategy logic, just replace totalAmount with normalizedTotal ...
      const inputs = this.container.querySelectorAll('[data-member-allocation]');
      let values = {};
      inputs.forEach(i => values[i.getAttribute('data-member-allocation')] = parseFloat(i.value) || 0);

      if (strategy === 'SHARES') {
        let sumWeights = Object.values(values).reduce((a, b) => a + b, 0);
        this.activeRoster.forEach(m => allocations[m] = sumWeights > 0 ? normalizedTotal * (values[m] / sumWeights) : 0);
      } else if (strategy === 'EXACT') {
        let runningSum = 0;
        this.activeRoster.forEach(m => { allocations[m] = values[m] || 0; runningSum += allocations[m]; });
        if (Math.abs(runningSum - normalizedTotal) > 0.01) {
          this.$previewError.innerText = `⚠️ Sum mismatch`;
          this.$previewError.classList.remove('hidden');
        }
      } else if (strategy === 'ADJUSTMENT') {
        let sumAdjustments = Object.values(values).reduce((a, b) => a + b, 0);
        const baseShare = (normalizedTotal - sumAdjustments) / this.activeRoster.length;
        this.activeRoster.forEach(m => allocations[m] = baseShare + (values[m] || 0));
      }
    }

    Object.keys(allocations).forEach(member => {
      this.$previewContainer.innerHTML += `
        <div class="flex justify-between items-center bg-slate-100/60 dark:bg-slate-900/40 p-1.5 px-2.5 rounded-xl border border-slate-200/40 dark:border-slate-800/40">
          <span class="truncate max-w-[60%] text-slate-400 font-medium">${member.split('@')[0]}</span>
          <span class="font-bold font-mono text-slate-700 dark:text-slate-300">${allocations[member].toFixed(2)}</span>
        </div>`;
    });
    
    this.currentAllocationsMatrix = allocations;
  }

  async handleSubmit() {
    if (this.calculator.total <= 0) return alert("Value must evaluate above 0.00");

    const normalizedTotal = this.calculator.total * this.exchangeMultiplier;

    const payload = {
      title: this.$title.value,
      raw_amount_string: this.calculator.expression,
      evaluated_amount: normalizedTotal, // Engine ONLY sees normalized INR
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
        // Enforce target_peer_identity backward compatibility for engine.js
        payload.target_peer_identity = this.container.querySelector('#comp-single-payer-dropdown').value;
        payload.payers = [{ user: payload.target_peer_identity, value: this.calculator.total }];
      } else {
        let runSum = 0;
        this.container.querySelectorAll('[data-payer-share]').forEach(input => {
          const user = input.getAttribute('data-payer-share');
          const v = parseFloat(input.value) || 0;
          runSum += v;
          if (v > 0) payload.payers.push({ user, value: v });
        });
        if (Math.abs(runSum - this.calculator.total) > 0.02) {
          return alert(`Payers sum must match total (${this.calculator.total.toFixed(2)})`);
        }
      }
    } else if (this.activeTab === 'TRANSFER') {
      if (this.$transferSender.value === this.$transferReceiver.value) return alert("Sender and Receiver cannot be the same.");
      payload.category = "Financial";
      // To satisfy engine.js: Sender is forced to actor_identity during processing. 
      // We pass both explicitly so the LedgerService can log it properly.
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
    
    this.$headerTitle.innerText = "Edit Ledger Entry";
    this.$cancelEditBtn.classList.remove('hidden');
    this.$title.value = payload.title;

    // Force tab switch
    const tabTarget = this.container.querySelector(`[data-tab="${eventNode.event_type || 'EXPENSE_ADD'}"]`);
    if (tabTarget) tabTarget.click();

    // Restore Calculator
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
          this.$zoneStatus.classList.add('text-emerald-500');
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
    
    this.$zoneStatus.innerText = "📸 Attach Bill Image Receipt";
    this.$zoneStatus.classList.remove('text-emerald-500');
    this.calculator.reset();
    
    // Reset to Expense Tab
    this.container.querySelector('[data-tab="EXPENSE_ADD"]').click();
    this.$payerMode.value = 'SINGLE';
    this.$payerMode.dispatchEvent(new Event('change'));
    this.$strategySelect.value = 'EQUALLY';
    this.renderItemizedInputs();
  }

  destroy() {
    this.unsubscribe();
    this.calculator.destroy();
  }
}