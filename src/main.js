// src/main.js
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue } from './js/sync.js';
import { reconstructState } from './js/engine.js';

let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";

const authGate = document.getElementById('auth-gate');
const mainStage = document.getElementById('main-stage');
const authBtn = document.getElementById('auth-btn');
const createGroupBtn = document.getElementById('create-group-btn');
const expenseForm = document.getElementById('expense-form');
const syncStatus = document.getElementById('sync-status');
const themeToggle = document.getElementById('theme-toggle');
const signOutBtn = document.getElementById('sign-out-btn'); // New binding selector hook

authBtn.addEventListener('click', requestAuthenticationData);
themeToggle.addEventListener('click', () => document.documentElement.classList.toggle('dark'));

// Sign Out functionality trigger
signOutBtn.addEventListener('click', () => {
  clearSessionContext();
  window.location.reload(); // Hard reload drops app configurations back to the initial splash auth gate
});

// Accent color palette handler loops
document.querySelectorAll('[data-select-accent]').forEach(button => {
  button.addEventListener('click', (e) => {
    const selectedAccent = e.target.getAttribute('data-select-accent');
    document.documentElement.setAttribute('data-accent', selectedAccent);
    localStorage.setItem('ss_active_accent', selectedAccent);
    
    document.querySelectorAll('[data-select-accent]').forEach(btn => btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200'));
    e.target.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
  });
});

function resolveMathExpression(str) {
  const sanitized = str.replace(/[^0-9+\-*/().\s]/g, '');
  try {
    const evaluator = new Function(`return (${sanitized})`);
    return parseFloat(evaluator()) || 0;
  } catch (e) {
    throw new Error("Malformatted calculation symbols.");
  }
}

function repaintDOMState() {
  const state = reconstructState(currentGroupEvents);
  const summaryGrid = document.getElementById('balance-summary-grid');
  summaryGrid.innerHTML = '';
  
  Object.keys(state.members).forEach(member => {
    const data = state.members[member];
    const isPositive = data.netBalance >= 0;
    const textColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    
    summaryGrid.innerHTML += `
      <div class="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col">
        <span class="text-[10px] text-slate-400 truncate">${member === userEmailAddress ? 'You (Owner)' : member}</span>
        <span class="text-sm font-black tracking-tight ${textColor} mt-0.5">${isPositive ? '+' : ''}${data.netBalance.toFixed(2)}</span>
      </div>
    `;
  });

  const feed = document.getElementById('transaction-feed');
  feed.innerHTML = '';
  
  if (state.expenses.length === 0) {
    feed.innerHTML = `<div class="text-[11px] text-slate-400 dark:text-slate-500 text-center py-6">No localized transactions logged.</div>`;
  } else {
    [...state.expenses].reverse().forEach(exp => {
      feed.innerHTML += `
        <div class="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-lg flex justify-between items-center text-xs">
          <div>
            <div class="font-bold text-slate-700 dark:text-slate-200">${exp.title}</div>
            <div class="text-[9px] text-slate-400 dark:text-slate-500 font-medium">Actor: ${exp.payer === userEmailAddress ? 'You' : exp.payer}</div>
          </div>
          <div class="font-mono font-bold text-slate-600 dark:text-slate-300">${exp.amount.toFixed(2)}</div>
        </div>
      `;
    });
  }
}

/**
 * Centralized App Initialization Hub
 * Safely processes interface logic fields whether from a click flow or a page refresh sync
 */
function handleAppLaunchSequence(token, profile) {
  userEmailAddress = profile.email;
  console.log(`Identity verified: ${userEmailAddress}`);
  
  activeSpreadsheetId = localStorage.getItem('ss_active_sheet_id');
  if (activeSpreadsheetId) {
    document.getElementById('active-group-title').innerText = "Production Active Workspace";
    document.getElementById('active-sheet-id').innerText = `ID: ${activeSpreadsheetId}`;
  } else {
    document.getElementById('active-group-title').innerText = "No Active Workspace Directory Target";
  }

  authGate.classList.add('hidden');
  mainStage.classList.remove('hidden');
  
  repaintDOMState();
  
  // Initialize internal interval syncing loops
  setInterval(triggerBackgroundSyncLoop, 10000);
}

createGroupBtn.addEventListener('click', async () => {
  try {
    createGroupBtn.disabled = true;
    createGroupBtn.innerText = "Configuring Cloud Ledger Engine...";
    
    const folderId = await getOrCreateRootFolder();
    const generatedTitle = `Production Workspace (${new Date().toLocaleDateString()})`;
    const generatedId = await createGroupSpreadsheet(generatedTitle, folderId);
    
    activeSpreadsheetId = generatedId;
    localStorage.setItem('ss_active_sheet_id', generatedId);
    
    document.getElementById('active-group-title').innerText = generatedTitle;
    document.getElementById('active-sheet-id').innerText = `ID: ${generatedId}`;
    
    currentGroupEvents = [];
    repaintDOMState();
    
    alert(`Ecosystem Setup Successful! Spreadsheet spawned inside Drive.`);
  } catch (err) {
    alert(`Google API Configuration Failure: ${err.message}`);
  } finally {
    createGroupBtn.disabled = false;
    createGroupBtn.innerText = "✨ Spawn Remote Group Spreadsheet";
  }
});

expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeSpreadsheetId) {
    alert("Select or spawn a tracking directory before registering costs.");
    return;
  }

  const title = document.getElementById('exp-title').value;
  const rawAmountInput = document.getElementById('exp-amount').value;

  try {
    const computedSum = resolveMathExpression(rawAmountInput);
    const generatedUUID = crypto.randomUUID();
    const currentISOString = new Date().toISOString();

    const groupMembers = [userEmailAddress, 'partner.testing@niser.ac.in'];
    const proportionalCut = computedSum / groupMembers.length;

    const eventPayload = {
      title: title,
      raw_amount_string: rawAmountInput,
      evaluated_amount: computedSum,
      currency: 'INR',
      split_strategy: 'EQUALLY',
      allocations: groupMembers.map(email => ({ user: email, share_type: 'EXACT', value: proportionalCut }))
    };

    const transactionMutationRecord = {
      spreadsheetId: activeSpreadsheetId,
      eventId: generatedUUID,
      timestamp: currentISOString,
      event_type: 'EXPENSE_ADD',
      actor_identity: userEmailAddress,
      payload_json: eventPayload
    };

    currentGroupEvents.push(transactionMutationRecord);
    await writeToStore('group_events_cache', transactionMutationRecord);
    await writeToStore('offline_sync_queue', {
      action: 'APPEND_ROW',
      spreadsheetId: activeSpreadsheetId,
      payload: transactionMutationRecord
    });

    repaintDOMState();
    expenseForm.reset();
    triggerBackgroundSyncLoop();

  } catch (err) {
    alert(`Input parsing failure: ${err.message}`);
  }
});

function triggerBackgroundSyncLoop() {
  processOfflineQueue((isSyncing) => {
    if (isSyncing) {
      syncStatus.innerText = "Syncing...";
      syncStatus.className = "text-[10px] bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500 text-amber-400 font-bold animate-pulse";
    } else {
      syncStatus.innerText = "Synced";
      syncStatus.className = "text-[10px] bg-slate-700 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-600 font-bold text-slate-300";
    }
  });
}

// Global Core Initialization Lifecycle Hooks
window.addEventListener('DOMContentLoaded', async () => {
  await openDatabase();
  
  const savedAccent = localStorage.getItem('ss_active_accent') || 'indigo';
  document.documentElement.setAttribute('data-accent', savedAccent);
  const activeBtn = document.querySelector(`[data-select-accent="${savedAccent}"]`);
  if (activeBtn) activeBtn.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');

  // 1. Initialize script elements
  await initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token, profile) => {
    handleAppLaunchSequence(token, profile);
  });

  // 2. RUN AUTOLOGIN DELTA ATTEMPT: Silent check for existing session data values
  const sessionFound = await checkExistingSession((token, profile) => {
    handleAppLaunchSequence(token, profile);
  });

  if (sessionFound) {
    console.log("Active background credentials found. Restored application lifecycle framework without user action.");
  }
});