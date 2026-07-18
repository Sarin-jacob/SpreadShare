// src/js/components/ExpenseForm.js
import { store } from '../store.js';
import { LedgerService } from '../services/LedgerService.js';
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

    // Listen to store changes (e.g., when switching groups)
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.render();
    this.cacheDOM();
    this.attachListeners();
  }

  onStateChange(state) {
    // Only process updates if this view is actually active
    if (state.currentView !== 'add-expense') return;

    // Recalculate roster based on current ledger
    const computedState = computeLedgerState(state.groupEvents);
    this.activeRoster = Object.keys(computedState.members).length > 0 
      ? Object.keys(computedState.members) 
      : [state.userProfile?.email || 'Unknown'];

    this.updateDropdowns();
  }

  // Inject the DOM once
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
            <h3 class="text-sm font-bold" id="form-header-title">New Ledger Entry</h3>
          </div>
          <button id="cancel-edit-btn" class="hidden text-xs text-rose-500 font-bold bg-rose-500/10 px-2 py-1 rounded-lg">Cancel Edit</button>
        </div>

        <form id="comp-expense-form" class="space-y-3" onsubmit="return false;">
          <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-right font-mono shadow-inner">
            <span class="block text-left text-[9px] text-slate-500 uppercase font-bold tracking-wider">Arithmetic Parser</span>
            <div id="calc-display-expression" class="text-xs text-slate-400 min-h-4 truncate">0</div>
            <div id="calc-display-value" class="text-3xl font-black text-emerald-400 mt-1 truncate">0.00</div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description / Target Peer</label>
              <input type="text" id="comp-exp-title" required placeholder="Dinner..." class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date & Time</label>
              <input type="datetime-local" id="comp-exp-datetime" value="${localISOTime}" class="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none text-slate-900 dark:text-slate-100 font-mono">
            </div>
          </div>

          <!-- WHO PAID SECTION -->
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl space-y-2">
            <div class="flex justify-between items-center">
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transaction Payer Mode</label>
              <select id="comp-payer-mode" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1 rounded-lg text-[10px] font-bold focus:outline-none">
                <option value="SINGLE">Single Person Paid</option>
                <option value="MULTIPLE">Multiple People Split Cost</option>
              </select>
            </div>
            <div id="comp-payer-single-slot">
              <select id="comp-single-payer-dropdown" class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-semibold focus:outline-none text-slate-900 dark:text-slate-100"></select>
            </div>
            <div id="comp-payer-multiple-slot" class="space-y-1.5 hidden max-h-32 overflow-y-auto"></div>
          </div>

          <!-- SPLIT METHOD SECTION -->
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
                <option value="EQUALLY">Split Equally</option>
                <option value="SHARES">Split By Shares</option>
                <option value="EXACT">Split By Exact Amounts</option>
                <option value="ADJUSTMENT">Split By Adjustments (+/-)</option>
              </select>
            </div>
          </div>

          <div id="comp-advanced-split-block" class="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 p-3 rounded-2xl space-y-2 hidden">
            <h4 id="comp-split-hint" class="text-[9px] font-bold text-accent-500 uppercase tracking-wider">Allocation Parameters</h4>
            <div id="comp-split-members-list" class="space-y-1.5 max-h-32 overflow-y-auto pr-1"></div>
          </div>

          <!-- LIVE PREVIEW LOGS -->
          <div class="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-3 space-y-2">
            <h4 class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center justify-between">
              <span>Calculated Output Preview</span>
              <span id="comp-preview-error" class="text-rose-500 normal-case hidden font-medium">Sum error</span>
            </h4>
            <div id="comp-live-calculation-preview" class="grid grid-cols-2 gap-2 font-mono text-[11px] text-slate-500"></div>
          </div>

          <!-- RECEIPT UPLOAD ZONE -->
          <div id="receipt-upload-zone" class="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-accent-500/40 rounded-2xl p-3 text-center cursor-pointer bg-white/40 dark:bg-slate-800/20">
            <input type="file" id="receipt-file-input" class="hidden" accept="image/*">
            <div class="flex items-center justify-center space-x-2 text-slate-400">
              <span class="text-xs font-bold" id="receipt-zone-status">📸 Attach Bill Image Receipt</span>
            </div>
          </div>

          <!-- CALCULATOR MOUNT POINT -->
          <div class="grid grid-cols-4 gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800/80 font-mono">
            ${['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL'].map(char => `
              <button type="button" class="calc-btn h-14 text-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-xl font-bold shadow-2xs cursor-pointer active:scale-95" data-val="${char}">${char}</button>
            `).join('')}
            <button type="submit" id="comp-btn-submit" class="bg-emerald-600 text-white font-black rounded-xl text-lg cursor-pointer active:scale-95">OK</button>
          </div>
        </form>
      </div>
    `;
  }

  cacheDOM() {
    this.$form = this.container.querySelector('#comp-expense-form');
    this.$title = this.container.querySelector('#comp-exp-title');
    this.$datetime = this.container.querySelector('#comp-exp-datetime');
    this.$payerMode = this.container.querySelector('#comp-payer-mode');
    this.$singleSlot = this.container.querySelector('#comp-payer-single-slot');
    this.$multiSlot = this.container.querySelector('#comp-payer-multiple-slot');
    this.$singlePayerDropdown = this.container.querySelector('#comp-single-payer-dropdown');
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
    
    this.$cancelEditBtn = this.container.querySelector('#cancel-edit-btn');
    this.$headerTitle = this.container.querySelector('#form-header-title');

    // Instantiate Calculator
    this.calculator = new Calculator(this.container, (total, expression) => {
      this.calculateLiveOutputPreview();
    });
  }

  updateDropdowns() {
    // 1. Populate Single Payer Dropdown
    this.$singlePayerDropdown.innerHTML = this.activeRoster
      .map(m => `<option value="${m}">${m}</option>`).join('');
    
    // Default to the current logged-in user if available
    const userEmail = store.getState().userProfile?.email;
    if (this.activeRoster.includes(userEmail)) {
      this.$singlePayerDropdown.value = userEmail;
    }

    // 2. Populate Multi-Payer List
    this.$multiSlot.innerHTML = this.activeRoster.map(member => `
      <div class="flex justify-between items-center text-xs bg-slate-50 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <span class="truncate max-w-[65%] font-medium text-slate-400">${member.split('@')[0]} paid:</span>
        <input type="number" step="any" data-payer-share="${member}" value="0" class="w-20 bg-white dark:bg-slate-950 border p-1 text-right font-mono rounded-lg focus:outline-none">
      </div>
    `).join('');

    this.renderItemizedInputs();
  }

  attachListeners() {
    this.$payerMode.addEventListener('change', (e) => {
      this.$singleSlot.classList.toggle('hidden', e.target.value !== 'SINGLE');
      this.$multiSlot.classList.toggle('hidden', e.target.value === 'SINGLE');
    });

    this.$strategySelect.addEventListener('change', () => this.renderItemizedInputs());

    // Event delegation for dynamically created multi-payer/split inputs
    this.container.addEventListener('input', (e) => {
      if (e.target.matches('[data-member-allocation], [data-payer-share]')) {
        this.calculateLiveOutputPreview();
      }
    });

    // Receipt File Upload Handlers
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

    // Handle Form Submit (All heavy math happens here)
    this.$form.addEventListener('submit', (e) => this.handleSubmit());

    // Handle Edit Cancel
    this.$cancelEditBtn.addEventListener('click', () => this.resetForm());
  }

  renderItemizedInputs() {
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
    const totalAmount = this.calculator.total || 0;
    const strategy = this.$strategySelect.value;
    
    this.$previewError.classList.add('hidden');
    this.$previewContainer.innerHTML = '';
    if (this.activeRoster.length === 0) return;

    let allocations = {};

    if (strategy === 'EQUALLY') {
      const share = totalAmount / this.activeRoster.length;
      this.activeRoster.forEach(m => allocations[m] = share);
    } else {
      const inputs = this.container.querySelectorAll('[data-member-allocation]');
      let values = {};
      inputs.forEach(i => values[i.getAttribute('data-member-allocation')] = parseFloat(i.value) || 0);

      if (strategy === 'SHARES') {
        let sumWeights = Object.values(values).reduce((a, b) => a + b, 0);
        this.activeRoster.forEach(m => allocations[m] = sumWeights > 0 ? totalAmount * (values[m] / sumWeights) : 0);
      } else if (strategy === 'EXACT') {
        let runningSum = 0;
        this.activeRoster.forEach(m => { allocations[m] = values[m] || 0; runningSum += allocations[m]; });
        if (Math.abs(runningSum - totalAmount) > 0.01) {
          this.$previewError.innerText = `⚠️ Sum mismatch`;
          this.$previewError.classList.remove('hidden');
        }
      } else if (strategy === 'ADJUSTMENT') {
        let sumAdjustments = Object.values(values).reduce((a, b) => a + b, 0);
        const baseShare = (totalAmount - sumAdjustments) / this.activeRoster.length;
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
    
    // Store active allocations in instance variable for submit phase
    this.currentAllocationsMatrix = allocations;
  }

  async handleSubmit() {
    if (this.calculator.total <= 0) return alert("Value must evaluate above 0.00");

    const payload = {
      title: this.$title.value,
      category: this.$category.value,
      raw_amount_string: this.calculator.expression,
      evaluated_amount: this.calculator.total,
      currency: 'INR',
      split_strategy: this.$strategySelect.value,
      custom_timestamp: new Date(this.$datetime.value).toISOString(),
      allocations: [],
      payers: []
    };

    if (this.receiptBase64) payload.receipt_local_url = this.receiptBase64;

    // 1. Compose Payers Matrix
    if (this.$payerMode.value === 'SINGLE') {
      payload.payers = [{ user: this.$singlePayerDropdown.value, value: this.calculator.total }];
    } else {
      let runSum = 0;
      this.container.querySelectorAll('[data-payer-share]').forEach(input => {
        const user = input.getAttribute('data-payer-share');
        const v = parseFloat(input.value) || 0;
        runSum += v;
        payload.payers.push({ user, value: v });
      });
      if (Math.abs(runSum - this.calculator.total) > 0.02) {
        return alert(`Payers sum (${runSum.toFixed(2)}) must match total (${this.calculator.total.toFixed(2)})`);
      }
    }

    // 2. Compose Allocations Matrix (pre-calculated via live preview)
    payload.allocations = Object.keys(this.currentAllocationsMatrix).map(user => ({
      user: user,
      value: this.currentAllocationsMatrix[user]
    }));

    try {
      const activeGroupId = store.getState().activeGroupId;
      
      // If we are editing, fire off a deletion for the old event first
      if (this.editingEventId) {
        await LedgerService.appendLocalEvent(activeGroupId, 'EXPENSE_DELETE', { target_event_id: this.editingEventId });
      }

      // Save the new/updated entry
      await LedgerService.appendLocalEvent(activeGroupId, 'EXPENSE_ADD', payload);
      
      this.resetForm();
      AppRouter.navigate('group-detail');
    } catch (err) {
      alert(`Ledger Submit Failure: ${err.message}`);
    }
  }

  /**
   * Called by the parent/router when the user clicks "Edit" on an existing transaction
   */
  loadExpenseForEdit(eventNode) {
    this.editingEventId = eventNode.eventId || eventNode.event_id;
    const payload = eventNode.rawPayload || (typeof eventNode.payload_json === 'string' ? JSON.parse(eventNode.payload_json) : eventNode.payload_json);
    
    this.$headerTitle.innerText = "Edit Ledger Entry";
    this.$cancelEditBtn.classList.remove('hidden');

    this.$title.value = payload.title;
    this.$category.value = payload.category || 'Food';
    this.$strategySelect.value = payload.split_strategy || 'EQUALLY';
    
    this.receiptBase64 = payload.receipt_local_url || null;
    if (this.receiptBase64) {
      this.$zoneStatus.innerText = "✓ Receipt Loaded";
      this.$zoneStatus.classList.add('text-emerald-500');
    }

    // Pass historical string back to the calculator
    this.calculator.expression = payload.raw_amount_string || payload.evaluated_amount.toString();
    this.calculator.evaluateExpression();

    this.renderItemizedInputs();
    
    // Need to defer setting dynamic inputs until after they are generated
    setTimeout(() => {
      // Restore Payer configuration
      if (payload.payers && payload.payers.length > 1) {
        this.$payerMode.value = 'MULTIPLE';
        this.$payerMode.dispatchEvent(new Event('change'));
        payload.payers.forEach(p => {
          const input = this.container.querySelector(`[data-payer-share="${p.user}"]`);
          if (input) input.value = p.value;
        });
      } else if (payload.payers && payload.payers.length === 1) {
        this.$singlePayerDropdown.value = payload.payers[0].user;
      }
      this.calculateLiveOutputPreview();
    }, 50);
  }

  resetForm() {
    this.editingEventId = null;
    this.receiptBase64 = null;
    this.$headerTitle.innerText = "New Ledger Entry";
    this.$cancelEditBtn.classList.add('hidden');
    this.$form.reset();
    this.$zoneStatus.innerText = "📸 Attach Bill Image Receipt";
    this.$zoneStatus.classList.remove('text-emerald-500');
    this.calculator.reset();
    
    // Reset drop downs
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