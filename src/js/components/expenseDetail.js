// src/js/components/ExpenseDetail.js
import { store } from '../store.js';
import { LedgerService } from '../services/LedgerService.js';
import { AppRouter } from '../router.js';

export class ExpenseDetail {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentEvent = null;
    
    // Subscribe to global state changes
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.renderSkeleton();
    this.cacheDOM();
    this.attachListeners();
  }

  onStateChange(state) {
    // Only repaint if the detail view is active and we have an item selected
    if (state.currentView !== 'expense-detail' || !state.selectedExpenseDetails) return;
    this.updateUI(state.selectedExpenseDetails);
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-4 animate-fade-in">
        <div class="flex items-center space-x-2">
          <button type="button" data-route="group-detail" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-bold">Transaction Breakdown</h3>
        </div>

        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-2xs space-y-4">
          <div class="flex justify-between items-start border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <div>
              <h2 id="dtl-title" class="text-base font-black text-slate-800 dark:text-slate-100">Item Label</h2>
              <span id="dtl-meta" class="text-[10px] text-slate-400 font-medium block mt-0.5">Category &bull; Date</span>
            </div>
            <div class="text-right">
              <div id="dtl-total" class="text-xl font-black text-slate-900 dark:text-slate-50 font-mono">INR 0.00</div>
              <span id="dtl-type-badge" class="inline-block mt-1 text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded bg-accent-500/10 text-accent-500">EXPENSE</span>
            </div>
          </div>

          <!-- Itemized Member Split Allocations Grid -->
          <div class="space-y-2">
            <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Share Distributions</h4>
            <div id="dtl-allocations-list" class="space-y-1.5 font-mono text-xs"></div>
          </div>

          <!-- Attached Image Receipt Frame Container -->
          <div id="dtl-receipt-container" class="space-y-2 hidden">
            <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Associated Bill Receipt</h4>
            <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/60 p-2">
              <img id="dtl-receipt-img" src="" alt="Attached digital file receipt asset" class="max-h-64 object-contain mx-auto rounded-lg">
            </div>
          </div>

          <!-- Action Mutation Controls Deck -->
          <div class="pt-2 flex space-x-2">
            <button id="dtl-btn-edit" class="flex-grow bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer">
              ✏️ Edit Entry
            </button>
            <button id="dtl-btn-delete" class="flex-grow bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer text-center">
              🚨 Delete Entry
            </button>
          </div>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$title = this.container.querySelector('#dtl-title');
    this.$meta = this.container.querySelector('#dtl-meta');
    this.$total = this.container.querySelector('#dtl-total');
    this.$typeBadge = this.container.querySelector('#dtl-type-badge');
    this.$allocationsList = this.container.querySelector('#dtl-allocations-list');
    this.$receiptContainer = this.container.querySelector('#dtl-receipt-container');
    this.$receiptImg = this.container.querySelector('#dtl-receipt-img');
    
    this.$btnEdit = this.container.querySelector('#dtl-btn-edit');
    this.$btnDelete = this.container.querySelector('#dtl-btn-delete');
  }

  attachListeners() {
    // 1. Safe Deletion Protocol via LedgerService
    this.$btnDelete.addEventListener('click', async () => {
      if (!this.currentEvent) return;
      
      const confirmDelete = confirm("Are you sure you want to permanently delete this open-ledger transaction entry across all synced nodes?");
      if (!confirmDelete) return;

      const eventId = this.currentEvent.eventId || this.currentEvent.event_id;
      const state = store.getState();

      try {
        await LedgerService.appendLocalEvent(state.activeGroupId, 'EXPENSE_DELETE', { target_event_id: eventId });
        AppRouter.navigate('group-detail');
      } catch (err) {
        alert(`Delete failure: ${err.message}`);
      }
    });

    // 2. Trigger Edit Mode
    this.$btnEdit.addEventListener('click', () => {
      if (!this.currentEvent) return;
      // Dispatch a custom event. The main orchestrator will catch this and pass the 
      // payload into the ExpenseForm component class securely.
      window.dispatchEvent(new CustomEvent('request-edit-expense', { detail: this.currentEvent }));
      AppRouter.navigate('add-expense');
    });
  }

  updateUI(eventItemNode) {
    this.currentEvent = eventItemNode;
    const payload = eventItemNode.rawPayload || (typeof eventItemNode.payload_json === 'string' ? JSON.parse(eventItemNode.payload_json) : eventItemNode.payload_json);
    
    const totalAmount = parseFloat(payload.evaluated_amount) || 0;
    const formattedDate = new Date(payload.custom_timestamp || eventItemNode.timestamp).toLocaleDateString();

    this.$title.innerText = payload.title;
    this.$meta.innerHTML = `${payload.category || 'General'} &bull; Mapped by: ${eventItemNode.actor_identity} &bull; ${formattedDate}`;
    this.$total.innerText = `INR ${totalAmount.toFixed(2)}`;
    
    this.$typeBadge.innerText = (eventItemNode.event_type || 'EXPENSE').replace('_', ' ');

    this.$allocationsList.innerHTML = '';

    // Render multi-payer parameters if applicable
    if (payload.payers && payload.payers.length > 0) {
      let payersStr = payload.payers.map(p => `${p.user.split('@')[0]} (INR ${p.value.toFixed(2)})`).join(', ');
      this.$allocationsList.innerHTML += `
        <div class="p-2 bg-slate-100 dark:bg-slate-900/60 rounded-xl mb-2 text-[11px] text-slate-400">
          <span class="font-bold block uppercase text-[8px] tracking-wider mb-0.5 text-accent-400">Payer Allocations Matrix:</span>
          ${payersStr}
        </div>`;
    }

    // Render item shares splits
    if (payload.allocations) {
      payload.allocations.forEach(alloc => {
        this.$allocationsList.innerHTML += `
          <div class="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-none">
            <span class="text-slate-400">${alloc.user}</span>
            <span class="font-bold text-slate-700 dark:text-slate-300">INR ${(parseFloat(alloc.value) || 0).toFixed(2)}</span>
          </div>`;
      });
    }

    // Render uploaded receipt image if present
    if (payload.receipt_local_url) {
      this.$receiptContainer.classList.remove('hidden');
      this.$receiptImg.src = payload.receipt_local_url;
    } else {
      this.$receiptContainer.classList.add('hidden');
      this.$receiptImg.src = "";
    }
  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}