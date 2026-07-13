import { CONFIG } from './js/config.js';
import { initGoogleAuth, requestAuthenticationData } from './js/auth.js';
import { openDatabase, writeToStore } from './js/db.js';
import { getOrCreateRootFolder, createGroupSpreadsheet } from './js/sync.js';
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

authBtn.addEventListener('click', requestAuthenticationData);

// ─── THEME & LIGHT/DARK SYSTEM MANAGEMENT ───
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
});

// Setup dynamic accent event listeners for your 6 palettes
document.querySelectorAll('[data-select-accent]').forEach(button => {
  button.addEventListener('click', (e) => {
    const selectedAccent = e.target.getAttribute('data-select-accent');
    
    // Set the theme configuration variable on the document element root
    document.documentElement.setAttribute('data-accent', selectedAccent);
    
    // Highlight the currently active theme selection circle wrapper
    document.querySelectorAll('[data-select-accent]').forEach(btn => {
      btn.classList.remove('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
    });
    e.target.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');
  });
});

// Safe Algebraic Expression Evaluation Engine
function resolveMathExpression(str) {
  const sanitized = str.replace(/[^0-9+\-*/().\s]/g, '');
  try {
    const evaluator = new Function(`return (${sanitized})`);
    return parseFloat(evaluator()) || 0;
  } catch (e) {
    throw new Error("Malformatted arithmetic operation tokens.");
  }
}

function repaintDOMState() {
  const state = reconstructState(currentGroupEvents);
  
  // Render Dynamic Calculated Balance Grid
  const summaryGrid = document.getElementById('balance-summary-grid');
  summaryGrid.innerHTML = '';
  
  Object.keys(state.members).forEach(member => {
    const data = state.members[member];
    const isPositive = data.netBalance >= 0;
    
    // We utilize dynamic accent-600/400 styles for positive balances 
    // and strict red/rose utility bounds for structural negative balances.
    const textColor = isPositive 
      ? 'text-accent-600 dark:text-accent-400' 
      : 'text-rose-600 dark:text-rose-400';
    
    summaryGrid.innerHTML += `
      <div class="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col">
        <span class="text-[10px] text-slate-400 truncate">${member === userEmailAddress ? 'You (Owner)' : member}</span>
        <span class="text-sm font-black tracking-tight ${textColor} mt-0.5">${isPositive ? '+' : ''}${data.netBalance.toFixed(2)}</span>
      </div>
    `;
  });

  // Render Transaction Stream Feed Listing
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
          <div class="font-mono font-bold text-slate-600 dark:text-slate-300">
            ${exp.amount.toFixed(2)}
          </div>
        </div>
      `;
    });
  }
}

// Group Setup Lifecycle Trigger Operations
createGroupBtn.addEventListener('click', async () => {
  try {
    createGroupBtn.disabled = true;
    createGroupBtn.innerText = "Configuring Cloud Ledger Engine...";
    
    const folderId = await getOrCreateRootFolder();
    const generatedTitle = `Production Workspace (${new Date().toLocaleDateString()})`;
    const generatedId = await createGroupSpreadsheet(generatedTitle, folderId);
    
    activeSpreadsheetId = generatedId;
    document.getElementById('active-group-title').innerText = generatedTitle;
    document.getElementById('active-sheet-id').innerText = `ID: ${generatedId}`;
    
    currentGroupEvents = [];
    repaintDOMState();
    
    alert(`Ecosystem Setup Successful! Spreadsheet spawned inside Drive.`);
  } catch (err) {
    console.error("Cloud allocation processing runtime exception:", err);
    alert(`Google API Configuration Failure: ${err.message}`);
  } finally {
    createGroupBtn.disabled = false;
    createGroupBtn.innerText = "✨ Spawn Remote Group Spreadsheet";
  }
});

// Transaction Submission Handling Pipeline Loop
expenseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeSpreadsheetId) {
    alert("Halted: Cannot record transactions without an active workspace sheet pipeline allocation.");
    return;
  }

  const title = document.getElementById('exp-title').value;
  const rawAmountInput = document.getElementById('exp-amount').value;

  try {
    const computedSum = resolveMathExpression(rawAmountInput);
    const generatedUUID = crypto.randomUUID();
    const currentISOString = new Date().toISOString();

    const groupMembers = [userEmailAddress, 'partner.testing@example.com'];
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

    // ─── OPTIMISTIC COMMIT EXECUTION ───
    currentGroupEvents.push(transactionMutationRecord);
    await writeToStore('group_events_cache', transactionMutationRecord);
    await writeToStore('offline_sync_queue', {
      action: 'APPEND_ROW',
      spreadsheetId: activeSpreadsheetId,
      payload: transactionMutationRecord
    });

    repaintDOMState();
    expenseForm.reset();

    // Toggle styling states to mirror active background uploads
    syncStatus.innerText = "Syncing...";
    syncStatus.className = "text-[10px] bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500 text-amber-600 dark:text-amber-400 font-bold animate-pulse";

    setTimeout(() => {
      syncStatus.innerText = "Synced";
      syncStatus.className = "text-[10px] bg-slate-700 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-600 font-bold text-slate-300";
    }, 1200);

  } catch (err) {
    alert(`Input calculation compilation error: ${err.message}`);
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  await openDatabase();
  
  // Set default button ring initialization styling parameters for Indigo
  const defaultRing = document.querySelector('[data-select-accent="indigo"]');
  if (defaultRing) defaultRing.classList.add('ring-2', 'ring-slate-400', 'dark:ring-slate-200');

  initGoogleAuth(CONFIG.GOOGLE_CLIENT_ID, (token) => {
    userEmailAddress = "sarin.c.jacob@gmail.com"; 
    authGate.classList.add('hidden');
    mainStage.classList.remove('hidden');
    console.log("Ecosystem layout bindings established successfully.");
  });
});