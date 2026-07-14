// src/js/components/settings.js

export function mountSettingsComponent(containerElement, userEmailAddress, onSignOut) {
  containerElement.innerHTML = `
    <div class="space-y-4 animate-fade-in">
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-2xs space-y-4">
        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2">Visual Customization</h4>
        
        <div class="space-y-2">
          <label class="block text-xs text-slate-400 font-semibold">Active Design Palette Accent</label>
          <div class="flex space-x-2">
            ${['indigo', 'emerald', 'violet', 'amber', 'rose', 'slate'].map(color => `
              <button data-select-accent="${color}" class="w-6 h-6 rounded-full bg-${color === 'emerald' ? 'emerald' : color === 'rose' ? 'rose' : color}-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800"></button>
            `).join('')}
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">System Night Theme</label>
            <span class="text-[9px] text-slate-400 block">Toggle default dark layout frame options</span>
          </div>
          <button id="set-dark-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer">Toggle</button>
        </div>

        <div class="flex items-center justify-between pt-1">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">Pure OLED Contrast Override</label>
            <span class="text-[9px] text-slate-400 block">Forces pure deep pitch blacks (#000000)</span>
          </div>
          <button id="set-oled-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer">Enable</button>
        </div>
      </div>

      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-2xs space-y-3">
        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2">Cloud Node Credentials</h4>
        <div class="text-xs space-y-0.5">
          <div class="text-slate-400">Authenticated Node User:</div>
          <div class="font-mono font-bold text-slate-700 dark:text-slate-200 truncate">${userEmailAddress || 'Resolving profile...'}</div>
        </div>
        <button id="set-sign-out" class="mt-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 w-full text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer">
          Disconnect Workspace Tokens
        </button>
      </div>
    </div>
  `;

  // Bind internal behavior controls
  const toggleDark = () => document.documentElement.classList.toggle('dark');
  document.getElementById('set-dark-toggle').addEventListener('click', toggleDark);

  document.getElementById('set-oled-toggle').addEventListener('click', (e) => {
    const active = document.documentElement.classList.toggle('oled');
    e.target.innerText = active ? "Disable" : "Enable";
    localStorage.setItem('ss_cfg_oled', active ? 'true' : 'false');
  });

  document.getElementById('set-sign-out').addEventListener('click', onSignOut);

  // Sync design accent selections clicks
  containerElement.querySelectorAll('[data-select-accent]').forEach(button => {
    button.addEventListener('click', (e) => {
      const accent = e.target.getAttribute('data-select-accent');
      document.documentElement.setAttribute('data-accent', accent);
      localStorage.setItem('ss_active_accent', accent);
      containerElement.querySelectorAll('[data-select-accent]').forEach(btn => btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200'));
      e.target.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
    });
  });

  // Re-apply halo rings to match the current selection
  const currentAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  const activeBtn = containerElement.querySelector(`[data-select-accent="${currentAccent}"]`);
  if (activeBtn) activeBtn.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
}