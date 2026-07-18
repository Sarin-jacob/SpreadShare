// src/main.js (Update these target orchestration methods inside your core script)
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue, fetchLedgerDelta, syncUserConfigRegistry, fetchUserConfigRegistry, enableLedgerPublicLinkSharing } from './js/sync.js';

// Component Import Bindings
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
 * ─── INVITE LINK COPIER UTILITY ───
 */
async function handleGenerateInviteLink() {
    console.log("testuibg");
  const btnText = document.getElementById('invite-btn-text');
  try {
    btnText.innerText = "Sharing...";
    // 1. Set spreadsheet access permissions to open link sharing via Drive API
    await enableLedgerPublicLinkSharing(activeSpreadsheetId);
    
    // 2. Build the unique deep-link routing string payload
    const groupName = localStorage.getItem('ss_active_sheet_name');
    const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${activeSpreadsheetId}&name=${encodeURIComponent(groupName)}`;
    
    // 3. Write directly onto local clipboard channel registers
    await navigator.clipboard.writeText(inviteUrl);
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
  
  document.getElementById('active-group-title').innerText = groupName;
  document.getElementById('active-sheet-id').innerText = `ID: ${spreadsheetId}`;
  
  const db = await openDatabase();
  const tx = db.transaction('group_events_cache', 'readonly');
  const allEvents = await new Promise((res) => {
    tx.objectStore('group_events_cache').getAll().onsuccess = (e) => res(e.target.result || []);
  });

  currentGroupEvents = allEvents.filter(evt => evt.spreadsheetId === spreadsheetId);
  
  mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress, handleGenerateInviteLink);
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
      mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress, handleGenerateInviteLink);
    }
  } catch (err) { console.warn("Delta update loop deferred offline:", err); }
  finally { syncStatusIndicatorState('synced'); }
}

async function handleCreateGroup(groupName, inputElement) {
  try {
    inputElement.disabled = true;
    const folderId = await getOrCreateRootFolder();
    const sheetId = await createGroupSpreadsheet(groupName, folderId);
    
    // ─── LEDGER REGISTRATION SEED ENTRY ───
    // Log the group creator as the first active member in the log stream
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
    
    // Commit the join entry locally and queue it for the background sync sync loops
    await writeToStore('group_events_cache', joinEventRecord);
    await writeToStore('offline_sync_queue', { action: 'APPEND_ROW', spreadsheetId: sheetId, payload: joinEventRecord });

    groupDirectoryIndex.push({ id: sheetId, name: groupName });
    localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
    await syncUserConfigRegistry(groupDirectoryIndex);

    inputElement.value = '';
    mountGroupDirectoryComponent($dashboardSlot, groupDirectoryIndex, handleCreateGroup, loadGroupWorkspaceContext);
    await loadGroupWorkspaceContext(sheetId, groupName);
  } catch (err) {
    alert(`Ecosystem Provision Error: ${err.message}`);
  } finally { inputElement.disabled = false; }
}

async function handleTransactionSubmit(fields) {
  try {
    const uuid = crypto.randomUUID();
    const iso = new Date().toISOString();
    
    const payload = {
      title: fields.title,
      category: document.getElementById('exp-category').value,
      raw_amount_string: fields.expression,
      evaluated_amount: fields.amount,
      currency: 'INR',
      split_strategy: fields.type === 'EXPENSE_ADD' ? 'EQUALLY' : 'NONE'
    };

    if (fields.type === 'TRANSFER' || fields.type === 'LOAN') {
      payload.target_peer_identity = fields.title; // Interprets the label field value as the target peer's email
      if (fields.type === 'LOAN') {
        payload.interest_type = document.getElementById('comp-loan-interest-type').value;
        payload.interest_rate = document.getElementById('comp-loan-interest-rate').value;
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
    mountGroupDetailComponent($groupDetailSlot, currentGroupEvents, userEmailAddress, handleGenerateInviteLink);
    navigateToView('group-detail');
    triggerBackgroundSyncLoop();
  } catch (err) { alert(`Commit error: ${err.message}`); }
}

/**
 * ─── DEEP LINK INVITATION INTERCEPT ROUTER ───
 */
async function processIncomingUrlInvitation() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteSheetId = urlParams.get('invite');
  const inviteGroupName = urlParams.get('name');

  if (!inviteSheetId || !inviteGroupName) return false; // Exit early if no invite token parameters match

  console.log(`Processing inbound link invitation for group: ${inviteGroupName}...`);

  // Clear query string tokens out of the URL bar so the invitation doesn't re-trigger on subsequent refreshes
  window.history.replaceState({}, document.title, window.location.pathname);

  // Check if this sheet is already tracked inside the user's directory index
  const alreadyJoined = groupDirectoryIndex.some(g => g.id === inviteSheetId);
  if (alreadyJoined) {
    await loadGroupWorkspaceContext(inviteSheetId, inviteGroupName);
    return true;
  }

  try {
    syncStatusIndicatorState('syncing');
    
    // Log the user's explicit joining entry token straight onto the remote open ledger rows
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

    // Commit locally and queue the update for backend delivery
    await writeToStore('group_events_cache', joinRecord);
    await writeToStore('offline_sync_queue', { action: 'APPEND_ROW', spreadsheetId: inviteSheetId, payload: joinRecord });

    // Insert group references inside config file registries map
    groupDirectoryIndex.push({ id: inviteSheetId, name: inviteGroupName });
    localStorage.setItem('ss_groups_directory', JSON.stringify(groupDirectoryIndex));
    await syncUserConfigRegistry(groupDirectoryIndex);

    // Refresh UI panels and load the newly joined workspace view context
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
  
  // Intercept and route inbound deep link invitations first
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
  
  document.getElementById('auth-btn').addEventListener('click', requestAuthenticationData);
  // document.getElementById('theme-toggle').addEventListener('click', () => document.documentElement.classList.toggle('dark'));

  if (localStorage.getItem('ss_cfg_oled') === 'true') document.documentElement.classList.add('oled');
  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);

  initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => handleAppLaunchSequence(token, profile));
  checkExistingSession((token, profile) => handleAppLaunchSequence(token, profile));
});