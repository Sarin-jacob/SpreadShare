// src/main.js
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { evaluateAdvancedLedgerState } from './js/engine.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue, fetchLedgerDelta, syncUserConfigRegistry, fetchUserConfigRegistry, enableLedgerPublicLinkSharing } from './js/sync.js';

// Import decoupled routing configurations
import { initRouter, navigateToView } from './js/router.js';
import { initCalculator, resetCalculator } from './js/calculator.js';
import { mountExpenseFormComponent } from './js/components/expenseForm.js';
import { mountGroupDirectoryComponent } from './js/components/groupDirectory.js';
import { mountGroupDetailComponent } from './js/components/groupDetail.js';
import { mountSettingsComponent } from './js/components/settings.js';

let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";
let groupDirectoryIndex = [];

const $dashboardSlot = document.getElementById('view-dashboard');
const $groupDetailSlot = document.getElementById('view-group-detail');
const $expenseFormSlot = document.getElementById('view-add-expense');
const $settingsSlot = document.getElementById('view-settings');

/**
 * ─── LINK SHARING GENERATOR ROUTER ───
 */
async function handleGenerateInviteLink() {
  const btnText = document.getElementById('invite-btn-text');
  if (!btnText) return;
  
  try {
    btnText.innerText = "Sharing...";
    await enableLedgerPublicLinkSharing(activeSpreadsheetId);
    
    const groupName = localStorage.getItem('ss_active_sheet_name');
    const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${activeSpreadsheetId}&name=${encodeURIComponent(groupName)}`;
    
    await navigator.clipboard.writeText(inviteUrl);
    console.log(inviteUrl);
    btnText.innerText = "Copied!";
    setTimeout(() => { if(btnText) btnText.innerText = "Invite"; }, 2000);
  } catch (err) {
    alert(`Invite generation failed: ${err.message}`);
    btnText.innerText = "Invite";
  }
}

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
  
  mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress);
  navigateToView('group-detail');
  
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
  } catch (err) { console.warn("Delta update loop deferred offline:", err); }
  finally { syncStatusIndicatorState('synced'); }
}

async function handleCreateGroup(groupName, inputElement) {
  try {
    inputElement.disabled = true;
    const folderId = await getOrCreateRootFolder();
    const sheetId = await createGroupSpreadsheet(groupName, folderId);
    
    const uuid = crypto.randomUUID();
    const currentISOString = new Date().toISOString();
    const joinEventRecord = {
      spreadsheetId: sheetId,
      eventId: uuid,
      timestamp: currentISOString,
      event_type: 'MEMBER_JOINED',
      actor_identity: userEmailAddress,
      payload_json: { member_email: userEmailAddress }
    };
    
    await writeToStore('group_events_cache', joinEventRecord);
    await writeToStore('offline_sync_queue', { action: 'APPEND_ROW', spreadsheetId: sheetId, payload: joinEventRecord });

    groupDirectoryIndex.push({ id: sheetId, name: groupName });
    localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
    await syncUserConfigRegistry(groupDirectoryIndex);

    inputElement.value = '';
    mountGroupDirectoryComponent($dashboardSlot, groupDirectoryIndex, handleCreateGroup, loadGroupWorkspaceContext);
    await loadGroupWorkspaceContext(sheetId, groupName);
  } catch (err) { alert(`Ecosystem Provision Error: ${err.message}`); }
  finally { inputElement.disabled = false; }
}

/**
 * FIXED: Rewritten to read entry fields cleanly from component parameters 
 * instead of fragile direct DOM queries using outdated element IDs.
 */
async function handleTransactionSubmit(fields) {
  if (fields.amount <= 0) return alert("Value must evaluate above 0.00");

  try {
    const uuid = crypto.randomUUID();
    const iso = new Date().toISOString();

    // Reconstruct the active group roster live up to this execution second
    const computedState = evaluateAdvancedLedgerState(currentGroupEvents);
    const activeRoster = Object.keys(computedState.members).length > 0 
      ? Object.keys(computedState.members) 
      : [userEmailAddress];

    const payload = {
      title: fields.type === 'EXPENSE_ADD' ? fields.title : `${fields.type} Log Entry`,
      category: fields.category,
      raw_amount_string: fields.expression,
      evaluated_amount: fields.amount,
      currency: 'INR',
      split_strategy: fields.strategy,
      allocations: []
    };

    if (fields.type === 'TRANSFER' || fields.type === 'LOAN') {
      payload.target_peer_identity = fields.title; 
      if (fields.type === 'LOAN') {
        payload.interest_type = fields.interestType;
        payload.interest_rate = fields.interestRate;
      }
    } else {
      // ─── RUN ADVANCED STRATEGY ALGEBRA PARSING NODES ───
      switch (fields.strategy) {
        case 'EQUALLY':
          const equalCut = fields.amount / activeRoster.length;
          payload.allocations = activeRoster.map(user => ({ user, value: equalCut }));
          break;

        case 'SHARES':
          let totalWeights = 0;
          activeRoster.forEach(u => totalWeights += (fields.rawAllocationsMap[u] || 0));
          if (totalWeights <= 0) throw new Error("Sum of weight shares must be greater than zero.");
          
          payload.allocations = activeRoster.map(user => ({
            user,
            value: fields.amount * ((fields.rawAllocationsMap[user] || 0) / totalWeights)
          }));
          break;

        case 'EXACT':
          let runningExactTotal = 0;
          payload.allocations = activeRoster.map(user => {
            const val = fields.rawAllocationsMap[user] || 0;
            runningExactTotal += val;
            return { user, value: val };
          });
          // Verify that manual matrix definitions sum precisely to item totals
          if (Math.abs(runningExactTotal - fields.amount) > 0.01) {
            throw new Error(`Sum of exact entries (INR ${runningExactTotal.toFixed(2)}) must equal total cost (INR ${fields.amount.toFixed(2)})`);
          }
          break;

        case 'ADJUSTMENT':
          const baseSlice = fields.amount / activeRoster.length;
          let verificationSum = 0;
          payload.allocations = activeRoster.map(user => {
            const adj = fields.rawAllocationsMap[user] || 0;
            verificationSum += adj;
            return { user, value: baseSlice + adj };
          });
          // Premium and deduction inputs must offset each other exactly to net zero
          if (Math.abs(verificationSum) > 0.01) {
            throw new Error(`Sum of premium adjustments must equal exactly 0.00 (Current total: ${verificationSum.toFixed(2)})`);
          }
          break;
      }
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
    alert(`Split Verification Rejection: ${err.message}`); 
  }
}

async function processIncomingUrlInvitation() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteSheetId = urlParams.get('invite');
  const inviteGroupName = urlParams.get('name');

  if (!inviteSheetId || !inviteGroupName) return false;

  window.history.replaceState({}, document.title, window.location.pathname);
  const alreadyJoined = groupDirectoryIndex.some(g => g.id === inviteSheetId);
  if (alreadyJoined) {
    await loadGroupWorkspaceContext(inviteSheetId, inviteGroupName);
    return true;
  }

  try {
    syncStatusIndicatorState('syncing');
    const uuid = crypto.randomUUID();
    const currentISOString = new Date().toISOString();
    const joinRecord = {
      spreadsheetId: inviteSheetId,
      eventId: uuid,
      timestamp: currentISOString,
      event_type: 'MEMBER_JOINED',
      actor_identity: userEmailAddress,
      payload_json: { member_email: userEmailAddress }
    };

    await writeToStore('group_events_cache', joinRecord);
    await writeToStore('offline_sync_queue', { action: 'APPEND_ROW', spreadsheetId: inviteSheetId, payload: joinRecord });

    groupDirectoryIndex.push({ id: inviteSheetId, name: inviteGroupName });
    localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
    await syncUserConfigRegistry(groupDirectoryIndex);

    mountGroupDirectoryComponent($dashboardSlot, groupDirectoryIndex, handleCreateGroup, loadGroupWorkspaceContext);
    await loadGroupWorkspaceContext(inviteSheetId, inviteGroupName);
    return true;
  } catch (err) {
    alert(`Failed to accept collaborative invitation link: ${err.message}`);
    return false;
  }
}

function handleSignOut() {
  clearSessionContext();
  localStorage.removeItem('ss_groups_directory');
  localStorage.removeItem('ss_active_sheet_id');
  localStorage.removeItem('ss_active_sheet_name');
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
  
  mountSettingsComponent($settingsSlot, userEmailAddress, handleSignOut);
  mountExpenseFormComponent($expenseFormSlot, handleTransactionSubmit);

  try {
    const remoteIndex = await fetchUserConfigRegistry();
    groupDirectoryIndex = (remoteIndex && remoteIndex.length > 0) ? remoteIndex : JSON.parse(localStorage.getItem('ss_groups_directory') || '[]');
  } catch(e) { groupDirectoryIndex = JSON.parse(localStorage.getItem('ss_groups_directory') || '[]'); }
  
  localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
  mountGroupDirectoryComponent($dashboardSlot, groupDirectoryIndex, handleCreateGroup, loadGroupWorkspaceContext);

  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('main-stage').classList.remove('hidden');
  
  const handledInvite = await processIncomingUrlInvitation();
  if (handledInvite) return;

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
  initRouter();
  initCalculator();
  
  // FIXED: Attached the persistent Invite handling strategy using event delegation globally
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="invite"]')) {
      handleGenerateInviteLink();
    }
  });
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-route="add-expense"]');
      if (trigger) {
        const state = evaluateAdvancedLedgerState(currentGroupEvents);
        const activeRoster = Object.keys(state.members).length > 0 ? Object.keys(state.members) : [userEmailAddress];
        
        // Pass the live calculated group roster right into the fresh form layout window instance
        mountExpenseFormComponent($expenseFormSlot, activeRoster, handleTransactionSubmit);
      }
    });

  document.getElementById('auth-btn').addEventListener('click', requestAuthenticationData);

  if (localStorage.getItem('ss_cfg_oled') === 'true') document.documentElement.classList.add('oled');
  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);

  initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => handleAppLaunchSequence(token, profile));
  checkExistingSession((token, profile) => handleAppLaunchSequence(token, profile));
});