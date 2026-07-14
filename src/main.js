// src/main.js
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue, fetchLedgerDelta, syncUserConfigRegistry, fetchUserConfigRegistry } from './js/sync.js';

// Import newly isolated SPA components
import { initRouter, navigateToView } from './js/router.js';
import { initCalculator, resetCalculator } from './js/calculator.js';

// Import presentation layer DOM painters
import { repaintGroupDirectoryUI } from './js/ui/dashboard.js';
import { repaintGroupDetailUI } from './js/ui/groupDetail.js';
import { initSettingsUI, updateProfileEmailDisplay } from './js/ui/settings.js';

// Application Runtime Memory State
let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";
let groupDirectoryIndex = [];

/**
 * ─── ACTIVE GROUP ACCOUNTING LOAD CONTEXT ───
 */
async function loadGroupWorkspaceContext(spreadsheetId, groupName) {
  activeSpreadsheetId = spreadsheetId;
  localStorage.setItem('ss_active_sheet_id', spreadsheetId);
  localStorage.setItem('ss_active_sheet_name', groupName);
  
  document.getElementById('active-group-title').innerText = groupName;
  document.getElementById('active-sheet-id').innerText = `ID: ${spreadsheetId}`;
  
  const db = await openDatabase();
  const tx = db.transaction('group_events_cache', 'readonly');
  const allEvents = await new Promise((res) => {
    tx.objectStore('group_events_cache').getAll().onsuccess = (e) => res(e.target.result || []);
  });

  // Pull historical array blocks seamlessly across sessions
  currentGroupEvents = allEvents.filter(evt => evt.spreadsheetId === spreadsheetId);
  
  // Call the decoupled UI view painter
  repaintGroupDetailUI(currentGroupEvents, userEmailAddress);
  navigateToView('group-detail');
  
  // Asynchronously check for remote modifications using a delta fetch
  const lastKnownRowIndex = currentGroupEvents.length;
  try {
    syncStatusIndicatorState('syncing');
    const newRows = await fetchLedgerDelta(spreadsheetId, lastKnownRowIndex);
    
    if (newRows.length > 0) {
      const writeTx = db.transaction('group_events_cache', 'readwrite');
      const writeStore = writeTx.objectStore('group_events_cache');
      
      for (const row of newRows) {
        const parsed = {
          spreadsheetId: spreadsheetId,
          timestamp: row[0],
          eventId: row[1],
          event_type: row[2],
          actor_identity: row[3],
          payload_json: JSON.parse(row[4])
        };
        currentGroupEvents.push(parsed);
        await writeStore.put(parsed);
      }
      repaintGroupDetailUI(currentGroupEvents, userEmailAddress);
    }
  } catch (err) {
    console.warn("Delta updates deferred offline:", err);
  } finally {
    syncStatusIndicatorState('synced');
  }
}

/**
 * ─── INTERACTION TRIGGERS & CORE FORM LIFECYCLES ───
 */
function bindApplicationInteractionTriggers() {
  // Authentication Trigger
  document.getElementById('auth-btn').addEventListener('click', requestAuthenticationData);

  // Watch transaction type selectors to unhide Loan Settings fields dynamically
  document.getElementById('exp-type').addEventListener('change', (e) => {
    const loanPanel = document.getElementById('loan-options-container');
    if (e.target.value === 'LOAN') loanPanel.classList.remove('hidden');
    else loanPanel.classList.add('hidden');
  });

  // Multi-Type Ledger Form Submission Core
  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeSpreadsheetId) return alert("Halted: Map a group room entry first.");

    const titleOrPeer = document.getElementById('exp-title').value;
    const type = document.getElementById('exp-type').value;
    const category = document.getElementById('exp-category').value;
    const totalVal = parseFloat(document.getElementById('calc-display-value').innerText) || 0;

    if (totalVal <= 0) return alert("Value must parse above 0.00");

    try {
      const uuid = crypto.randomUUID();
      const iso = new Date().toISOString();

      const payload = {
        title: type === 'EXPENSE_ADD' ? titleOrPeer : `${type} Log Entry`,
        category: category,
        raw_amount_string: document.getElementById('calc-display-expression').innerText,
        evaluated_amount: totalVal,
        currency: 'INR',
        split_strategy: 'EQUALLY'
      };

      if (type === 'TRANSFER' || type === 'LOAN') {
        payload.target_peer_identity = titleOrPeer;
        if (type === 'LOAN') {
          payload.interest_type = document.getElementById('loan-interest-type').value;
          payload.interest_rate = document.getElementById('loan-interest-rate').value;
        }
      } else {
        // Fallback split calculation logic pools
        const splitPool = [userEmailAddress, 'partner.testing@niser.ac.in']; 
        payload.allocations = splitPool.map(m => ({ user: m, value: totalVal / splitPool.length }));
      }

      const txRecord = {
        spreadsheetId: activeSpreadsheetId,
        eventId: uuid,
        timestamp: iso,
        event_type: type,
        actor_identity: userEmailAddress,
        payload_json: payload
      };

      currentGroupEvents.push(txRecord);
      await writeToStore('group_events_cache', txRecord);
      await writeToStore('offline_sync_queue', { action: 'APPEND_ROW', spreadsheetId: activeSpreadsheetId, payload: txRecord });

      // Trigger visual updates and clear calculator parameters
      repaintGroupDetailUI(currentGroupEvents, userEmailAddress);
      document.getElementById('expense-form').reset();
      document.getElementById('loan-options-container').classList.add('hidden');
      resetCalculator();
      
      navigateToView('group-detail');
      triggerBackgroundSyncLoop();
    } catch (err) { alert(`Execution exception: ${err.message}`); }
  });

  // Named Group Provision Handler
  document.getElementById('create-group-btn').addEventListener('click', async () => {
    const inputField = document.getElementById('new-group-name-input');
    const groupName = inputField.value.trim();
    if (!groupName) return alert("Please supply a valid name for the group room.");

    const btn = document.getElementById('create-group-btn');
    try {
      btn.disabled = true;
      btn.innerText = "Spawning Room...";
      
      const folderId = await getOrCreateRootFolder();
      const sheetId = await createGroupSpreadsheet(groupName, folderId);
      
      groupDirectoryIndex.push({ id: sheetId, name: groupName });
      localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
      
      try { await syncUserConfigRegistry(groupDirectoryIndex); } catch(e) { console.warn("Index log write deferred offline."); }

      inputField.value = '';
      repaintGroupDirectoryUI(groupDirectoryIndex, loadGroupWorkspaceContext);
      await loadGroupWorkspaceContext(sheetId, groupName);
    } catch (err) {
      alert(`API Provision Failure: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerText = "Create Room";
    }
  });

  // Receipt File Attachment Actions
  document.getElementById('receipt-upload-zone').addEventListener('click', () => document.getElementById('receipt-file-input').click());
  document.getElementById('receipt-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(file) {
      document.getElementById('receipt-zone-status').innerText = `✓ Attached: ${file.name.slice(0, 15)}...`;
      document.getElementById('receipt-zone-status').classList.add('text-emerald-500');
    }
  });

  // Base Theme Toggles
  const toggleDark = () => document.documentElement.classList.toggle('dark');
  document.getElementById('cfg-dark-toggle').addEventListener('click', toggleDark);

  document.getElementById('cfg-oled-toggle').addEventListener('click', (e) => {
    const active = document.documentElement.classList.toggle('oled');
    e.target.innerText = active ? "Disable" : "Enable";
    localStorage.setItem('ss_cfg_oled', active ? 'true' : 'false');
  });

  document.getElementById('sign-out-btn').addEventListener('click', () => {
    clearSessionContext();
    localStorage.removeItem('ss_groups_directory');
    window.location.reload();
  });

  document.querySelectorAll('[data-select-accent]').forEach(button => {
    button.addEventListener('click', (e) => {
      const accent = e.target.getAttribute('data-select-accent');
      document.documentElement.setAttribute('data-accent', accent);
      localStorage.setItem('ss_active_accent', accent);
      document.querySelectorAll('[data-select-accent]').forEach(btn => btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200'));
      e.target.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
    });
  });
}

function syncStatusIndicatorState(status) {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  indicator.innerHTML = status === 'syncing' 
    ? `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span class="text-amber-500 font-bold">Syncing Ledger...</span>`
    : `<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-slate-500 dark:text-slate-400 font-medium">Cloud Mirror Live</span>`;
}

function triggerBackgroundSyncLoop() {
  processOfflineQueue((isSyncing) => syncStatusIndicatorState(isSyncing ? 'syncing' : 'synced'));
}

/**
 * ─── CLIENT INITIALIZATION APP CONTEXT LAUNCH ───
 */
async function handleAppLaunchSequence(token, profile) {
  userEmailAddress = profile.email;
  updateProfileEmailDisplay(userEmailAddress);
  
  try {
    // Read the hidden global group directory database file from Drive on refresh
    const remoteIndex = await fetchUserConfigRegistry();
    if (remoteIndex && remoteIndex.length > 0) {
      groupDirectoryIndex = remoteIndex;
      localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
    } else {
      groupDirectoryIndex = JSON.parse(localStorage.getItem('ss_groups_directory') || '[]');
    }
  } catch(e) {
    groupDirectoryIndex = JSON.parse(localStorage.getItem('ss_groups_directory') || '[]');
  }

  // Paint directories UI component list
  repaintGroupDirectoryUI(groupDirectoryIndex, loadGroupWorkspaceContext);

  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('main-stage').classList.remove('hidden');
  
  const savedActiveSheet = localStorage.getItem('ss_active_sheet_id');
  const savedActiveName = localStorage.getItem('ss_active_sheet_name');
  if (savedActiveSheet && savedActiveName) {
    loadGroupWorkspaceContext(savedActiveSheet, savedActiveName);
  } else {
    navigateToView('dashboard');
  }

  setInterval(triggerBackgroundSyncLoop, 10000);
}

window.addEventListener('DOMContentLoaded', async () => {
  await openDatabase();
  
  // Bootstrap Router, Calculator Engine, and Settings UI Configurations
  initRouter();
  initCalculator();
  initSettingsUI();
  
  // Wire up core event listners across forms and panels
  bindApplicationInteractionTriggers();

  initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => handleAppLaunchSequence(token, profile));
  checkExistingSession((token, profile) => handleAppLaunchSequence(token, profile));
});