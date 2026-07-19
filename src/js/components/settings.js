// src/js/components/Settings.js
import { store } from '../store.js';
import { AuthService } from '../auth.js';
import { AppRouter } from '../router.js';
import { Toast } from '../utils/toast.js';

export class Settings {
  constructor(containerElement) {
    this.container = containerElement;
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.renderSkeleton();
    this.cacheDOM();
    this.attachListeners();
    this.applySavedTheme();
  }

  onStateChange(state) {
    if (state.currentView !== 'settings') return;
    this.updateUI(state);
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-6 animate-fade-in pb-12 max-w-lg mx-auto">
        <div class="flex items-center space-x-2 mb-2">
          <button type="button" data-route="dashboard" class="text-slate-400 hover:text-slate-800 dark:hover:text-white p-2 -ml-2 rounded-full transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-black tracking-tight">Application Settings</h3>
        </div>

        <!-- User Profile Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 rounded-3xl shadow-sm flex items-center space-x-4">
          <img id="set-avatar" src="" class="w-14 h-14 rounded-full border-2 border-slate-100 dark:border-slate-700 object-cover shadow-sm hidden">
          <div id="set-avatar-fallback" class="w-14 h-14 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-xl shadow-sm"></div>
          <div>
            <h2 id="set-name" class="text-lg font-black text-slate-800 dark:text-slate-100">Loading...</h2>
            <p id="set-email" class="text-xs font-medium text-slate-500"></p>
          </div>
        </div>

        <!-- Appearance & Theme Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
          
          <!-- Accent Colors -->
          <div class="p-4 border-b border-slate-100 dark:border-slate-700/60">
            <h4 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-3">Active Design Palette Accent</h4>
            <div class="grid grid-cols-6 gap-3" id="cfg-accent-container">
              <button data-select-accent="indigo" class="w-6 h-6 rounded-full bg-indigo-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="blue" class="w-6 h-6 rounded-full bg-blue-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="cyan" class="w-6 h-6 rounded-full bg-cyan-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="teal" class="w-6 h-6 rounded-full bg-teal-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="emerald" class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="amber" class="w-6 h-6 rounded-full bg-amber-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              
              <button data-select-accent="orange" class="w-6 h-6 rounded-full bg-orange-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="rose" class="w-6 h-6 rounded-full bg-rose-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="pink" class="w-6 h-6 rounded-full bg-pink-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="fuchsia" class="w-6 h-6 rounded-full bg-fuchsia-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="violet" class="w-6 h-6 rounded-full bg-violet-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="slate" class="w-6 h-6 rounded-full bg-slate-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
            </div>
          </div>

          <!-- Dark Mode -->
          <div class="p-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">System Night Theme</label>
              <span class="text-[10px] text-slate-400 block">Toggle default dark layout frame</span>
            </div>
            <button id="cfg-dark-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600 shadow-sm active:scale-95">Toggle</button>
          </div>

          <!-- OLED Mode -->
          <div class="p-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">Pure OLED Contrast</label>
              <span class="text-[10px] text-slate-400 block">Forces pure deep pitch blacks (#000000)</span>
            </div>
            <button id="cfg-oled-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600 shadow-sm active:scale-95">Enable</button>
          </div>

          <!-- UI Scale -->
          <div class="p-4 flex justify-between items-center">
            <div>
              <h4 class="text-xs font-bold text-slate-700 dark:text-slate-200">Interface Scaling</h4>
              <p class="text-[10px] text-slate-400">Adjust the overall text and UI size.</p>
            </div>
            <select id="set-ui-scale" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent-500/30 cursor-pointer shadow-sm">
              <option value="14px">Small</option>
              <option value="16px">Normal Default</option>
              <option value="18px">Large</option>
              <option value="20px">Extra Large</option>
            </select>
          </div>
        </div>

        <!-- Data & Export -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
          <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors" id="btn-export-csv">
            <div>
              <h4 class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-2">
                 <span>Export Data (CSV)</span>
                 <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 text-[8px] uppercase tracking-wider font-bold">Local</span>
              </h4>
              <p class="text-[10px] text-slate-400">Download the active group's raw ledger.</p>
            </div>
            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          </div>
        </div>

        <!-- Serverless Info -->
        <div class="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 p-4 rounded-3xl">
          <h4 class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Serverless Architecture</h4>
          <p class="text-xs text-indigo-800/70 dark:text-indigo-300/70 leading-relaxed font-medium mb-3">
            SpreadShare uses a 100% serverless PWA architecture. Your data is never routed through our servers, it goes directly from this device into your personal Google Drive and Sheets APIs.
          </p>
          <p class="text-[10px] font-mono text-indigo-500 font-bold">Security Layer: Direct OAuth 2.0</p>
        </div>

        <button id="set-btn-logout" class="w-full bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-500 hover:text-white border border-rose-200 dark:border-rose-800/50 text-rose-600 font-black py-4 rounded-2xl text-sm transition-all cursor-pointer shadow-sm tracking-wide uppercase active:scale-[0.98]">
          Sign Out & Disconnect
        </button>
      </div>
    `;
  }

  cacheDOM() {
    this.$avatar = this.container.querySelector('#set-avatar');
    this.$avatarFallback = this.container.querySelector('#set-avatar-fallback');
    this.$name = this.container.querySelector('#set-name');
    this.$email = this.container.querySelector('#set-email');
    
    // Appearance Elements
    this.$btnDarkToggle = this.container.querySelector('#cfg-dark-toggle');
    this.$btnOledToggle = this.container.querySelector('#cfg-oled-toggle');
    this.$accentContainer = this.container.querySelector('#cfg-accent-container');
    this.$accentButtons = this.container.querySelectorAll('[data-select-accent]');
    this.$uiScale = this.container.querySelector('#set-ui-scale');
    
    // Data & Actions
    this.$btnExport = this.container.querySelector('#btn-export-csv');
    this.$btnLogout = this.container.querySelector('#set-btn-logout');
  }

  attachListeners() {
    // 1. Dark Mode Toggle
    this.$btnDarkToggle.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('ss_cfg_dark', isDark ? 'true' : 'false');
      Toast.show(isDark ? 'Dark Mode Enabled' : 'Light Mode Enabled', 'info');
    });

    // 2. OLED Mode Toggle
    this.$btnOledToggle.addEventListener('click', (e) => {
      const isOled = document.documentElement.classList.toggle('oled');
      e.target.innerText = isOled ? "Disable" : "Enable";
      localStorage.setItem('ss_cfg_oled', isOled ? 'true' : 'false');
      if (isOled) Toast.show('OLED Pitch Black Enabled', 'info');
    });

    // 3. Accent Color Selection
    this.$accentContainer.addEventListener('click', (e) => {
      if (e.target.matches('[data-select-accent]')) {
        const accent = e.target.getAttribute('data-select-accent');
        document.documentElement.setAttribute('data-accent', accent);
        localStorage.setItem('ss_active_accent', accent);
        this.updateAccentRings(accent);
      }
    });

    // 4. UI Scaling
    this.$uiScale.addEventListener('change', (e) => {
      const scale = e.target.value;
      localStorage.setItem('ss_ui_scale', scale);
      document.documentElement.style.fontSize = scale;
      Toast.show('Interface scale updated', 'info');
    });

    // 5. CSV Export
    this.$btnExport.addEventListener('click', () => this.exportToCSV());

    // 6. Logout
    this.$btnLogout.addEventListener('click', () => {
      const confirmOut = confirm("Sign out of SpreadShare? Your data remains safe in Google Drive.");
      if (confirmOut) {
        AuthService.logout();
        store.clearWorkspace();
        window.location.reload(); // Force full memory flush
      }
    });
  }

  /**
   * Hydrates the UI with the user's saved preferences on initialization
   */
  applySavedTheme() {
    // Dark Mode
    const savedDark = localStorage.getItem('ss_cfg_dark');
    if (savedDark === 'false') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark'); // Default True
    }

    // OLED Mode
    const savedOled = localStorage.getItem('ss_cfg_oled');
    if (savedOled === 'true') {
      document.documentElement.classList.add('oled');
      this.$btnOledToggle.innerText = "Disable";
    }

    // Accent Color
    const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
    document.documentElement.setAttribute('data-accent', savedAccent);
    this.updateAccentRings(savedAccent);

    // UI Scale
    const savedScale = localStorage.getItem('ss_ui_scale') || '16px';
    document.documentElement.style.fontSize = savedScale;
    this.$uiScale.value = savedScale;
  }

  updateAccentRings(activeAccent) {
    this.$accentButtons.forEach(btn => {
      btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
      if (btn.getAttribute('data-select-accent') === activeAccent) {
        btn.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
      }
    });
  }

  updateUI(state) {
    if (!state.userProfile) return;
    const profile = state.userProfile;
    
    this.$name.innerText = profile.name || profile.email.split('@')[0];
    this.$email.innerText = profile.email;

    if (profile.picture) {
      this.$avatar.src = profile.picture;
      this.$avatar.classList.remove('hidden');
      this.$avatarFallback.classList.add('hidden');
    } else {
      this.$avatar.classList.add('hidden');
      this.$avatarFallback.classList.remove('hidden');
      this.$avatarFallback.innerText = profile.email.charAt(0).toUpperCase();
    }
  }

  exportToCSV() {
    const state = store.getState();
    const events = state.groupEvents;
    
    if (events.length === 0) {
      return Toast.show('No data to export.', 'error');
    }

    let csv = "Date,Type,Title,Amount,Currency,Paid By\n";
    
    [...events].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(e => {
      const p = e.payload_json || {};
      const date = new Date(p.custom_timestamp || e.timestamp).toLocaleDateString();
      const type = e.event_type;
      const title = `"${(p.title || '').replace(/"/g, '""')}"`;
      const amount = p.evaluated_amount || 0;
      const currency = p.currency || 'INR';
      const actor = e.actor_identity;
      
      csv += `${date},${type},${title},${amount},${currency},${actor}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SpreadShare_Ledger_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    
    Toast.show('CSV Download Started!', 'success');
  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}