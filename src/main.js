// src/main.js
import { CONFIG } from './js/config.js';
import { openDatabase } from './js/db.js';
import { store } from './js/store.js';
import { AuthService } from './js/auth.js';
import { LedgerService } from './js/services/LedgerService.js';
import { AppRouter } from './js/router.js';

// Import UI Class Components
import { GroupDirectory } from './js/components/GroupDirectory.js';
import { GroupDetail } from './js/components/GroupDetail.js';
import { ExpenseForm } from './js/components/ExpenseForm.js';
import { ExpenseDetail } from './js/components/ExpenseDetail.js';
import { Settings } from './js/components/Settings.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Core Infrastructure Boot
  await openDatabase();
  AppRouter.init();

  // 2. Instantiate UI Components (Injecting them into their respective container slots)
  const directoryComp = new GroupDirectory(document.getElementById('view-dashboard'));
  new GroupDetail(document.getElementById('view-group-detail'));
  const formComp = new ExpenseForm(document.getElementById('view-add-expense'));
  new ExpenseDetail(document.getElementById('view-expense-detail'));
  new Settings(document.getElementById('view-settings'));

  // 3. Connect the Header Sync Indicator to the Central Store
  const $syncIndicator = document.getElementById('sync-indicator');
  store.subscribe((state) => {
    if (!$syncIndicator) return;
    if (state.syncStatus === 'syncing') {
      $syncIndicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span class="text-amber-500 font-bold">Syncing Ledger...</span>`;
    } else {
      $syncIndicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-slate-500 dark:text-slate-400 font-medium">Cloud Mirror Live</span>`;
    }
  });

  // 4. Global Event Bridge: Routing an edit request from ExpenseDetail -> ExpenseForm
  window.addEventListener('request-edit-expense', (e) => {
    formComp.loadExpenseForEdit(e.detail);
  });

  // 5. Authentication & Application Boot Sequence
  const $authGate = document.getElementById('auth-gate');
  const $mainStage = document.getElementById('main-stage');
  const $authBtn = document.getElementById('auth-btn');

  // Prepare the Google Sign-In Client
  await AuthService.init(CONFIG.GOOGLE_CLIENT_ID);

  const launchApplication = async (profile) => {
    // Inject the authenticated user into the store
    store.setState({ userProfile: profile });
    
    // Transition UI
    $authGate.classList.add('hidden');
    $mainStage.classList.remove('hidden');

    // Fetch the remote group directory (or fallback to local)
    let directory = [];
    try {
      directory = await LedgerService.fetchUserConfigRegistry();
    } catch(e) {
      console.warn("Failed to fetch remote config registry. Booting with empty state.");
    }

    // Process collaborative Invite Links from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    const inviteName = urlParams.get('name');

    if (inviteId && inviteName) {
      // Clean up the URL instantly
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const alreadyJoined = directory.some(g => g.id === inviteId);
      if (!alreadyJoined) {
        store.setState({ syncStatus: 'syncing' });
        directory.push({ id: inviteId, name: inviteName });
        
        // Persist the new registry and log the join event to the ledger
        await LedgerService.syncUserConfigRegistry(directory);
        await LedgerService.appendLocalEvent(inviteId, 'MEMBER_JOINED', { member_email: profile.email });
        store.setState({ syncStatus: 'synced' });
      }
      
      store.setState({ directory });
      directoryComp.selectGroup(inviteId, inviteName);
    } else {
      // Standard Boot
      store.setState({ directory });
      
      // Auto-restore the last active session if one exists in the router hash
      const hash = window.location.hash.replace('#', '');
      if (hash === 'group-detail' && store.getState().activeGroupId) {
        // Detail view will automatically render due to state subscription
      } else {
        AppRouter.navigate('dashboard');
      }
    }

    // Trigger the background synchronization engine heartbeat
    setInterval(() => LedgerService.processOfflineQueue(), 10000);
  };

  // Bind the manual login button
  $authBtn.addEventListener('click', async () => {
    try {
      const { profile } = await AuthService.login();
      await launchApplication(profile);
    } catch (err) {
      alert('Authentication handshake failed.');
    }
  });

  // Automatically attempt to restore an active cache session
  const session = await AuthService.checkExistingSession();
  if (session) {
    await launchApplication(session.profile);
  }
});