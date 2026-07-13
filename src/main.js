// src/main.js
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue } from './js/sync.js';
import { reconstructState } from './js/engine.js';

// Application Core Context Memory Structures
let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";
let userJoinedGroupsIndex = [];
let currentCalcString = "0";

// DOM View Mapping Registry Matrix
const views = {
  'dashboard': document.getElementById('view-dashboard'),
  'group-detail': document.getElementById('view-group-detail'),
  'add-expense': document.getElementById('view-add-expense'),
  'transfer': document.getElementById('view-transfer'),
  'settings': document.getElementById('view-settings')
};

/**
 * ─── CENTRALIZED SPA ROUTING ENGINE ───
 */
function navigateToView(targetViewKey) {
  if (!views[targetViewKey]) return;
  
  // Toggle Visibility Classes
  Object.keys(views).forEach(key => views[key].classList.add('hidden'));
  views[targetViewKey].classList.remove('hidden');
  
  // Manage Nav Weights across Mobile + Desktop bars simultaneously
  document.querySelectorAll('[data-route]').forEach(btn => {
    if (btn.getAttribute('data-route') === targetViewKey) {
      btn.classList.add('text-accent-600', 'dark:text-accent-400', 'font-bold');
      btn.classList.remove('text-slate-400', 'dark:text-slate-500');
    } else {
      btn.classList.remove('text-accent-600', 'dark:text-accent-400', 'font-bold');
      btn.classList.add('text-slate-400', 'dark:text-slate-500');
    }
  });
}

// Bind routing triggers to dataset click actions
document.querySelectorAll('[data-route]').forEach(trigger => {
  trigger.addEventListener('click', (e) => {
    const route = e.currentTarget.getAttribute('data-route');
    navigateToView(route);
  });
});

/**
 * ─── LEDGER STATE RECONSTRUCTION & DOM PAINT REPLAY ───
 */
function repaintDOMState() {
  const state = reconstructState(currentGroupEvents);
  
  // 1. Render Balance Grid
  const summaryGrid = document.getElementById('balance-summary-grid');
  if (summaryGrid) {
    summaryGrid.innerHTML = '';
    Object.keys(state.members).forEach(member => {
      const data = state.members[member];
      const isPositive = data.netBalance >= 0;
      const textColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
      
      summaryGrid.innerHTML += `
        <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-xl flex flex-col justify-between">
          <span class="text-[10px] text-slate-400 tracking-wide font-medium truncate">${member === userEmailAddress ? 'You (Owner)' : member}</span>
          <span class="text-sm font-black tracking-tight ${textColor} mt-1">${isPositive ? '+' : ''}${data.netBalance.toFixed(2)}</span>
        </div>
      `;
    });
  }

  // 2. Render Live Expenditure Stream Feed
  const feed = document.getElementById('group-ledger-feed');
  if (feed) {
    feed.innerHTML = '';
    if (state.expenses.length === 0) {
      feed.innerHTML = `
        <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p class="text-xs text-slate-400 font-medium">No transactions found. Tap 'Add Cost' to build this log ledger.</p>
        </div>`;
    } else {
      [...state.expenses].reverse().forEach(exp => {
        // Safe check for dynamic category tags if preserved in metadata channels
        const category = exp.category || 'General';
        feed.innerHTML += `
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div class="space-y-1 max-w-[70%]">
              <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${exp.title}</div>
              <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-medium">
                <span class="truncate">By: ${exp.payer === userEmailAddress ? 'You' : exp.payer}</span>
                <span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                <span class="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded font-semibold text-[9px]">${category}</span>
              </div>
            </div>
            <div class="text-right space-y-0.5">
              <div class="font-mono font-black text-slate-900 dark:text-slate-100">INR ${exp.amount.toFixed(2)}</div>
              <div class="text-[9px] text-slate-400">${new Date(exp.timestamp).toLocaleDateString()}</div>
            </div>
          </div>
        `;
      });
    }
  }
}

/**
 * ─── INTERACTIVE HARDWARE CALCULATOR PAD MATRIX ───
 */
document.querySelectorAll('.calc-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const val = e.currentTarget.getAttribute('data-val');
    const exprDisplay = document.getElementById('calc-display-expression');
    const valDisplay = document.getElementById('calc-display-value');

    if (val === 'C') {
      currentCalcString = "0";
      valDisplay.innerText = "0";
    } else if (val === 'DEL') {
      currentCalcString = currentCalcString.slice(0, -1);
      if (currentCalcString === "" || currentCalcString === "-") currentCalcString = "0";
    } else {
      if (currentCalcString === "0" && !['+', '-', '*', '/'].includes(val)) {
        currentCalcString = val;
      } else {
        currentCalcString += val;
      }
    }

    exprDisplay.innerText = currentCalcString;

    try {
      const sanitized = currentCalcString.replace(/[^0-9+\-*/().\s]/g, '');
      const evaluator = new Function(`return (${sanitized || '0'})`);
      const result = evaluator();
      valDisplay.innerText = Number.isFinite(result) ? result.toFixed(2) : "0.00";
    } catch (err) {
      // Allow partial math expression formulas to evaluate natively during execution runs
    }
  });
});

/**
 * ─── CLOUD SHADOW MUTATIONS & QUEUE CONTROL WORKERS ───
 */
function triggerBackgroundSyncLoop() {
  processOfflineQueue((isSyncing) => {
    const indicator = document.getElementById('sync-indicator');
    if (indicator) {
      if (isSyncing) {
        indicator.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span class="text-amber-500 font-bold">Syncing Ledger...</span>`;
      } else {
        indicator.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span class="text-slate-500 dark:text-slate-400">Cloud Mirror Live</span>`;
      }
    }
  });
}

/**
 * ─── RE-LINK SYSTEM BOOTSTRAPPING FLOWS ───
 */
function handleAppLaunchSequence(token, profile) {
  userEmailAddress = profile.email;
  
  const cfgEmail = document.getElementById('cfg-user-email');
  if (cfgEmail) cfgEmail.innerText = userEmailAddress;

  // Restore previous storage layout tokens if mapped inside local frameworks
  activeSpreadsheetId = localStorage.getItem('ss_active_sheet_id');
  
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('main-stage').classList.remove('hidden');
  
  // Direct client interface route down to the primary directory deck
  navigateToView('dashboard');
  repaintDOMState();
  
  // Spin up persistent interval task execution runs (10-second cycles)
  setInterval(triggerBackgroundSyncLoop, 10000);
}

// System Customization Configuration Elements Toggles
document.getElementById('cfg-dark-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
});

document.getElementById('cfg-oled-toggle').addEventListener('click', (e) => {
  const isOled = document.documentElement.classList.toggle('oled');
  e.target.innerText = isOled ? "Disable" : "Enable";
  localStorage.setItem('ss_cfg_oled', isOled ? 'true' : 'false');
});

document.getElementById('sign-out-btn').addEventListener('click', () => {
  clearSessionContext();
  window.location.reload();
});

// Bind Palette Theme Buttons
document.querySelectorAll('[data-select-accent]').forEach(button => {
  button.addEventListener('click', (e) => {
    const accent = e.target.getAttribute('data-select-accent');
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('ss_active_accent', accent);
    
    document.querySelectorAll('[data-select-accent]').forEach(btn => btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200'));
    e.target.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
  });
});

// Setup group item list click mock router handler
document.getElementById('groups-directory-list').addEventListener('click', () => {
  navigateToView('group-detail');
});

// Document Core Bootstrapping Entry Hook
window.addEventListener('DOMContentLoaded', async () => {
  await openDatabase();

  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);
  document.querySelectorAll(`[data-select-accent="${savedAccent}"]`).forEach(btn => {
    btn.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
  });

  if (localStorage.getItem('ss_cfg_oled') === 'true') {
    document.documentElement.classList.add('oled');
    const oledToggle = document.getElementById('cfg-oled-toggle');
    if (oledToggle) oledToggle.innerText = "Disable";
  }

  // Bind full live OAuth triggers securely
  await initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => {
    handleAppLaunchSequence(token, profile);
  });

  await checkExistingSession((token, profile) => {
    handleAppLaunchSequence(token, profile);
  });
});