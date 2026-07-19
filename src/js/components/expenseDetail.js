// src/js/components/ExpenseDetail.js
import { store } from '../store.js';
import { LedgerService } from '../services/LedgerService.js';
import { AppRouter } from '../router.js';
import { computeLedgerState } from '../engine.js';

export class ExpenseDetail {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentEvent = null;
    
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.renderSkeleton();
    this.cacheDOM();
    this.attachListeners();
  }

  onStateChange(state) {
    if (state.currentView !== 'expense-detail' || !state.selectedExpenseDetails) return;
    this.updateUI(state);
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-4 animate-fade-in pb-8 max-w-lg mx-auto relative">
        <div class="flex items-center space-x-2">
          <button type="button" data-route="group-detail" class="text-slate-400 hover:text-slate-800 dark:hover:text-white p-2 -ml-2 rounded-full transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-black tracking-tight">Transaction Summary</h3>
        </div>

        <div class="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 p-5 rounded-3xl shadow-sm space-y-4 overflow-hidden relative">
          <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-400 to-emerald-400 opacity-50"></div>
          
          <div class="flex justify-between items-start border-b border-slate-100 dark:border-slate-700/60 pb-4">
            <div class="max-w-[60%]">
              <h2 id="dtl-title" class="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight">Item Label</h2>
              <div class="flex items-center space-x-2 mt-1.5">
                <span id="dtl-type-badge" class="px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide bg-accent-500/10 text-accent-600">EXPENSE</span>
                <span id="dtl-meta" class="text-[10px] text-slate-400 font-medium truncate">Category &bull; Date</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div id="dtl-total" class="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">INR 0.00</div>
              <div id="dtl-foreign-meta" class="text-[9px] text-slate-400 font-medium mt-1 hidden"></div>
            </div>
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <h4 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Paid By</h4>
              <div id="dtl-payers-list" class="space-y-1.5"></div>
            </div>
            <div>
              <h4 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-t border-slate-100 dark:border-slate-700/60 pt-3">Split Allocations</h4>
              <div id="dtl-allocations-list" class="space-y-1.5"></div>
            </div>
          </div>

          <div id="dtl-receipt-container" class="space-y-2 hidden pt-3 border-t border-slate-100 dark:border-slate-700/60">
            <h4 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Attached Bill (Tap to zoom)</h4>
            <div class="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-900/60 p-2 cursor-zoom-in">
              <img id="dtl-receipt-img" src="" referrerpolicy="no-referrer" alt="Attached digital file receipt asset" class="w-full max-h-72 object-contain rounded-xl">
            </div>
          </div>
        </div>

        <div class="flex space-x-2">
          <button id="dtl-btn-edit" class="flex-grow bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-accent-500 text-slate-700 dark:text-slate-200 font-bold py-3.5 rounded-2xl text-xs transition-colors cursor-pointer shadow-sm">
            ✏️ Edit Entry
          </button>
          <button id="dtl-btn-delete" class="flex-grow bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-500 hover:text-white text-rose-600 font-bold py-3.5 rounded-2xl text-xs transition-all cursor-pointer shadow-sm text-center">
            🚨 Delete
          </button>
        </div>

        <!-- FULLSCREEN IMAGE OVERLAY -->
        <div id="dtl-fullscreen-overlay" class="fixed inset-0 z-[200] bg-slate-900/95 hidden flex flex-col items-center justify-center p-4 cursor-zoom-out backdrop-blur-md">
           <img id="dtl-fullscreen-img" class="max-w-full max-h-full rounded-lg shadow-2xl transition-transform transform scale-95" referrerpolicy="no-referrer" src="">
           <p class="text-white/50 text-xs mt-4 font-bold tracking-wider uppercase">Tap anywhere to close</p>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$title = this.container.querySelector('#dtl-title');
    this.$meta = this.container.querySelector('#dtl-meta');
    this.$total = this.container.querySelector('#dtl-total');
    this.$foreignMeta = this.container.querySelector('#dtl-foreign-meta');
    this.$typeBadge = this.container.querySelector('#dtl-type-badge');
    this.$payersList = this.container.querySelector('#dtl-payers-list');
    this.$allocationsList = this.container.querySelector('#dtl-allocations-list');
    this.$receiptContainer = this.container.querySelector('#dtl-receipt-container');
    this.$receiptImg = this.container.querySelector('#dtl-receipt-img');
    
    this.$fsOverlay = this.container.querySelector('#dtl-fullscreen-overlay');
    this.$fsImg = this.container.querySelector('#dtl-fullscreen-img');

    this.$btnEdit = this.container.querySelector('#dtl-btn-edit');
    this.$btnDelete = this.container.querySelector('#dtl-btn-delete');
  }

  attachListeners() {
    // Zoom out overlay
    this.$fsOverlay.addEventListener('click', () => {
      this.$fsImg.classList.replace('scale-100', 'scale-95');
      setTimeout(() => this.$fsOverlay.classList.add('hidden'), 150);
    });

    // Zoom in overlay
    this.$receiptImg.addEventListener('click', () => {
      this.$fsImg.src = this.$receiptImg.src;
      this.$fsOverlay.classList.remove('hidden');
      setTimeout(() => this.$fsImg.classList.replace('scale-95', 'scale-100'), 10);
    });

    this.$btnDelete.addEventListener('click', async () => {
      if (!this.currentEvent) return;
      const confirmDelete = confirm("Are you sure you want to permanently delete this transaction?");
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

    this.$btnEdit.addEventListener('click', () => {
      if (!this.currentEvent) return;
      window.dispatchEvent(new CustomEvent('request-edit-expense', { detail: this.currentEvent }));
      AppRouter.navigate('add-expense');
    });
  }

  getAvatar(email, profiles, sizeClass = "w-6 h-6") {
    const p = profiles[email];
    if (p && p.picture) return `<img src="${p.picture}" class="${sizeClass} rounded-full object-cover border border-white dark:border-slate-800">`;
    const initial = p && p.name ? p.name.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
    return `<div class="${sizeClass} rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-[9px] shadow-sm">${initial}</div>`;
  }

  updateUI(state) {
    this.currentEvent = state.selectedExpenseDetails;
    const profiles = computeLedgerState(state.groupEvents).profiles;
    const userEmail = state.userProfile?.email || '';
    
    const eventItemNode = this.currentEvent;
    const payload = eventItemNode.rawPayload || (typeof eventItemNode.payload_json === 'string' ? JSON.parse(eventItemNode.payload_json) : eventItemNode.payload_json);
    
    const totalAmount = parseFloat(payload.evaluated_amount) || 0;
    const formattedDate = new Date(payload.custom_timestamp || eventItemNode.timestamp).toLocaleDateString();

    this.$title.innerText = payload.title;
    this.$meta.innerHTML = `${payload.category || 'General'} &bull; ${formattedDate}`;
    this.$total.innerText = `INR ${totalAmount.toFixed(2)}`;
    
    if (payload.foreign_currency && payload.foreign_currency !== 'INR') {
      this.$foreignMeta.classList.remove('hidden');
      this.$foreignMeta.innerText = `Paid ${parseFloat(payload.foreign_amount).toFixed(2)} ${payload.foreign_currency} (Rate: ${(payload.exchange_rate).toFixed(2)})`;
    } else {
      this.$foreignMeta.classList.add('hidden');
    }

    const typeStr = eventItemNode.event_type || 'EXPENSE';
    this.$typeBadge.innerText = typeStr.replace('_', ' ');
    if(typeStr === 'TRANSFER') this.$typeBadge.className = 'px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide bg-amber-500/10 text-amber-600';
    else if (typeStr === 'LOAN') this.$typeBadge.className = 'px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide bg-violet-500/10 text-violet-600';

    this.$payersList.innerHTML = '';
    this.$allocationsList.innerHTML = '';

    if (payload.payers && payload.payers.length > 0) {
      payload.payers.forEach(p => {
        const name = p.user === userEmail ? 'You' : (profiles[p.user]?.name || p.user.split('@')[0]);
        this.$payersList.innerHTML += `
          <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
            <div class="flex items-center space-x-2">
              ${this.getAvatar(p.user, profiles)}
              <span class="text-xs font-medium text-slate-700 dark:text-slate-300">${name}</span>
            </div>
            <span class="font-mono text-slate-800 dark:text-slate-200 text-xs font-black">INR ${p.value.toFixed(2)}</span>
          </div>`;
      });
    } else {
      const name = eventItemNode.actor_identity === userEmail ? 'You' : (profiles[eventItemNode.actor_identity]?.name || eventItemNode.actor_identity.split('@')[0]);
      this.$payersList.innerHTML = `
        <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
          <div class="flex items-center space-x-2">
            ${this.getAvatar(eventItemNode.actor_identity, profiles)}
            <span class="text-xs font-medium text-slate-700 dark:text-slate-300">${name}</span>
          </div>
          <span class="font-mono text-slate-800 dark:text-slate-200 text-xs font-black">INR ${totalAmount.toFixed(2)}</span>
        </div>`;
    }

    if (payload.allocations) {
      payload.allocations.forEach(alloc => {
        const name = alloc.user === userEmail ? 'You' : (profiles[alloc.user]?.name || alloc.user.split('@')[0]);
        this.$allocationsList.innerHTML += `
          <div class="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-none">
            <div class="flex items-center space-x-2">
              ${this.getAvatar(alloc.user, profiles, "w-5 h-5")}
              <span class="text-xs text-slate-600 dark:text-slate-400">${name}</span>
            </div>
            <span class="font-mono text-slate-700 dark:text-slate-300 text-xs font-bold">INR ${(parseFloat(alloc.value) || 0).toFixed(2)}</span>
          </div>`;
      });
    } else if (payload.target_peer_identity) { 
       const name = payload.target_peer_identity === userEmail ? 'You' : (profiles[payload.target_peer_identity]?.name || payload.target_peer_identity.split('@')[0]);
       this.$allocationsList.innerHTML = `
          <div class="flex justify-between items-center py-1.5">
            <div class="flex items-center space-x-2">
              ${this.getAvatar(payload.target_peer_identity, profiles, "w-5 h-5")}
              <span class="text-xs text-slate-600 dark:text-slate-400">${name}</span>
            </div>
            <span class="font-mono text-slate-700 dark:text-slate-300 text-xs font-bold">INR ${totalAmount.toFixed(2)}</span>
          </div>`;
    }

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