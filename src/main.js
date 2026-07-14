// src/main.js
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue, fetchLedgerDelta, syncUserConfigRegistry, fetchUserConfigRegistry } from './js/sync.js';

// Import our decoupled layout component handlers
import { initRouter, navigateToView } from './js/router.js';
import { initCalculator, resetCalculator } from './js/calculator.js';
import { mountExpenseFormComponent } from './js/components/expenseForm.js';
import { mountGroupDirectoryComponent } from './js/components/groupDirectory.js';
import { mountGroupDetailComponent } from './js/components/groupDetail.js';
import { mountSettingsComponent } from './js/components/settings.js';

// Application Runtime State Machine
let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";
let groupDirectoryIndex = [];

// Clean mount target containers slots inside index.html
const $dashboardSlot = document.getElementById('view-dashboard');
const $groupDetailSlot = document.getElementById('view-group-detail');
const $expenseFormSlot = document.getElementById('view-add-expense');
const $settingsSlot = document.getElementById('view-settings');

/**
 * Loads cached events from IndexedDB and syncs remaining ledger updates from the cloud
 */
async function loadGroupWorkspaceContext(spreadsheetId, groupName) {
  activeSpreadsheetId = spreadsheetId;
  localStorage.setItem('ss_active_sheet_id', spreadsheetId);
  localStorage.setItem('ss_active_sheet_name', groupName);
  
  const db = await openDatabase();
  const tx = db.transaction('group_events_cache', 'readonly');
  const allEvents = await new Promise((res) => {
    tx.objectStore('group_events_cache').getAll().onsuccess = (e) => res(e.target.result || []);
  });

  currentGroupEvents = allEvents.filter(evt => evt.spreadsheetId === spreadsheetId);
  
  // Render the decoupled layout component dynamically
  mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress);
  navigateToView('group-detail');
  
  // Sync the latest row updates via delta retrieval
  try {
    syncStatusIndicatorState('syncing');
    const newRows = await fetchLedgerDelta(spreadsheetId, currentGroupEvents.length);
    
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
      mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress);
    }
  } catch (err) {
    console.warn("Delta update loop deferred offline:", err);
  } finally {
    syncStatusIndicatorState('synced');
  }
}

/**
 * Handles named spreadsheet creation and saves metadata to the cloud configuration registry
 */
async function handleCreateGroup(groupName, inputElement) {
  try {
    inputElement.disabled = true;
    const folderId = await getOrCreateRootFolder();
    const sheetId = await createGroupSpreadsheet(groupName, folderId);
    
    groupDirectoryIndex.push({ id: sheetId, name: groupName });
    localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
    
    try { await syncUserConfigRegistry(groupDirectoryIndex); } catch(e) { /* Deferred offline */ }

    inputElement.value = '';
    mountGroupDirectoryComponent($dashboardSlot, groupDirectoryIndex, handleCreateGroup, loadGroupWorkspaceContext);
    await loadGroupWorkspaceContext(sheetId, groupName);
  } catch (err) {
    alert(`Ecosystem Provision Error: ${err.message}`);
  } finally {
    inputElement.disabled = false;
  }
}

/**
 * Formats data from calculator pad submit buttons to commit transactions optimistically
 */
async function handleTransactionSubmit(fields) {
  try {
    const uuid = crypto.randomUUID();
    const iso = new Date().toISOString();
    
    const payload = {
      title: fields.type === 'EXPENSE_ADD' ? fields.title : `${fields.type} Log Entry`,
      category: document.getElementById('comp-exp-category')?.value || 'General',
      raw_amount_string: fields.expression,
      evaluated_amount: fields.amount,
      currency: 'INR',
      split_strategy: 'EQUALLY'
    };

    if (fields.type === 'TRANSFER' || fields.type === 'LOAN') {
      payload.target_peer_identity = fields.title;
      if (fields.type === 'LOAN') {
        payload.interest_type = document.getElementById('comp-loan-interest-type').value;
        payload.interest_rate = document.getElementById('comp-loan-interest-rate').value;
      }
    } else {
      const splitPool = [userEmailAddress, 'partner.testing@niser.ac.in']; 
      payload.allocations = splitPool.map(m => ({ user: m, value: fields.amount / splitPool.length }));
    }

    const record = {
      spreadsheetId: activeSpreadsheetId,
      eventId: uuid,
      timestamp: iso,
      event_type: fields.type,
      actor_identity: userEmailAddress,
      payload_json: payload
    };

    currentGroupEvents.push(record);
    await writeToStore('group_events_cache', record);
    await writeToStore('offline_sync_queue', { action: 'APPEND_ROW', spreadsheetId: activeSpreadsheetId, payload: record });

    resetCalculator();
    mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress);
    navigateToView('group-detail');
    triggerBackgroundSyncLoop();
  } catch (err) {
    alert(`Commit error: ${err.message}`);
  }
}

function handleSignOut() {
  clearSessionContext();
  localStorage.removeItem('ss_groups_directory');
  window.location.reload();
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

async function handleAppLaunchSequence(token, profile) {
  userEmailAddress = profile.email;
  
  // Initialize static global view configurations 
  mountSettingsComponent($settingsSlot, userEmailAddress, handleSignOut);
  mountExpenseFormComponent($expenseFormSlot, handleTransactionSubmit);

  try {
    const remoteIndex = await fetchUserConfigRegistry();
    groupDirectoryIndex = (remoteIndex && remoteIndex.length > 0) ? remoteIndex : JSON.parse(localStorage.getItem('ss_groups_directory') || '[]');
  } catch(e) {
    groupDirectoryIndex = JSON.parse(localStorage.getItem('ss_groups_directory') || '[]');
  }
  localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));

  // Render out the group directory dashboard component views
  mountGroupDirectoryComponent($dashboardSlot, groupDirectoryIndex, handleCreateGroup, loadGroupWorkspaceContext);

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
  
  // Initialize SPA routing structures
  initRouter();
  document.getElementById('auth-btn').addEventListener('click', requestAuthenticationData);

  // Initialize global light/dark theme metrics
  if (localStorage.getItem('ss_cfg_oled') === 'true') document.documentElement.classList.add('oled');
  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);

  initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => handleAppLaunchSequence(token, profile));
  checkExistingSession((token, profile) => handleAppLaunchSequence(token, profile));
});