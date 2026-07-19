// src/js/components/GroupDetail.js
import { store } from '../store.js';
import { computeLedgerState, optimizeDebts } from '../engine.js';
import { LedgerService } from '../services/LedgerService.js';
import { AppRouter } from '../router.js';
import { InsightsService } from '../services/InsightsService.js';
import { CanvasCharts } from '../utils/charts.js';

export class GroupDetail {
  constructor(containerElement) {
    this.container = containerElement;
    this.activeTab = 'feed'; 
    this.insightScope = 'group'; 
    
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    this.renderSkeleton();
    this.cacheDOM();
    this.attachListeners();
  }

  onStateChange(state) {
    if (state.currentView !== 'group-detail') return;
    this.updateUI(state);
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-4 animate-fade-in pb-8">
        <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-800 rounded-2xl p-4 shadow-sm dark:from-slate-900 dark:to-slate-800">
          <div class="flex justify-between items-center">
            <div class="w-1/2">
              <h2 id="gd-title" class="text-base font-black truncate">Loading Room...</h2>
              <span id="gd-id" class="text-[9px] text-accent-300 font-mono block truncate">ID: None</span>
            </div>
            <div class="flex space-x-1.5 shrink-0">
              <button type="button" id="gd-btn-invite" class="bg-slate-800 hover:bg-slate-700 text-accent-400 text-xs font-bold py-1.5 px-2.5 rounded-lg border border-slate-700 transition-colors">
                <span id="gd-invite-text">Invite</span>
              </button>
              <button type="button" data-route="add-expense" class="bg-white text-slate-950 dark:bg-accent-500 dark:text-slate-950 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm hover:opacity-90">Log Item</button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-4" id="gd-balances-grid"></div>
        </div>

        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs space-y-2">
          <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Group Roster</h4>
          <div class="flex flex-wrap gap-1.5" id="gd-roster-tags"></div>
        </div>

        <div class="flex space-x-4 border-b border-slate-200 dark:border-slate-800">
          <button id="gd-tab-feed" class="text-xs font-bold pb-2 transition-colors border-b-2 border-accent-500 text-accent-600 dark:text-accent-400 cursor-pointer">Ledger Feed</button>
          <button id="gd-tab-insights" class="text-xs font-bold pb-2 transition-colors border-b-2 border-transparent text-slate-400 hover:text-slate-600 cursor-pointer">Group Insights</button>
        </div>

        <div id="gd-view-feed" class="space-y-2 pb-8">
          <div class="space-y-2" id="gd-ledger-feed"></div>
        </div>

        <div id="gd-view-insights" class="space-y-4 pb-8 hidden animate-fade-in">
          <div class="flex p-1 space-x-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl mb-4">
            <button id="btn-scope-group" class="flex-1 py-1.5 text-xs font-bold rounded-lg bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white transition-all cursor-pointer">Total Group</button>
            <button id="btn-scope-you" class="flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 transition-all cursor-pointer">Your Share</button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs">
              <span class="block text-[9px] text-slate-400 uppercase font-bold tracking-wider">Total Group Spend</span>
              <span id="gd-insight-total" class="block text-lg font-black text-slate-700 dark:text-slate-200 mt-1 font-mono">0.00</span>
            </div>
            <div class="bg-accent-50 dark:bg-accent-900/20 border border-accent-100 dark:border-accent-800/40 p-3.5 rounded-xl shadow-2xs">
              <span class="block text-[9px] text-accent-500 uppercase font-bold tracking-wider">Your Personal Share</span>
              <span id="gd-insight-yours" class="block text-lg font-black text-accent-700 dark:text-accent-400 mt-1 font-mono">0.00</span>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
            <h4 id="gd-insight-title" class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">Group Category Spend</h4>
            <div class="flex items-center space-x-4">
              <div class="w-32 h-32 relative shrink-0"><canvas id="gd-pie-canvas"></canvas></div>
              <div id="gd-category-legend" class="flex-grow space-y-2"></div>
            </div>
          </div>

          <div class="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl shadow-2xs mt-4">
            <h4 class="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider border-b border-amber-500/20 pb-2 mb-3">Suggested Settle Up Plan</h4>
            <div id="gd-insight-settlements" class="space-y-2"></div>
          </div>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$title = this.container.querySelector('#gd-title');
    this.$id = this.container.querySelector('#gd-id');
    this.$balancesGrid = this.container.querySelector('#gd-balances-grid');
    this.$rosterTags = this.container.querySelector('#gd-roster-tags');
    this.$tabFeedBtn = this.container.querySelector('#gd-tab-feed');
    this.$tabInsightsBtn = this.container.querySelector('#gd-tab-insights');
    this.$viewFeed = this.container.querySelector('#gd-view-feed');
    this.$viewInsights = this.container.querySelector('#gd-view-insights');
    this.$ledgerFeed = this.container.querySelector('#gd-ledger-feed');
    this.$btnInvite = this.container.querySelector('#gd-btn-invite');
    this.$inviteText = this.container.querySelector('#gd-invite-text');
    this.$insightTotal = this.container.querySelector('#gd-insight-total');
    this.$insightYours = this.container.querySelector('#gd-insight-yours');
    this.$insightSettlements = this.container.querySelector('#gd-insight-settlements');
    this.$btnScopeGroup = this.container.querySelector('#btn-scope-group');
    this.$btnScopeYou = this.container.querySelector('#btn-scope-you');
    this.$pieCanvas = this.container.querySelector('#gd-pie-canvas');
    this.$categoryLegend = this.container.querySelector('#gd-category-legend');
    this.$insightTitle = this.container.querySelector('#gd-insight-title');
  }

  attachListeners() {
    const switchTab = (target) => {
      this.activeTab = target;
      const act = ['border-accent-500', 'text-accent-600', 'dark:text-accent-400'];
      const inact = ['border-transparent', 'text-slate-400'];
      
      if (target === 'feed') {
        this.$tabFeedBtn.classList.add(...act); 
        this.$tabFeedBtn.classList.remove(...inact);
        this.$tabInsightsBtn.classList.add(...inact); 
        this.$tabInsightsBtn.classList.remove(...act);
        this.$viewFeed.classList.remove('hidden'); 
        this.$viewInsights.classList.add('hidden');
      } else {
        this.$tabInsightsBtn.classList.add(...act); 
        this.$tabInsightsBtn.classList.remove(...inact);
        this.$tabFeedBtn.classList.add(...inact); 
        this.$tabFeedBtn.classList.remove(...act);
        this.$viewInsights.classList.remove('hidden'); 
        this.$viewFeed.classList.add('hidden');
        // Force redraw of canvas when tab becomes visible
        this.updateUI(store.getState());
      }
    };

    this.$tabFeedBtn.addEventListener('click', () => switchTab('feed'));
    this.$tabInsightsBtn.addEventListener('click', () => switchTab('insights'));

    this.$btnScopeGroup.addEventListener('click', () => {
      this.insightScope = 'group';
      this.$btnScopeGroup.classList.add('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
      this.$btnScopeGroup.classList.remove('text-slate-500');
      this.$btnScopeYou.classList.add('text-slate-500');
      this.$btnScopeYou.classList.remove('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
      this.$insightTitle.innerText = "Total Group Spend";
      this.updateUI(store.getState()); 
    });

    this.$btnScopeYou.addEventListener('click', () => {
      this.insightScope = 'you';
      this.$btnScopeYou.classList.add('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
      this.$btnScopeYou.classList.remove('text-slate-500');
      this.$btnScopeGroup.classList.add('text-slate-500');
      this.$btnScopeGroup.classList.remove('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
      this.$insightTitle.innerText = "Your Personal Share";
      this.updateUI(store.getState()); 
    });

    this.$ledgerFeed.addEventListener('click', (e) => {
      const itemRow = e.target.closest('[data-event-id]');
      if (!itemRow) return;
      const eventId = itemRow.getAttribute('data-event-id');
      const state = store.getState();
      const selectedEvent = state.groupEvents.find(ev => (ev.eventId || ev.event_id) === eventId);
      if (selectedEvent) {
        store.setState({ selectedExpenseDetails: selectedEvent });
        AppRouter.navigate('expense-detail');
      }
    });

    this.$btnInvite.addEventListener('click', async () => {
      const state = store.getState();
      if (!state.activeGroupId) return;
      try {
        this.$inviteText.innerText = "Sharing...";
        this.$btnInvite.disabled = true;
        await LedgerService.enableLedgerPublicLinkSharing(state.activeGroupId);
        const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${state.activeGroupId}&name=${encodeURIComponent(state.activeGroupName)}`;
        console.log(inviteUrl);
        await navigator.clipboard.writeText(inviteUrl);
        this.$inviteText.innerText = "Copied!";
      } catch (err) {
        alert(`Invite generation failed: ${err.message}`);
        this.$inviteText.innerText = "Error";
      } finally {
        setTimeout(() => { this.$inviteText.innerText = "Invite"; this.$btnInvite.disabled = false; }, 2000);
      }
    });
  }

  getAvatar(email, profiles, sizeClass = "w-8 h-8") {
    const p = profiles[email];
    if (p && p.picture) {
      return `<img src="${p.picture}" alt="${p.name}" class="${sizeClass} rounded-full border-2 border-white dark:border-slate-800 object-cover shadow-sm">`;
    }
    const initial = p && p.name ? p.name.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
    return `<div class="${sizeClass} rounded-full bg-gradient-to-br from-accent-500 to-accent-600 border-2 border-white dark:border-slate-800 flex items-center justify-center text-white font-bold text-[10px] shadow-sm">${initial}</div>`;
  }

  updateUI(state) {
    if (!state.activeGroupId) return;

    this.$title.innerText = state.activeGroupName || 'Active Room';
    this.$id.innerText = `ID: ${state.activeGroupId}`;
    if (this.$btnInvite) {
      // Check roles cached during initial spreadsheet discovery metadata handshake
      const userRole = state.activeGroupRole || 'member'; 
      const isOwner = userRole === 'owner' || userRole === 'creator';
      
      if (isOwner) {
        this.$btnInvite.classList.remove('hidden');
        this.$btnInvite.style.display = 'flex'; // Safeguard Tailwind grid rules
      } else {
        this.$btnInvite.classList.add('hidden');
        this.$btnInvite.style.display = 'none';
      }
    }

    const computedLedger = computeLedgerState(state.groupEvents);
    const userEmail = state.userProfile?.email || '';

    this.$balancesGrid.innerHTML = Object.keys(computedLedger.members).map(member => {
      const data = computedLedger.members[member];
      const profile = computedLedger.profiles[member];
      const name = member === userEmail ? 'You' : (profile?.name || member.split('@')[0]);
      const isPositive = data.netBalance > 0;
      const isNeutral = data.netBalance === 0;
      
      let textColor = 'text-slate-400';
      let sign = '';
      if (!isNeutral) {
        textColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
        sign = isPositive ? '+' : '';
      }
      
      return `
        <div class="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-xl flex justify-between items-center shadow-2xs">
          <div class="flex items-center space-x-2 truncate pr-2">
            ${this.getAvatar(member, computedLedger.profiles, "w-6 h-6 shrink-0")}
            <span class="text-[10px] text-slate-600 dark:text-slate-300 font-medium truncate">${name}</span>
          </div>
          <span class="text-xs font-black tracking-tight ${textColor} shrink-0">${sign}${data.netBalance.toFixed(2)}</span>
        </div>`;
    }).join('');

    this.$rosterTags.innerHTML = Object.keys(computedLedger.members).map(memberEmail => {
      const profile = computedLedger.profiles[memberEmail];
      const name = memberEmail === userEmail ? 'You' : (profile?.name || memberEmail.split('@')[0]);
      return `
        <span class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[10px] px-2 py-1 rounded-md flex items-center space-x-1.5 shadow-2xs">
          ${this.getAvatar(memberEmail, computedLedger.profiles, "w-3.5 h-3.5 border border-white dark:border-slate-700")}
          <span>${name}</span>
        </span>`;
    }).join('');

    if (computedLedger.expenses.length === 0) {
      this.$ledgerFeed.innerHTML = `<div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full"><p class="text-xs text-slate-400">No transactions recorded yet.</p></div>`;
    } else {
      this.$ledgerFeed.innerHTML = [...computedLedger.expenses].reverse().map(expense => {
        const payload = expense.rawPayload;
        let badgeColor = "bg-slate-100 dark:bg-slate-900 text-slate-500";
        let contextPersonalDebtString = "";
        
        const payerProfile = computedLedger.profiles[expense.payer];
        const payerName = expense.payer === userEmail ? 'You' : (payerProfile?.name || expense.payer.split('@')[0]);

        if (expense.type === 'EXPENSE_ADD') {
          const alloc = (payload.allocations || []).find(a => a.user === userEmail);
          const owes = alloc ? parseFloat(alloc.value) || 0 : 0;

          if (expense.payer === userEmail) {
            const owedToMe = expense.amount - owes;
            contextPersonalDebtString = owedToMe > 0 
              ? `<span class="text-emerald-600 dark:text-emerald-400 font-bold">You are owed INR ${owedToMe.toFixed(2)}</span>`
              : `<span class="text-slate-400">Covered exact share</span>`;
          } else {
            contextPersonalDebtString = owes > 0
              ? `<span class="text-rose-600 dark:text-rose-400 font-bold">You owe INR ${owes.toFixed(2)}</span>`
              : `<span class="text-slate-400">Not in split</span>`;
          }
        } else if (expense.type === 'TRANSFER') {
          badgeColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
          if (expense.payer === userEmail) contextPersonalDebtString = `<span class="text-emerald-500 font-semibold">Sent payment</span>`;
          else if (expense.target === userEmail) contextPersonalDebtString = `<span class="text-emerald-500 font-semibold">Received payment</span>`;
        }

        return `
          <div data-event-id="${expense.eventId}" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs cursor-pointer hover:border-accent-500/30 transition-colors">
            <div class="space-y-1 max-w-[65%]">
              <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${expense.title}</div>
              <div class="text-[10px] block font-medium">${contextPersonalDebtString}</div>
              <div class="flex items-center space-x-1.5 text-[9px] text-slate-400 pt-0.5">
                <span class="px-1.5 py-0.2 rounded font-bold text-[8px] uppercase tracking-wide ${badgeColor}">${expense.category || 'General'}</span>
                <span>&bull;</span>
                <span class="truncate">By ${payerName}</span>
              </div>
            </div>
            <div class="text-right space-y-0.5 font-mono shrink-0">
              <div class="font-black text-slate-900 dark:text-slate-100">INR ${expense.amount.toFixed(2)}</div>
              <div class="text-[9px] text-slate-400">${new Date(expense.timestamp).toLocaleDateString()}</div>
            </div>
          </div>`;
      }).join('');
    }

    // Must pass the raw events (state.groupEvents) so InsightsService works correctly
    this.renderInsights(state.groupEvents, userEmail, computedLedger.members, computedLedger.profiles);
  }

  renderInsights(rawEvents, userEmail, membersMap, profiles) {
    if (!this.$insightSettlements || !this.$insightTotal) return;

    const simplifiedDebts = optimizeDebts(membersMap);
    
    if (simplifiedDebts.length === 0) {
      this.$insightSettlements.innerHTML = `<p class="text-[10px] text-emerald-600 dark:text-emerald-500 text-center py-3 font-bold bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">✨ Everyone is perfectly settled up!</p>`;
    } else {
      this.$insightSettlements.innerHTML = simplifiedDebts.map(debt => {
        const fromName = profiles[debt.from]?.name || debt.from.split('@')[0];
        const toName = profiles[debt.to]?.name || debt.to.split('@')[0];
        const isUserInvolved = debt.from === userEmail || debt.to === userEmail;
        const highlightClass = isUserInvolved ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/50';
        
        return `
          <div class="flex items-center justify-between p-3 rounded-2xl shadow-2xs border ${highlightClass} mb-2">
             <div class="flex items-center space-x-3">
                <div class="flex -space-x-3">
                   ${this.getAvatar(debt.from, profiles, "w-9 h-9 relative z-10")}
                   ${this.getAvatar(debt.to, profiles, "w-9 h-9 opacity-80")}
                </div>
                <div class="text-[11px] leading-tight">
                   <span class="font-bold text-slate-800 dark:text-slate-200">${debt.from === userEmail ? 'You' : fromName}</span>
                   <span class="text-slate-400 mx-0.5 block">owe</span>
                   <span class="font-bold text-slate-800 dark:text-slate-200">${debt.to === userEmail ? 'You' : toName}</span>
                </div>
             </div>
             <div class="font-black font-mono text-accent-600 dark:text-accent-400 text-sm">INR ${debt.amount.toFixed(2)}</div>
          </div>
        `;
      }).join('');
    }

    const targetEmail = this.insightScope === 'you' ? userEmail : null;
    const analytics = InsightsService.processAnalytics(rawEvents, targetEmail, 365);
    
    // Populate the top cards dynamically based on analytics output
    const userAnalytics = targetEmail ? analytics : InsightsService.processAnalytics(rawEvents, userEmail, 365);
    const groupAnalytics = targetEmail ? InsightsService.processAnalytics(rawEvents, null, 365) : analytics;
    
    this.$insightTotal.innerText = groupAnalytics.total.toFixed(2);
    this.$insightYours.innerText = userAnalytics.total.toFixed(2);

    // Render Canvas (delay slightly to ensure container is visible)
    setTimeout(() => {
       if (!this.$viewInsights.classList.contains('hidden')) {
          CanvasCharts.drawPie(this.$pieCanvas, analytics.categories);
       }
    }, 100);

    const colors = CanvasCharts.getColors();
    const sortedCats = Object.entries(analytics.categories).sort((a, b) => b[1] - a[1]);
    
    this.$categoryLegend.innerHTML = sortedCats.length > 0 ? sortedCats.map(([cat, val], i) => `
      <div class="flex justify-between items-center text-[10px] font-medium">
        <div class="flex items-center space-x-1.5 truncate pr-2">
          <span class="w-2.5 h-2.5 rounded-full block shrink-0" style="background-color: ${colors[i % colors.length]}"></span>
          <span class="text-slate-600 dark:text-slate-300 truncate">${cat}</span>
        </div>
        <span class="font-mono text-slate-800 dark:text-slate-200">INR ${val.toFixed(0)}</span>
      </div>
    `).join('') : '<p class="text-[10px] text-slate-400">No data available for this view.</p>';
  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}