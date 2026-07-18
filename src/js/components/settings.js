// src/js/components/Settings.js
import { store } from '../store.js';
import { AuthService } from '../auth.js';

export class Settings {
  constructor(containerElement) {
    this.container = containerElement;
    
    // Subscribe to store to display the active user's email
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.renderSkeleton();
    this.cacheDOM();
    this.attachListeners();
    this.applySavedTheme();
  }

  onStateChange(state) {
    // Only repaint if the settings view is currently visible
    if (state.currentView !== 'settings') return;

    if (state.userProfile?.email) {
      this.$userEmail.innerText = state.userProfile.email;
    }
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-4 animate-fade-in pb-8">
        <!-- Visual Customization Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-2xs space-y-4">
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2">Visual Customization</h4>
          
          <div class="space-y-2">
            <label class="block text-xs text-slate-400 font-semibold">Active Design Palette Accent</label>
            <div class="flex space-x-2" id="cfg-accent-container">
              ${['indigo', 'emerald', 'violet', 'amber', 'rose', 'slate'].map(color => `
                <button data-select-accent="${color}" class="w-6 h-6 rounded-full bg-${color === 'emerald' ? 'emerald' : color === 'rose' ? 'rose' : color}-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all"></button>
              `).join('')}
            </div>
          </div>

          <div class="flex items-center justify-between pt-1">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">System Night Theme</label>
              <span class="text-[9px] text-slate-400 block">Toggle default dark layout frame options</span>
            </div>
            <button id="cfg-dark-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600">Toggle</button>
          </div>

          <div class="flex items-center justify-between pt-1">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">Pure OLED Contrast Override</label>
              <span class="text-[9px] text-slate-400 block">Forces pure deep pitch blacks (#000000)</span>
            </div>
            <button id="cfg-oled-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600">Enable</button>
          </div>
        </div>

        <!-- Cloud Node Credentials Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-2xs space-y-3">
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2">Cloud Node Credentials</h4>
          <div class="text-xs space-y-0.5">
            <div class="text-slate-400">Authenticated Node User:</div>
            <div id="cfg-user-email" class="font-mono font-bold text-slate-700 dark:text-slate-200 truncate">Resolving profile...</div>
          </div>
          <button id="cfg-sign-out-btn" class="mt-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 w-full text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer">
            Disconnect Workspace Tokens
          </button>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$userEmail = this.container.querySelector('#cfg-user-email');
    this.$btnSignOut = this.container.querySelector('#cfg-sign-out-btn');
    this.$btnDarkToggle = this.container.querySelector('#cfg-dark-toggle');
    this.$btnOledToggle = this.container.querySelector('#cfg-oled-toggle');
    this.$accentContainer = this.container.querySelector('#cfg-accent-container');
    this.$accentButtons = this.container.querySelectorAll('[data-select-accent]');
  }

  attachListeners() {
    // 1. Dark Mode Toggle
    this.$btnDarkToggle.addEventListener('click', () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('ss_cfg_dark', isDark ? 'true' : 'false');
    });

    // 2. OLED Mode Toggle
    this.$btnOledToggle.addEventListener('click', (e) => {
      const isOled = document.documentElement.classList.toggle('oled');
      e.target.innerText = isOled ? "Disable" : "Enable";
      localStorage.setItem('ss_cfg_oled', isOled ? 'true' : 'false');
    });

    // 3. Accent Color Selection (Event Delegation)
    this.$accentContainer.addEventListener('click', (e) => {
      if (e.target.matches('[data-select-accent]')) {
        const accent = e.target.getAttribute('data-select-accent');
        
        // Update DOM attributes
        document.documentElement.setAttribute('data-accent', accent);
        localStorage.setItem('ss_active_accent', accent);
        
        // Update selection rings
        this.updateAccentRings(accent);
      }
    });

    // 4. Secure Sign Out Sequence
    this.$btnSignOut.addEventListener('click', () => {
      const confirmLogout = confirm("This will disconnect your node. Unsynced local changes will remain in cache until reconnected. Proceed?");
      if (confirmLogout) {
        AuthService.logout();
        store.clearWorkspace();
        // A hard reload is the safest way to flush all transient JS memory states
        // and force the application back to the Auth Gate.
        window.location.reload();
      }
    });
  }

  /**
   * Hydrates the UI with the user's saved preferences on initialization
   */
  applySavedTheme() {
    // Dark Mode (Defaulting to true if unset based on your original HTML)
    const savedDark = localStorage.getItem('ss_cfg_dark');
    if (savedDark === 'false') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
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
  }

  updateAccentRings(activeAccent) {
    this.$accentButtons.forEach(btn => {
      btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
      if (btn.getAttribute('data-select-accent') === activeAccent) {
        btn.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
      }
    });
  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}