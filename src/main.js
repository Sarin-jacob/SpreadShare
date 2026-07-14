// src/main.js
import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData, checkExistingSession, clearSessionContext } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet, processOfflineQueue, fetchLedgerDelta, syncUserConfigRegistry, fetchUserConfigRegistry } from './js/sync.js';

let activeSpreadsheetId = null;
let currentGroupEvents = [];
let userEmailAddress = "";
let currentCalcString = "0";
let groupDirectoryIndex = [];

const views = {
  'dashboard': document.getElementById('view-dashboard'),
  'group-detail': document.getElementById('view-group-detail'),
  'add-expense': document.getElementById('view-add-expense'),
  'settings': document.getElementById('view-settings')
};

function navigateToView(targetViewKey) {
  if (!views[targetViewKey]) return;
  Object.keys(views).forEach(key => views[key].classList.add('hidden'));
  views[targetViewKey].classList.remove('hidden');
  
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
 * ─── ADVANCED INTERACTION RECONSTRUCTION LOGIC ENGINE ───
 */
function evaluateAdvancedLedgerState(events) {
  const state = { totalSpent: 0, members: {}, expenses: [] };

  const discoverMember = (email) => {
    if (!state.members[email]) state.members[email] = { paid: 0, owes: 0, netBalance: 0 };
  };

  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  for (const event of events) {
    const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
    const amount = parseFloat(payload.evaluated_amount) || 0;
    const actor = event.actor_identity;
    const targetPeer = payload.target_peer_identity || "";

    discoverMember(actor);
    if (targetPeer) discoverMember(targetPeer);

    switch (event.event_type) {
      case 'EXPENSE_ADD':
        state.totalSpent += amount;
        state.members[actor].paid += amount;
        if (payload.allocations) {
          payload.allocations.forEach(alloc => {
            discoverMember(alloc.user);
            state.members[alloc.user].owes += parseFloat(alloc.value) || 0;
          });
        }
        break;

      case 'TRANSFER':
        state.members[actor].paid += amount;
        state.members[targetPeer].owes += amount;
        break;

      case 'LOAN':
        // Dynamic Interest Loan Event Parsing Architecture[cite: 3]
        const rate = parseFloat(payload.interest_rate) || 0;
        const type = payload.interest_type || 'NONE';
        const weightedMultiplier = (type === 'NONE') ? 1.0 : (1 + (rate / 100));
        const finalCompoundValue = amount * weightedMultiplier;

        state.members[actor].paid += finalCompoundValue;
        state.members[targetPeer].owes += finalCompoundValue;
        break;
    }

    state.expenses.push({
      eventId: event.eventId || event.event_id,
      title: payload.title,
      type: event.event_type,
      category: payload.category || 'General',
      amount: amount,
      payer: actor,
      target: targetPeer,
      timestamp: event.timestamp
    });
  }

  Object.keys(state.members).forEach(m => {
    state.members[m].netBalance = state.members[m].paid - state.members[m].owes;
  });
  return state;
}

function repaintGroupDirectoryUI() {
  const container = document.getElementById('groups-directory-list');
  container.innerHTML = '';
  
  if (groupDirectoryIndex.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
        <p class="text-xs text-slate-400">No active rooms found. Provide a title above to spawn a ledger workspace.</p>
      </div>`;
    return;
  }

  groupDirectoryIndex.forEach(group => {
    const el = document.createElement('div');
    el.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center shadow-2xs group hover:border-accent-500/40 transition-all cursor-pointer";
    el.innerHTML = `
      <div>
        <h4 class="font-bold text-slate-800 dark:text-slate-200 group-hover:text-accent-500 transition-colors">${group.name}</h4>
        <p class="text-[9px] font-mono text-slate-400 mt-0.5 truncate max-w-[240px]">Ref Token: ${group.id}</p>
      </div>
      <svg class="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
    `;
    el.addEventListener('click', () => loadGroupWorkspaceContext(group.id, group.name));
    container.appendChild(el);
  });
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
  repaintDOMState();
  navigateToView('group-detail');
  
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
      repaintDOMState();
    }
  } catch (err) {
    console.warn("Delta update loop deferred offline:", err);
  } finally {
    syncStatusIndicatorState('synced');
  }
}

function repaintDOMState() {
  const state = evaluateAdvancedLedgerState(currentGroupEvents);
  const summaryGrid = document.getElementById('balance-summary-grid');
  summaryGrid.innerHTML = '';
  
  Object.keys(state.members).forEach(member => {
    const data = state.members[member];
    const isPositive = data.netBalance >= 0;
    const textColor = isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    summaryGrid.innerHTML += `
      <div class="p-3 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-xl flex flex-col justify-between">
        <span class="text-[10px] text-slate-400 font-medium truncate">${member === userEmailAddress ? 'You' : member}</span>
        <span class="text-sm font-black tracking-tight ${textColor} mt-1">${isPositive ? '+' : ''}${data.netBalance.toFixed(2)}</span>
      </div>`;
  });

  const feed = document.getElementById('group-ledger-feed');
  feed.innerHTML = '';
  
  if (state.expenses.length === 0) {
    feed.innerHTML = `
      <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full">
        <p class="text-xs text-slate-400">No recorded stream activities mapped inside ledger.</p>
      </div>`;
    return;
  }

  [...state.expenses].reverse().forEach(exp => {
    let badgColor = "bg-slate-100 dark:bg-slate-900 text-slate-500";
    let desc = exp.title;
    
    if (exp.type === 'TRANSFER') {
      badgColor = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
      desc = `Settlement transfer sent to: ${exp.target}`;
    } else if (exp.type === 'LOAN') {
      badgColor = "bg-violet-500/10 text-violet-500 border border-violet-500/20";
      desc = `Issued dynamic Loan to: ${exp.target}`;
    }

    feed.innerHTML += `
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs">
        <div class="space-y-1 max-w-[65%]">
          <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${desc}</div>
          <div class="flex items-center space-x-2 text-[10px] text-slate-400 font-medium">
            <span class="truncate">Actor: ${exp.payer === userEmailAddress ? 'You' : exp.payer}</span>
            <span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
            <span class="px-1.5 py-0.2 rounded font-bold text-[8px] uppercase tracking-wide ${badgColor}">${exp.category}</span>
          </div>
        </div>
        <div class="text-right space-y-0.5">
          <div class="font-mono font-black text-slate-900 dark:text-slate-100">INR ${exp.amount.toFixed(2)}</div>
          <div class="text-[9px] text-slate-400">${new Date(exp.timestamp).toLocaleDateString()}</div>
        </div>
      </div>`;
  });
}

function bindApplicationInteractionTriggers() {
  document.getElementById('auth-btn').addEventListener('click', requestAuthenticationData);

  document.querySelectorAll('[data-route]').forEach(trigger => {
    trigger.addEventListener('click', (e) => navigateToView(e.currentTarget.getAttribute('data-route')));
  });

  // Watch input type select fields to conditionally unhide loan blocks[cite: 3]
  document.getElementById('exp-type').addEventListener('change', (e) => {
    const loanPanel = document.getElementById('loan-options-container');
    if (e.target.value === 'LOAN') loanPanel.classList.remove('hidden');
    else loanPanel.classList.add('hidden');
  });

  document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.currentTarget.getAttribute('data-val');
      const exprDisplay = document.getElementById('calc-display-expression');
      const valDisplay = document.getElementById('calc-display-value');

      if (val === 'C') { currentCalcString = "0"; valDisplay.innerText = "0.00"; }
      else if (val === 'DEL') {
        currentCalcString = currentCalcString.slice(0, -1);
        if (currentCalcString === "" || currentCalcString === "-") currentCalcString = "0";
      } else {
        if (currentCalcString === "0" && !['+', '-', '*', '/'].includes(val)) currentCalcString = val;
        else currentCalcString += val;
      }
      exprDisplay.innerText = currentCalcString;
      try {
        const sanitized = currentCalcString.replace(/[^0-9+\-*/().\s]/g, '');
        const res = new Function(`return (${sanitized || '0'})`)();
        valDisplay.innerText = Number.isFinite(res) ? res.toFixed(2) : "0.00";
      } catch (err) {}
    });
  });

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
        raw_amount_string: currentCalcString,
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
        // Fallback split logic
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

      repaintDOMState();
      document.getElementById('expense-form').reset();
      document.getElementById('loan-options-container').classList.add('hidden');
      currentCalcString = "0";
      document.getElementById('calc-display-expression').innerText = "0";
      document.getElementById('calc-display-value').innerText = "0.00";
      
      navigateToView('group-detail');
      triggerBackgroundSyncLoop();
    } catch (err) { alert(`Execution exception: ${err.message}`); }
  });

  // FIXED CORRECTION MATRIX MAP LOOP TRAP CAUGHT: Changed } end { to standard catch blocks
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
      repaintGroupDirectoryUI();
      await loadGroupWorkspaceContext(sheetId, groupName);
    } catch (err) {
      alert(`API Provision Failure: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerText = "Create Room";
    }
  });

  document.getElementById('receipt-upload-zone').addEventListener('click', () => document.getElementById('receipt-file-input').click());
  document.getElementById('receipt-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(file) {
      document.getElementById('receipt-zone-status').innerText = `✓ Attached: ${file.name.slice(0, 15)}...`;
      document.getElementById('receipt-zone-status').classList.add('text-emerald-500');
    }
  });

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

async function handleAppLaunchSequence(token, profile) {
  userEmailAddress = profile.email;
  document.getElementById('cfg-user-email').innerText = userEmailAddress;
  
  // ─── CRITICAL CLOUD RESTORE ATTEMPT DETECTED ───
  try {
    // Read directly from the cloud configuration index registry upon loading secondary devices
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

  repaintGroupDirectoryUI();

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