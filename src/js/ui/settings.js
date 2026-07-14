// src/js/ui/settings.js

/**
 * Restores visual customization design tokens upon initial shell load
 */
export function initSettingsUI() {
  // 1. Recover pitch black configuration parameters from localStorage override tags
  if (localStorage.getItem('ss_cfg_oled') === 'true') {
    document.documentElement.classList.add('oled');
    const oledBtn = document.getElementById('cfg-oled-toggle');
    if (oledBtn) oledBtn.innerText = "Disable";
  }

  // 2. Synchronize active accent button ring halos
  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);
  document.querySelectorAll(`[data-select-accent="${savedAccent}"]`).forEach(btn => {
    btn.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
  });
}

/**
 * Repaints authenticated identity string nodes inside profile panels
 * @param {string} email 
 */
export function updateProfileEmailDisplay(email) {
  const emailDisplay = document.getElementById('cfg-user-email');
  if (emailDisplay) emailDisplay.innerText = email;
}