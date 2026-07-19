// src/js/components/GlobalInsights.js
import { store } from '../store.js';
import { InsightsService } from '../services/InsightsService.js';
import { CanvasCharts } from '../utils/charts.js';

export class GlobalInsights {
  constructor(containerElement) {
    this.container = containerElement;
    this.activeTimeframe = 30; // Default to 30 days
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.renderSkeleton();
    this.cacheDOM();
    this.attachListeners();
  }

  async onStateChange(state) {
    if (state.currentView !== 'insights') return;
    if (!state.userProfile?.email) return;

    const data = await InsightsService.getGlobalAnalytics(state.userProfile.email, this.activeTimeframe);
    this.renderData(data);
  }

  async loadData() {
    const email = store.getState().userProfile?.email;
    if (email) {
      const data = await InsightsService.getGlobalAnalytics(email, this.activeTimeframe);
      this.renderData(data);
    }
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-4 animate-fade-in pb-12">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <button type="button" data-route="dashboard" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </button>
            <h3 class="text-sm font-bold">Personal Analytics</h3>
          </div>
        </div>

        <!-- TIMEFRAME TABS -->
        <div class="flex p-1 space-x-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
          <button data-days="7" class="time-tab flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 transition-all cursor-pointer">7 Days</button>
          <button data-days="30" class="time-tab flex-1 py-1.5 text-xs font-bold rounded-lg bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white transition-all cursor-pointer">30 Days</button>
          <button data-days="365" class="time-tab flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 transition-all cursor-pointer">1 Year</button>
        </div>

        <!-- TOTAL SPEND HERO & TRENDLINE -->
        <div class="bg-gradient-to-br from-indigo-900 to-slate-900 border border-slate-800 text-white rounded-2xl p-5 shadow-sm overflow-hidden relative">
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-indigo-300 relative z-10">Total Consumption</h4>
          <div id="gi-total" class="text-3xl font-black font-mono mt-1 relative z-10">INR 0.00</div>
          
          <div class="h-20 w-full mt-4 -mb-5 -mx-2 relative z-0">
             <canvas id="gi-trend-canvas"></canvas>
          </div>
        </div>

        <!-- CATEGORY PIE CHART -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">By Category</h4>
          <div class="flex items-center space-x-4">
            <div class="w-32 h-32 relative shrink-0"><canvas id="gi-pie-canvas"></canvas></div>
            <div id="gi-category-legend" class="flex-grow space-y-2 max-h-32 overflow-y-auto pr-1"></div>
          </div>
        </div>

        <!-- DAY OF WEEK AVERAGES -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">Weekly Velocity</h4>
          <div id="gi-day-bars" class="space-y-2"></div>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$timeTabs = this.container.querySelectorAll('.time-tab');
    this.$total = this.container.querySelector('#gi-total');
    this.$trendCanvas = this.container.querySelector('#gi-trend-canvas');
    this.$pieCanvas = this.container.querySelector('#gi-pie-canvas');
    this.$categoryLegend = this.container.querySelector('#gi-category-legend');
    this.$dayBars = this.container.querySelector('#gi-day-bars');
  }

  attachListeners() {
    this.$timeTabs.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.activeTimeframe = parseInt(e.target.getAttribute('data-days'), 10);
        
        this.$timeTabs.forEach(b => {
          b.classList.remove('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
          b.classList.add('text-slate-500');
        });
        
        e.target.classList.add('bg-white', 'text-slate-800', 'dark:bg-slate-700', 'dark:text-white', 'shadow-xs');
        e.target.classList.remove('text-slate-500');

        this.loadData();
      });
    });
  }

  renderData(data) {
    this.$total.innerText = `INR ${data.total.toFixed(2)}`;

    // Render Canvas Charts safely
    setTimeout(() => {
      CanvasCharts.drawTrendLine(this.$trendCanvas, data.trendLine);
      CanvasCharts.drawPie(this.$pieCanvas, data.categories);
    }, 100);

    // Render Category Legend
    const colors = CanvasCharts.getColors();
    const sortedCats = Object.entries(data.categories).sort((a, b) => b[1] - a[1]);
    
    this.$categoryLegend.innerHTML = sortedCats.length > 0 ? sortedCats.map(([cat, val], i) => `
      <div class="flex justify-between items-center text-[10px] font-medium">
        <div class="flex items-center space-x-1.5 truncate pr-2">
          <span class="w-2.5 h-2.5 rounded-full block shrink-0" style="background-color: ${colors[i % colors.length]}"></span>
          <span class="text-slate-600 dark:text-slate-300 truncate">${cat}</span>
        </div>
        <span class="font-mono text-slate-800 dark:text-slate-200">INR ${val.toFixed(0)}</span>
      </div>
    `).join('') : '<p class="text-[10px] text-slate-400">No category data found.</p>';

    // Render Day Averages Bars
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const maxDay = Math.max(...Object.values(data.dayOfWeek), 1);
    
    this.$dayBars.innerHTML = days.map(day => {
      const val = data.dayOfWeek[day] || 0;
      const pct = (val / maxDay) * 100;
      return `
        <div class="flex items-center space-x-2 text-xs">
          <span class="w-8 font-bold text-slate-400 shrink-0">${day}</span>
          <div class="flex-grow bg-slate-100 dark:bg-slate-900 h-2.5 rounded-full overflow-hidden">
            <div class="h-2.5 bg-accent-500 rounded-full transition-all duration-700" style="width: ${pct}%"></div>
          </div>
          <span class="w-14 text-right font-mono font-bold text-slate-600 dark:text-slate-300">INR ${val.toFixed(0)}</span>
        </div>
      `;
    }).join('');
  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}