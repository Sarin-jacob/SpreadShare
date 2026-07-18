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
import { mountExpenseDetailComponent } from './js/components/expenseDetail.js';

let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";
let groupDirectoryIndex = [];

const $dashboardSlot = document.getElementById('view-dashboard');
const $groupDetailSlot = document.getElementById('view-group-detail');
const $expenseFormSlot = document.getElementById('view-add-expense');
const $expenseDetailSlot = document.getElementById('view-expense-detail');
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


async function handleTransactionSubmit(fields) {
  if (fields.amount <= 0) return alert("Value must evaluate above 0.00");

  try {
    const uuid = fields.isEditingEventId || crypto.randomUUID();
    const iso = new Date().toISOString();

    const computedState = evaluateAdvancedLedgerState(currentGroupEvents);
    const activeRoster = Object.keys(computedState.members).length > 0 ? Object.keys(computedState.members) : [userEmailAddress];

    const payload = {
      title: fields.type === 'EXPENSE_ADD' ? fields.title : `${fields.type} Log Entry`,
      category: fields.category,
      raw_amount_string: fields.expression,
      evaluated_amount: fields.amount,
      currency: 'INR',
      split_strategy: fields.strategy,
      allocations: []
    };

    // Keep file URL reference variables persistent during edits
    if (fields.cachedReceiptUrl) payload.receipt_local_url = fields.cachedReceiptUrl;

    if (fields.type === 'TRANSFER' || fields.type === 'LOAN') {
      payload.target_peer_identity = fields.title; 
      if (fields.type === 'LOAN') {
        payload.interest_type = fields.interestType;
        payload.interest_rate = fields.interestRate;
      }
    } else {
      switch (fields.strategy) {
        case 'EQUALLY':
          const share = fields.amount / activeRoster.length;
          payload.allocations = activeRoster.map(user => ({ user, value: share }));
          break;

        case 'SHARES':
          let totalWeights = 0;
          activeRoster.forEach(u => totalWeights += (fields.rawAllocationsMap[u] || 0));
          if (totalWeights <= 0) throw new Error("Sum of weight shares must be greater than zero.");
          payload.allocations = activeRoster.map(user => ({
            user, value: fields.amount * ((fields.rawAllocationsMap[user] || 0) / totalWeights)
          }));
          break;

        case 'EXACT':
          let sumExact = 0;
          payload.allocations = activeRoster.map(user => {
            const v = fields.rawAllocationsMap[user] || 0;
            sumExact += v;
            return { user, value: v };
          });
          if (Math.abs(sumExact - fields.amount) > 0.02) {
            throw new Error(`Exact items sum (INR ${sumExact.toFixed(2)}) must equal total cost (INR ${fields.amount.toFixed(2)})`);
          }
          break;

        case 'ADJUSTMENT':
          // AUTOMATED BASE SHARE CALCULATION PARSING LOGIC ENGINE
          let sumAdjustments = 0;
          activeRoster.forEach(u => sumAdjustments += (fields.rawAllocationsMap[u] || 0));
          
          const balancedBaseShare = (fields.amount - sumAdjustments) / activeRoster.length;
          payload.allocations = activeRoster.map(user => ({
            user,
            value: balancedBaseShare + (fields.rawAllocationsMap[user] || 0)
          }));
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

    // If updating an existing transaction record, clear its old entry from local cache parameters first
    if (fields.isEditingEventId) {
      currentGroupEvents = currentGroupEvents.filter(e => (e.eventId || e.event_id) !== fields.isEditingEventId);
    }

    currentGroupEvents.push(record);
    await writeToStore('group_events_cache', record);
    await writeToStore('offline_sync_queue', { 
      action: 'APPEND_ROW', 
      spreadsheetId: activeSpreadsheetId, 
      payload: record 
    });

    mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress);
    navigateToView('group-detail');
  } catch (err) { alert(`Verification Failure: ${err.message}`); }
}

function handleTriggerExpenseEdit(eventItemNode) {
  const payload = typeof eventItemNode.payload_json === 'string' ? JSON.parse(eventItemNode.payload_json) : eventItemNode.payload_json;
  const computedState = evaluateAdvancedLedgerState(currentGroupEvents);
  const activeRoster = Object.keys(computedState.members).length > 0 ? Object.keys(computedState.members) : [userEmailAddress];

  // 1. Mount form view component
  mountExpenseFormComponent($expenseFormSlot, activeRoster, handleTransactionSubmit);
  
  // 2. Pre-fill input fields with existing transaction metadata values
  document.getElementById('comp-exp-title').value = eventItemNode.event_type === 'EXPENSE_ADD' ? payload.title : payload.target_peer_identity || '';
  document.getElementById('comp-exp-type').value = eventItemNode.event_type;
  document.getElementById('comp-exp-category').value = payload.category || 'Food';
  document.getElementById('comp-exp-strategy').value = payload.split_strategy || 'EQUALLY';
  
  // Dispatch a simulated change event to update sub-panels correctly
  document.getElementById('comp-exp-type').dispatchEvent(new Event('change'));
  document.getElementById('comp-exp-strategy').dispatchEvent(new Event('change'));

  // 3. Load previous math calculations back into screen variables
  document.getElementById('calc-display-expression').innerText = payload.raw_amount_string || payload.evaluated_amount.toString();
  document.getElementById('calc-display-value').innerText = payload.evaluated_amount.toFixed(2);

  // If previous itemizations are present, restore input row data fields
  if (payload.allocations && payload.split_strategy !== 'EQUALLY') {
    payload.allocations.forEach(alloc => {
      const input = $expenseFormSlot.querySelector(`[data-member-allocation="${alloc.user}"]`);
      if (input) {
        if (payload.split_strategy === 'ADJUSTMENT') {
          // For adjustments, calculate the original adjustment factor relative to the base split
          const baseSplit = payload.evaluated_amount / payload.allocations.length;
          input.value = (alloc.value - baseSplit).toFixed(2);
        } else {
          input.value = alloc.value.toString();
        }
      }
    });
  }

  // 4. Attach temporary update tokens to track modification history layers
  const $form = document.getElementById('comp-expense-form');
  $form.setAttribute('data-edit-event-id', eventItemNode.eventId || eventItemNode.event_id);
  if (payload.receipt_local_url) $form.setAttribute('data-edit-receipt-url', payload.receipt_local_url);

  navigateToView('add-expense');
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

window.addEventListener('ss_open-expense-detail', (e) => {
  const { event } = e.detail;
  mountExpenseDetailComponent($expenseDetailSlot, event, handleTriggerExpenseEdit);
  navigateToView('expense-detail');
});

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
      const computedState = evaluateAdvancedLedgerState(currentGroupEvents);
      const activeRoster = Object.keys(computedState.members).length > 0 ? Object.keys(computedState.members) : [userEmailAddress];
      
      mountExpenseFormComponent($expenseFormSlot, activeRoster, (fields) => {
        const $form = document.getElementById('comp-expense-form');
        // Append update context tokens onto submit parameter structures
        fields.isEditingEventId = $form.getAttribute('data-edit-event-id');
        fields.cachedReceiptUrl = $form.getAttribute('data-edit-receipt-url');
        handleTransactionSubmit(fields);
      });
    }
  });

  document.getElementById('auth-btn').addEventListener('click', requestAuthenticationData);

  if (localStorage.getItem('ss_cfg_oled') === 'true') document.documentElement.classList.add('oled');
  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);

  initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => handleAppLaunchSequence(token, profile));
  checkExistingSession((token, profile) => handleAppLaunchSequence(token, profile));
});