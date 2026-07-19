// src/js/components/GroupDirectory.js
import { store } from '../store.js';
import { LedgerService } from '../services/LedgerService.js';
import { AppRouter } from '../router.js';
import { getAllFromStore } from '../db.js';

export class GroupDirectory {
  constructor(containerElement) {
    this.container = containerElement;
    
    // Subscribe to global state changes
    this.unsubscribe = store.subscribe((state) => this.onStateChange(state));
    
    this.renderSkeleton();
    this.cacheDOM();
    this.attachListeners();
  }

  onStateChange(state) {
    // Only repaint if the dashboard is visible
    if (state.currentView !== 'dashboard') return;
    this.updateUI(state);
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="space-y-4 animate-fade-in pb-8">
        <!-- Group Ledger Creator Form Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-3">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Spawn New Group Ledger</h3>
          <div class="flex space-x-2">
            <input type="text" id="dir-new-name" placeholder="e.g., Shared Flat, EuroTrip 2026..." class="flex-grow bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none focus:border-accent-500 text-slate-900 dark:text-slate-100">
            <button id="dir-btn-create" class="bg-accent-600 dark:bg-accent-500 text-white dark:text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 cursor-pointer whitespace-nowrap transition-all">
              Create Room
            </button>
          </div>
        </div>

        <!-- Directories Row Output Stream Stack -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Active Group Directories</h3>
          <div id="dir-items-container" class="grid gap-2"></div>
        </div>
      </div>
    `;
  }

  cacheDOM() {
    this.$nameInput = this.container.querySelector('#dir-new-name');
    this.$createBtn = this.container.querySelector('#dir-btn-create');
    this.$listContainer = this.container.querySelector('#dir-items-container');
  }

  attachListeners() {
    // 1. Create new group
    this.$createBtn.addEventListener('click', () => this.createNewGroup());
    
    // Allow pressing "Enter" in the input field to create
    this.$nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createNewGroup();
    });

    // 2. Select a group (Event Delegation)
    this.$listContainer.addEventListener('click', (e) => {
      const itemRow = e.target.closest('[data-group-id]');
      if (!itemRow) return;

      const groupId = itemRow.getAttribute('data-group-id');
      const groupName = itemRow.getAttribute('data-group-name');
      this.selectGroup(groupId, groupName);
    });
  }

  updateUI(state) {
    if (!state.directory || state.directory.length === 0) {
      this.$listContainer.innerHTML = `
        <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <p class="text-xs text-slate-400">No active rooms found. Provide a title above to spawn a ledger workspace.</p>
        </div>`;
      return;
    }

    this.$listContainer.innerHTML = state.directory.map(group => `
      <div data-group-id="${group.id}" data-group-name="${group.name}" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center shadow-2xs group hover:border-accent-500/40 transition-all cursor-pointer">
        <div class="max-w-[85%]">
          <h4 class="font-bold text-slate-800 dark:text-slate-200 group-hover:text-accent-500 transition-colors truncate">${group.name}</h4>
          <p class="text-[9px] font-mono text-slate-400 mt-0.5 truncate">Ref Token: ${group.id}</p>
        </div>
        <svg class="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </div>
    `).join('');
  }

  /**
   * Provisions a new Google Sheet and links it to the user's directory.
   */
  async createNewGroup() {
    const groupName = this.$nameInput.value.trim();
    if (!groupName) return;

    try {
      this.$nameInput.disabled = true;
      this.$createBtn.disabled = true;
      this.$createBtn.innerText = 'Creating...';

      // 1. Provision infrastructure on Google Drive/Sheets
      const folderId = await LedgerService.getOrCreateRootFolder();
      const sheetId = await LedgerService.createGroupSpreadsheet(groupName, folderId);

      // 2. Update local and remote directories
      const currentState = store.getState();
      const newDirectory = [...currentState.directory, { id: sheetId, name: groupName }];
      
      await LedgerService.syncUserConfigRegistry(newDirectory);
      store.setState({ directory: newDirectory });

      // 3. Automatically select the newly created group
      await this.selectGroup(sheetId, groupName);

      // 4. Log the initial MEMBER_JOINED event onto the ledger
      await LedgerService.appendLocalEvent(sheetId, 'MEMBER_JOINED', { 
        member_email: currentState.userProfile.email 
      });

      this.$nameInput.value = '';
    } catch (err) {
      alert(`Ecosystem Provision Error: ${err.message}`);
    } finally {
      this.$nameInput.disabled = false;
      this.$createBtn.disabled = false;
      this.$createBtn.innerText = 'Create Room';
    }
  }

  /**
   * Triggers the workspace load sequence when a user taps a group.
   */
  async selectGroup(spreadsheetId, groupName) {
    // 1. Update store immediately for fast UI response
    store.setState({ 
      activeGroupId: spreadsheetId, 
      activeGroupName: groupName 
    });

    // 2. Hydrate local state from IndexedDB instantly
    const allEvents = await getAllFromStore('group_events_cache');
    const groupEvents = allEvents.filter(evt => evt.spreadsheetId === spreadsheetId);
    store.setState({ groupEvents });

    // 3. Switch View
    AppRouter.navigate('group-detail');

    // 4. Trigger background network delta fetch to pull new rows from peers
    LedgerService.syncWorkspace(spreadsheetId);
  }

  destroy() {
    this.unsubscribe();
    this.container.innerHTML = '';
  }
}