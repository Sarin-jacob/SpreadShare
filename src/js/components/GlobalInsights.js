// src/js/components/GlobalInsights.js
import { store } from '../store.js';
import { InsightsService } from '../services/InsightsService.js';

export class GlobalInsights {
  constructor(containerElement) {
    this.container = containerElement;
    
    // Listen to route changes
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.renderSkeleton();
    this.cacheDOM();
  }

  async onStateChange(state) {
    // Only fetch and render if the user navigates to the insights view
    if (state.currentView !== 'insights') return;

    if (!state.userProfile?.email) return;

    this.showLoading();
    const insightsData = await InsightsService.generateUserInsights(state.userProfile.email);
    this.renderCharts(insightsData, state.directory);
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-4 animate-fade-in pb-12">
        <div class="flex items-center space-x-2">
          <button type="button" data-route="dashboard" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-bold">Global Expense Breakdown</h3>
        </div>

        <div id="insights-loading" class="text-center py-12 hidden">
          <span class="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin inline-block"></span>
          <p class="text-xs text-slate-400 mt-2 font-medium">Crunching ledger history...</p>
        </div>

        <div id="insights-content" class="space-y-4 hidden">
          <!-- Total Card -->
          <div class="bg-gradient-to-br from-accent-600 to-accent-500 text-white rounded-2xl p-5 shadow-sm">
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-accent-100">Total Personal Consumption</h4>
            <div id="insights-total" class="text-3xl font-black font-mono mt-1">INR 0.00</div>
          </div>

          <!-- Time Breakdown -->
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">Spending Velocity</h4>
            <div class="grid grid-cols-3 gap-2 text-center" id="insights-time-grid">
              <!-- Injected dynamically -->
            </div>
          </div>

          <!-- Category Breakdown -->
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">By Category</h4>
            <div id="insights-category-list" class="space-y-3">
               <!-- Injected dynamically -->
            </div>
          </div>

          <!-- Group Breakdown -->
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
            <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">By Group</h4>
            <div id="insights-group-list" class="space-y-3">
               <!-- Injected dynamically -->
            </div>
          </div>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$loading = this.container.querySelector('#insights-loading');
    this.$content = this.container.querySelector('#insights-content');
    this.$total = this.container.querySelector('#insights-total');
    this.$timeGrid = this.container.querySelector('#insights-time-grid');
    this.$categoryList = this.container.querySelector('#insights-category-list');
    this.$groupList = this.container.querySelector('#insights-group-list');
  }

  showLoading() {
    this.$content.classList.add('hidden');
    this.$loading.classList.remove('hidden');
  }

  renderCharts(insights, directoryArray) {
    this.$loading.classList.add('hidden');
    this.$content.classList.remove('hidden');

    // 1. Render Total
    this.$total.innerText = `INR ${insights.totalPersonalExpense.toFixed(2)}`;

    // 2. Render Time Matrix
    this.$timeGrid.innerHTML = `
      <div class="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
        <span class="block text-[9px] text-slate-400 uppercase font-bold tracking-wider">7 Days</span>
        <span class="block text-sm font-black text-slate-700 dark:text-slate-200 mt-1">${insights.byTime.lastWeek.toFixed(0)}</span>
      </div>
      <div class="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
        <span class="block text-[9px] text-slate-400 uppercase font-bold tracking-wider">30 Days</span>
        <span class="block text-sm font-black text-slate-700 dark:text-slate-200 mt-1">${insights.byTime.lastMonth.toFixed(0)}</span>
      </div>
      <div class="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
        <span class="block text-[9px] text-slate-400 uppercase font-bold tracking-wider">365 Days</span>
        <span class="block text-sm font-black text-slate-700 dark:text-slate-200 mt-1">${insights.byTime.lastYear.toFixed(0)}</span>
      </div>
    `;

    // Helper to generate CSS bar charts
    const createBarRow = (label, value, maxVal, colorClass) => {
      const percentage = maxVal > 0 ? (value / maxVal) * 100 : 0;
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs font-medium">
            <span class="text-slate-600 dark:text-slate-300 truncate pr-2">${label}</span>
            <span class="font-mono text-slate-800 dark:text-slate-100">INR ${value.toFixed(2)}</span>
          </div>
          <div class="w-full bg-slate-100 dark:bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div class="${colorClass} h-1.5 rounded-full transition-all duration-700" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    };

    // 3. Render Categories (Sorted by highest spend)
    const sortedCategories = Object.entries(insights.byCategory).sort((a, b) => b[1] - a[1]);
    const maxCategoryVal = sortedCategories.length > 0 ? sortedCategories[0][1] : 0;
    
    this.$categoryList.innerHTML = sortedCategories.length > 0 
      ? sortedCategories.map(([cat, val]) => createBarRow(cat, val, maxCategoryVal, 'bg-emerald-500')).join('')
      : '<p class="text-[10px] text-slate-400 text-center">No categorized spending found.</p>';

    // 4. Render Groups (Mapped to directory names)
    const sortedGroups = Object.entries(insights.byGroup).sort((a, b) => b[1] - a[1]);
    const maxGroupVal = sortedGroups.length > 0 ? sortedGroups[0][1] : 0;
    
    this.$groupList.innerHTML = sortedGroups.length > 0
      ? sortedGroups.map(([id, val]) => {
          // Resolve group name from the active directory
          const groupMeta = directoryArray.find(g => g.id === id);
          const groupName = groupMeta ? groupMeta.name : 'Unknown Room';
          return createBarRow(groupName, val, maxGroupVal, 'bg-indigo-500');
        }).join('')
      : '<p class="text-[10px] text-slate-400 text-center">No group spending found.</p>';
  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}