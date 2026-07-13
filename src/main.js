// src/main.js
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue, fetchLedgerDelta } from './js/sync.js';
import { reconstructState } from './js/engine.js';

// Application Runtime Memory State
let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";
let currentCalcString = "0";

// DOM View Component Mappings
const views = {
  'dashboard': document.getElementById('view-dashboard'),
  'group-detail': document.getElementById('view-group-detail'),
  'add-expense': document.getElementById('view-add-expense'),
  'transfer': document.getElementById('view-transfer'),
  'settings': document.getElementById('view-settings')
};

/**
 * ─── SINGLE PAGE APPLICATION ROUTER ───
 */
function navigateToView(targetViewKey) {
  if (!views[targetViewKey]) return;
  
  // Hide all sections, reveal the target view
  Object.keys(views).forEach(key => views[key].classList.add('hidden'));
  views[targetViewKey].classList.remove('hidden');
  
  // Update active navigation button styles across mobile and desktop menus
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

/**
 * ─── ACTIVE GROUP LOADER & DELTA REPLICATION ENGINE ───
 */
async function loadGroupWorkspaceContext(spreadsheetId, groupName) {
  activeSpreadsheetId = spreadsheetId;
  localStorage.setItem('ss_active_sheet_id', spreadsheetId);
  
  document.getElementById('active-group-title').innerText = groupName;
  document.getElementById('active-sheet-id').innerText = `ID: ${spreadsheetId}`;
  
  // 1. Pull from local IndexedDB cache for instant render
  const db = await openDatabase();
  const tx = db.transaction('group_events_cache', 'readonly');
  const store = tx.objectStore('group_events_cache');
  
  const request = store.getAll();
  request.onsuccess = async (e) => {
    const allEvents = e.target.result || [];
    currentGroupEvents = allEvents.filter(evt => evt.spreadsheetId === spreadsheetId);
    
    repaintDOMState();
    navigateToView('group-detail');
    
    // 2. Fetch remote modifications using the delta sync worker
    const lastKnownRowIndex = currentGroupEvents.length;
    
    try {
      syncStatusIndicatorState('syncing');
      const newRows = await fetchLedgerDelta(spreadsheetId, lastKnownRowIndex);
      
      if (newRows.length > 0) {
        const writeTx = db.transaction('group_events_cache', 'readwrite');
        const writeStore = writeTx.objectStore('group_events_cache');
        
        for (const row of newRows) {
          const parsedEvent = {
            spreadsheetId: spreadsheetId,
            timestamp: row[0],
            eventId: row[1],
            event_type: row[2],
            actor_identity: row[3],
            payload_json: JSON.parse(row[4])
          };
          
          currentGroupEvents.push(parsedEvent);
          await writeStore.put(parsedEvent);
        }
        repaintDOMState();
      }
    } catch (err) {
      console.warn("Delta update loop deferred offline:", err);
    } finally {
      syncStatusIndicatorState('synced');
    }
  };
}

/**
 * ─── LEDGER STATE REPLAY & REPAINT CHASSIS ───
 */
function repaintDOMState() {
  const state = reconstructState(currentGroupEvents);
  
  // 1. Render Balances Matrix
  const summaryGrid = document.getElementById('balance-summary-grid');
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

  // 2. Render Transaction Feed
  const feed = document.getElementById('group-ledger-feed');
  feed.innerHTML = '';
  
  if (state.expenses.length === 0) {
    feed.innerHTML = `
      <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full">
        <p class="text-xs text-slate-400 font-medium">No transactions found. Tap 'Log Expense' to seed entries.</p>
      </div>`;
  } else {
    [...state.expenses].reverse().forEach(exp => {
      const payload = currentGroupEvents.find(e => e.eventId === exp.eventId)?.payload_json || {};
      const assignedCategory = payload.category || 'General';
      
      feed.innerHTML += `
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs">
          <div class="space-y-1 max-w-[70%]">
            <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${exp.title}</div>
            <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-medium">
              <span class="truncate">By: ${exp.payer === userEmailAddress ? 'You' : exp.payer}</span>
              <span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
              <span class="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded font-semibold text-[9px]">${assignedCategory}</span>
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

/**
 * ─── DYNAMIC CORE EVENT LISTENERS SYSTEM ───
 */
function bindApplicationInteractionTriggers() {
  
  // 1. Google Identity Connection Hooks
  document.getElementById('auth-btn').addEventListener('click', requestAuthenticationData);
  
  // 2. Navigation Dataset Router Links
  document.querySelectorAll('[data-route]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      navigateToView(e.currentTarget.getAttribute('data-route'));
    });
  });

  // 3. Calculator Input Buttons Matrix
  document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.currentTarget.getAttribute('data-val');
      const exprDisplay = document.getElementById('calc-display-expression');
      const valDisplay = document.getElementById('calc-display-value');

      if (val === 'C') {
        currentCalcString = "0";
        valDisplay.innerText = "0.00";
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
      } catch (err) { /* Allow math expressions to evaluate mid-composition */ }
    });
  });

  // 4. Transaction Entry Submission Form Hook
  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeSpreadsheetId) return alert("Halted: No workspace assigned.");

    const title = document.getElementById('exp-title').value;
    const category = document.getElementById('exp-category').value;
    const valDisplay = document.getElementById('calc-display-value').innerText;
    
    const computedTotal = parseFloat(valDisplay) || 0;
    if (computedTotal <= 0) return alert("Value must evaluate above 0.00");

    try {
      const uuid = crypto.randomUUID();
      const isoString = new Date().toISOString();
      const groupMembers = [userEmailAddress, 'partner.testing@niser.ac.in'];
      const proportionalShare = computedTotal / groupMembers.length;

      const eventPayload = {
        title: title,
        category: category,
        raw_amount_string: currentCalcString,
        evaluated_amount: computedTotal,
        currency: 'INR',
        split_strategy: 'EQUALLY',
        allocations: groupMembers.map(email => ({ user: email, share_type: 'EXACT', value: proportionalShare }))
      };

      const transactionRecord = {
        spreadsheetId: activeSpreadsheetId,
        eventId: uuid,
        timestamp: isoString,
        event_type: 'EXPENSE_ADD',
        actor_identity: userEmailAddress,
        payload_json: eventPayload
      };

      // Optimistic cache update
      currentGroupEvents.push(transactionRecord);
      await writeToStore('group_events_cache', transactionRecord);
      await writeToStore('offline_sync_queue', {
        action: 'APPEND_ROW',
        spreadsheetId: activeSpreadsheetId,
        payload: transactionRecord
      });

      repaintDOMState();
      document.getElementById('expense-form').reset();
      currentCalcString = "0";
      document.getElementById('calc-display-expression').innerText = "0";
      document.getElementById('calc-display-value').innerText = "0.00";
      
      navigateToView('group-detail');
      triggerBackgroundSyncLoop();
    } catch (err) {
      alert(`Entry execution error: ${err.message}`);
    }
  });

  // 5. Workspace Registry Generation Handler
  document.getElementById('create-group-btn').addEventListener('click', async () => {
    const btn = document.getElementById('create-group-btn');
    try {
      btn.disabled = true;
      btn.innerText = "Configuring Cloud Ledger...";
      
      const folderId = await getOrCreateRootFolder();
      const groupName = `Production Room (${new Date().toLocaleDateString()})`;
      const sheetId = await createGroupSpreadsheet(groupName, folderId);
      
      await loadGroupWorkspaceContext(sheetId, groupName);
      alert("Success! Spreadsheet spawned inside your Drive.");
    } catch (err) {
      alert(`Google API Provision Failure: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerText = "New Group";
    }
  });

  // 6. Dynamic Design Accent Selectors
  document.querySelectorAll('[data-select-accent]').forEach(button => {
    button.addEventListener('click', (e) => {
      const accent = e.target.getAttribute('data-select-accent');
      document.documentElement.setAttribute('data-accent', accent);
      localStorage.setItem('ss_active_accent', accent);
      document.querySelectorAll('[data-select-accent]').forEach(btn => btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200'));
      e.target.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
    });
  });

  // 7. Theme Framework Configuration Selectors
  const toggleDarkMode = () => document.documentElement.classList.toggle('dark');
  document.getElementById('cfg-dark-toggle').addEventListener('click', toggleDarkMode);

  document.getElementById('cfg-oled-toggle').addEventListener('click', (e) => {
    const isOled = document.documentElement.classList.toggle('oled');
    e.target.innerText = isOled ? "Disable" : "Enable";
    localStorage.setItem('ss_cfg_oled', isOled ? 'true' : 'false');
  });

  document.getElementById('sign-out-btn').addEventListener('click', () => {
    clearSessionContext();
    window.location.reload();
  });

  // 8. Open Group Action Route Link
  document.getElementById('groups-directory-list').addEventListener('click', () => {
    const mockSheetId = localStorage.getItem('ss_active_sheet_id') || "sandbox_fallback_token_id";
    loadGroupWorkspaceContext(mockSheetId, "Production Room Sandbox");
  });

  // 9. Interactive Receipt Attachment Box Click Trigger Stub
  const receiptArea = document.querySelector('#view-add-expense border-dashed');
  if (receiptArea) {
    receiptArea.addEventListener('click', () => document.getElementById('receipt-file-input').click());
  }
}

/**
 * ─── HARDWARE BAR SYNC INDICATORS ───
 */
function syncStatusIndicatorState(status) {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  if (status === 'syncing') {
    indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span class="text-amber-500 font-bold">Syncing Ledger...</span>`;
  } else {
    indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-slate-500 dark:text-slate-400">Cloud Mirror Live</span>`;
  }
}

function triggerBackgroundSyncLoop() {
  processOfflineQueue((isSyncing) => {
    syncStatusIndicatorState(isSyncing ? 'syncing' : 'synced');
  });
}

function handleAppLaunchSequence(token, profile) {
  userEmailAddress = profile.email;
  document.getElementById('cfg-user-email').innerText = userEmailAddress;
  
  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('main-stage').classList.remove('hidden');
  
  const savedActiveSheet = localStorage.getItem('ss_active_sheet_id');
  if (savedActiveSheet) {
    loadGroupWorkspaceContext(savedActiveSheet, "Restored Production Room");
  } else {
    navigateToView('dashboard');
  }

  setInterval(triggerBackgroundSyncLoop, 10000);
}

/**
 * ─── LIFECYCLE INITIALIZATION DECK ───
 */
window.addEventListener('DOMContentLoaded', async () => {
  await openDatabase();
  
  // Wire up every interaction listener across views securely
  bindApplicationInteractionTriggers();
  
  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);
  document.querySelectorAll(`[data-select-accent="${savedAccent}"]`).forEach(btn => btn.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200'));

  if (localStorage.getItem('ss_cfg_oled') === 'true') {
    document.documentElement.classList.add('oled');
    document.getElementById('cfg-oled-toggle').innerText = "Disable";
  }

  initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => handleAppLaunchSequence(token, profile));
  checkExistingSession((token, profile) => handleAppLaunchSequence(token, profile));
});