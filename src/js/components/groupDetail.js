// src/js/components/GroupDetail.js
import { store } from '../store.js';
import { computeLedgerState, optimizeDebts } from '../engine.js';
import { LedgerService } from '../services/LedgerService.js';
import { AppRouter } from '../router.js';
import { InsightsService } from '../services/InsightsService.js';
import { CanvasCharts } from '../utils/charts.js'

export class GroupDetail {
  constructor(containerElement) {
    this.container = containerElement;
    this.activeTab = 'feed'; // 'feed' | 'insights'
    
    // Subscribe to global state changes
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
        <!-- Group Header Card -->
        <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 dark:from-accent-950 dark:to-slate-900 dark:border-accent-900/40">
          <div class="flex justify-between items-center">
            <div class="w-1/2">
              <h2 id="gd-title" class="text-base font-black tracking-tight text-white truncate">Loading Room...</h2>
              <span id="gd-id" class="text-[9px] text-accent-300 font-mono block truncate">ID: None</span>
            </div>
            <div class="flex space-x-1.5 shrink-0">
              <button type="button" id="gd-btn-invite" class="bg-slate-800 hover:bg-slate-700 text-accent-400 text-xs font-bold py-1.5 px-2.5 rounded-lg border border-slate-700 cursor-pointer flex items-center space-x-1 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                <span id="gd-invite-text">Invite</span>
              </button>
              <button type="button" data-route="add-expense" class="bg-white text-slate-950 dark:bg-accent-500 dark:text-slate-950 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center space-x-1 shadow-sm cursor-pointer hover:opacity-90">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                <span>Log Item</span>
              </button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2" id="gd-balances-grid"></div>
        </div>

        <!-- Roster Tags -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs space-y-2">
          <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Group Roster</h4>
          <div class="flex flex-wrap gap-1.5" id="gd-roster-tags"></div>
        </div>

        <!-- TABS NAVIGATOR -->
        <div class="flex space-x-4 border-b border-slate-200 dark:border-slate-800">
          <button id="gd-tab-feed" class="text-xs font-bold pb-2 transition-colors border-b-2 border-accent-500 text-accent-600 dark:text-accent-400 cursor-pointer">Ledger Feed</button>
          <button id="gd-tab-insights" class="text-xs font-bold pb-2 transition-colors border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer">Group Insights</button>
        </div>

        <!-- TAB CONTENT: FEED -->
        <div id="gd-view-feed" class="space-y-2 pb-8">
          <div class="space-y-2" id="gd-ledger-feed"></div>
        </div>

        <!-- TAB CONTENT: INSIGHTS -->
        <div id="gd-view-insights" class="space-y-4 pb-8 hidden animate-fade-in">
          
          <!-- Context Toggle -->
          <div class="flex p-1 space-x-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl mb-4">
            <button id="btn-scope-group" class="flex-1 py-1.5 text-xs font-bold rounded-lg bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white transition-all">Total Group</button>
            <button id="btn-scope-you" class="flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 transition-all">Your Share</button>
          </div>

          <!-- Pie Chart Breakdown -->
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
    
    // Tabs & Views
    this.$tabFeedBtn = this.container.querySelector('#gd-tab-feed');
    this.$tabInsightsBtn = this.container.querySelector('#gd-tab-insights');
    this.$viewFeed = this.container.querySelector('#gd-view-feed');
    this.$viewInsights = this.container.querySelector('#gd-view-insights');
    
    // Feed Elements
    this.$ledgerFeed = this.container.querySelector('#gd-ledger-feed');
    this.$btnInvite = this.container.querySelector('#gd-btn-invite');
    this.$inviteText = this.container.querySelector('#gd-invite-text');

    // Insight Elements
    this.$insightTotal = this.container.querySelector('#gd-insight-total');
    this.$insightYours = this.container.querySelector('#gd-insight-yours');
    this.$insightCategories = this.container.querySelector('#gd-insight-categories');
    this.$insightSettlements = this.container.querySelector('#gd-insight-settlements');
    this.$btnScopeGroup = this.container.querySelector('#btn-scope-group');
    this.$btnScopeYou = this.container.querySelector('#btn-scope-you');
    this.$pieCanvas = this.container.querySelector('#gd-pie-canvas');
    this.$categoryLegend = this.container.querySelector('#gd-category-legend');
    this.$insightTitle = this.container.querySelector('#gd-insight-title');
    this.insightScope = 'group';
  }

  attachListeners() {
    // 1. Tab Navigation
    const switchTab = (target) => {
      this.activeTab = target;
      
      // Update Button Styles
      const activeClass = ['border-accent-500', 'text-accent-600', 'dark:text-accent-400'];
      const inactiveClass = ['border-transparent', 'text-slate-400'];
      
      if (target === 'feed') {
        this.$tabFeedBtn.classList.add(...activeClass);
        this.$tabFeedBtn.classList.remove(...inactiveClass);
        this.$tabInsightsBtn.classList.add(...inactiveClass);
        this.$tabInsightsBtn.classList.remove(...activeClass);
        
        this.$viewFeed.classList.remove('hidden');
        this.$viewInsights.classList.add('hidden');
      } else {
        this.$tabInsightsBtn.classList.add(...activeClass);
        this.$tabInsightsBtn.classList.remove(...inactiveClass);
        this.$tabFeedBtn.classList.add(...inactiveClass);
        this.$tabFeedBtn.classList.remove(...activeClass);
        
        this.$viewInsights.classList.remove('hidden');
        this.$viewFeed.classList.add('hidden');
      }
    };

    this.$tabFeedBtn.addEventListener('click', () => switchTab('feed'));
    this.$tabInsightsBtn.addEventListener('click', () => switchTab('insights'));

    const setScope = (scope) => {
      this.insightScope = scope;
      if (scope === 'group') {
        this.$btnScopeGroup.classList.add('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
        this.$btnScopeGroup.classList.remove('text-slate-500');
        this.$btnScopeYou.classList.remove('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
        this.$btnScopeYou.classList.add('text-slate-500');
        this.$insightTitle.innerText = "Total Group Spend";
      } else {
        this.$btnScopeYou.classList.add('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
        this.$btnScopeYou.classList.remove('text-slate-500');
        this.$btnScopeGroup.classList.remove('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
        this.$btnScopeGroup.classList.add('text-slate-500');
        this.$insightTitle.innerText = "Your Personal Share";
      }
      this.updateUI(store.getState()); // Re-render charts
    };

    this.$btnScopeGroup.addEventListener('click', () => setScope('group'));
    this.$btnScopeYou.addEventListener('click', () => setScope('you'));

    // 2. Invite Link Generation
    this.$btnInvite.addEventListener('click', async () => {
      const state = store.getState();
      if (!state.activeGroupId) return;

      try {
        this.$inviteText.innerText = "Sharing...";
        this.$btnInvite.disabled = true;

        await LedgerService.enableLedgerPublicLinkSharing(state.activeGroupId);
        const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${state.activeGroupId}&name=${encodeURIComponent(state.activeGroupName)}`;
        
        await navigator.clipboard.writeText(inviteUrl);
        this.$inviteText.innerText = "Copied!";
      } catch (err) {
        alert(`Invite generation failed: ${err.message}`);
        this.$inviteText.innerText = "Error";
      } finally {
        setTimeout(() => { 
          this.$inviteText.innerText = "Invite"; 
          this.$btnInvite.disabled = false;
        }, 2000);
      }
    });

    // 3. Feed Item Click Delegation
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
  }

  getAvatar(email, profiles, sizeClass = "w-8 h-8") {
    const p = profiles[email];
    if (p && p.picture) {
      return `<img src="${p.picture}" alt="${p.name}" class="${sizeClass} rounded-full border-2 border-white dark:border-slate-800 object-cover shadow-sm">`;
    }
    const initial = p && p.name ? p.name.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
    return `<div class="${sizeClass} rounded-full bg-gradient-to-br from-accent-500 to-accent-600 border-2 border-white dark:border-slate-800 flex items-center justify-center text-white font-bold text-xs shadow-sm">${initial}</div>`;
  }

  updateUI(state) {
    if (!state.activeGroupId) return;

    this.$title.innerText = state.activeGroupName || 'Active Room';
    this.$id.innerText = `ID: ${state.activeGroupId}`;

    const computedLedger = computeLedgerState(state.groupEvents);
    const userEmail = state.userProfile?.email || '';

    // 1. Render Balances Grid
    this.$balancesGrid.innerHTML = '';
    Object.keys(computedLedger.members).forEach(member => {
      const data = computedLedger.members[member];
      const isPositive = data.netBalance >= 0;
      const textColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
      
      this.$balancesGrid.innerHTML += `
        <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-xl flex flex-col justify-between">
          <span class="text-[10px] text-slate-400 font-medium truncate">${member === userEmail ? 'You' : member}</span>
          <span class="text-sm font-black tracking-tight ${textColor} mt-1">${isPositive ? '+' : ''}${data.netBalance.toFixed(2)}</span>
        </div>`;
    });

    // 2. Render Roster Tags
    this.$rosterTags.innerHTML = '';
    Object.keys(computedLedger.members).forEach(memberEmail => {
      this.$rosterTags.innerHTML += `
        <span class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-mono text-[10px] px-2.5 py-1 rounded-md max-w-[160px] truncate">
          👤 ${memberEmail === userEmail ? 'You' : memberEmail.split('@')[0]}
        </span>`;
    });

    // 3. Render Transaction Feed
    if (computedLedger.expenses.length === 0) {
      this.$ledgerFeed.innerHTML = `<div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full"><p class="text-xs text-slate-400">No transactions recorded yet.</p></div>`;
      this.renderInsights([], userEmail,computedLedger.members, computedLedger.profiles);
      return;
    }

    this.$ledgerFeed.innerHTML = '';
    [...computedLedger.expenses].reverse().forEach(expense => {
      const payload = expense.rawPayload;
      let badgeColor = "bg-slate-100 dark:bg-slate-900 text-slate-500";
      let contextPersonalDebtString = "";

      if (expense.type === 'EXPENSE_ADD') {
        const allAllocations = payload.allocations || [];
        const userShareMeta = allAllocations.find(a => a.user === userEmail);
        const userOwesAmount = userShareMeta ? parseFloat(userShareMeta.value) || 0 : 0;

        if (expense.payer === userEmail) {
          const totalOwedToMe = expense.amount - userOwesAmount;
          contextPersonalDebtString = totalOwedToMe > 0 
            ? `<span class="text-emerald-600 dark:text-emerald-400 font-bold">You are owed INR ${totalOwedToMe.toFixed(2)}</span>`
            : `<span class="text-slate-400">You covered your exact share</span>`;
        } else {
          contextPersonalDebtString = userOwesAmount > 0
            ? `<span class="text-rose-600 dark:text-rose-400 font-bold">You owe INR ${userOwesAmount.toFixed(2)}</span>`
            : `<span class="text-slate-400">You aren't in this split</span>`;
        }
      } else if (expense.type === 'TRANSFER') {
        badgeColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
        if (expense.payer === userEmail) contextPersonalDebtString = `<span class="text-emerald-500 font-semibold">Sent payment</span>`;
        else if (expense.target === userEmail) contextPersonalDebtString = `<span class="text-emerald-500 font-semibold">Received payment</span>`;
        else contextPersonalDebtString = `<span class="text-slate-400">Peer settlement</span>`;
      } else if (expense.type === 'LOAN') {
        badgeColor = "bg-violet-500/10 text-violet-500 border border-violet-500/20";
        if (expense.payer === userEmail) contextPersonalDebtString = `<span class="text-emerald-600 font-bold">Lent asset</span>`;
        else if (expense.target === userEmail) contextPersonalDebtString = `<span class="text-rose-600 font-bold">Borrowed asset</span>`;
        else contextPersonalDebtString = `<span class="text-slate-400">Peer loan</span>`;
      }

      this.$ledgerFeed.innerHTML += `
        <div data-event-id="${expense.eventId}" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs cursor-pointer hover:border-accent-500/30 transition-colors">
          <div class="space-y-1 max-w-[65%]">
            <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${expense.title}</div>
            <div class="text-[10px] block font-medium">${contextPersonalDebtString}</div>
            <div class="flex items-center space-x-1.5 text-[9px] text-slate-400 pt-0.5">
              <span class="px-1.5 py-0.2 rounded font-bold text-[8px] uppercase tracking-wide ${badgeColor}">${expense.category || 'General'}</span>
              <span>&bull;</span>
              <span class="truncate">By: ${expense.payer === userEmail ? 'You' : expense.payer.split('@')[0]}</span>
            </div>
          </div>
          <div class="text-right space-y-0.5 font-mono shrink-0">
            <div class="font-black text-slate-900 dark:text-slate-100">INR ${expense.amount.toFixed(2)}</div>
            <div class="text-[9px] text-slate-400">${new Date(expense.timestamp).toLocaleDateString()}</div>
          </div>
        </div>`;
    });

    // 4. Render Group Insights Math
    this.renderInsights(computedLedger.expenses, userEmail, computedLedger.members, computedLedger.profiles);
  }

  renderInsights(expenses, userEmail, membersMap, profiles) {
    let totalGroupSpend = 0;
    let totalUserShare = 0;
    let categories = {};

    expenses.forEach(exp => {
      // We only analyze pure expenses, not balance transfers or loans
      if (exp.type === 'EXPENSE_ADD') {
        totalGroupSpend += exp.amount;
        
        const cat = exp.category || 'General';
        categories[cat] = (categories[cat] || 0) + exp.amount;

        const allAllocations = exp.rawPayload.allocations || [];
        const userAlloc = allAllocations.find(a => a.user === userEmail);
        if (userAlloc) {
          totalUserShare += (parseFloat(userAlloc.value) || 0);
        }
      }
    });

    // this.$insightTotal.innerText = totalGroupSpend.toFixed(2);
    // this.$insightYours.innerText = totalUserShare.toFixed(2);

    const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    const maxVal = sortedCategories.length > 0 ? sortedCategories[0][1] : 0;

    // this.$insightCategories.innerHTML = sortedCategories.length > 0
    //   ? sortedCategories.map(([cat, val]) => {
    //       const percentage = maxVal > 0 ? (val / maxVal) * 100 : 0;
    //       return `
    //         <div class="space-y-1">
    //           <div class="flex justify-between text-xs font-medium">
    //             <span class="text-slate-600 dark:text-slate-300 truncate pr-2">${cat}</span>
    //             <span class="font-mono text-slate-800 dark:text-slate-100">INR ${val.toFixed(2)}</span>
    //           </div>
    //           <div class="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden">
    //             <div class="bg-indigo-500 h-1.5 rounded-full transition-all duration-700" style="width: ${percentage}%"></div>
    //           </div>
    //         </div>`;
    //     }).join('')
    //   : '<p class="text-[10px] text-slate-400 text-center py-2">No category data available yet.</p>';

    // Render Optimized Debt Settlements
   const simplifiedDebts = optimizeDebts(membersMap);
    
    // Render the beautiful Avatar-based Settlement Cards
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
    const analytics = InsightsService.processAnalytics(expenses, targetEmail, 365); // Default to 1 year inside the group view
    
    setTimeout(() => CanvasCharts.drawPie(this.$pieCanvas, analytics.categories), 50);

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
    `).join('') : '<p class="text-[10px] text-slate-400">No data</p>';

  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}