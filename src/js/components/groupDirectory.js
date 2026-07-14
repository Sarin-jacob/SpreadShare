// src/js/components/groupDirectory.js

export function mountGroupDirectoryComponent(containerElement, groupDirectoryIndex, onCreateGroup, onGroupSelect) {
  containerElement.innerHTML = `
    <div class="space-y-4 animate-fade-in">
      <!-- Group Ledger Creator Form Card -->
      <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-3">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Spawn New Group Ledger</h3>
        <div class="flex space-x-2">
          <input type="text" id="dir-new-name" placeholder="e.g., Shared Flat, EuroTrip 2026..." class="flex-grow bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none focus:border-accent-500 text-slate-900 dark:text-slate-100">
          <button id="dir-btn-create" class="bg-accent-600 dark:bg-accent-500 text-white dark:text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 cursor-pointer whitespace-nowrap">
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

  // Render the list of group items
  const $listContainer = document.getElementById('dir-items-container');
  if (groupDirectoryIndex.length === 0) {
    $listContainer.innerHTML = `
      <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
        <p class="text-xs text-slate-400">No active rooms found. Provide a title above to spawn a ledger workspace.</p>
      </div>`;
  } else {
    groupDirectoryIndex.forEach(group => {
      const row = document.createElement('div');
      row.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center shadow-2xs group hover:border-accent-500/40 transition-all cursor-pointer";
      row.innerHTML = `
        <div class="max-w-[85%]">
          <h4 class="font-bold text-slate-800 dark:text-slate-200 group-hover:text-accent-500 transition-colors truncate">${group.name}</h4>
          <p class="text-[9px] font-mono text-slate-400 mt-0.5 truncate">Ref Token: ${group.id}</p>
        </div>
        <svg class="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      `;
      row.addEventListener('click', () => onGroupSelect(group.id, group.name));
      $listContainer.appendChild(row);
    });
  }

  // Bind local creation action listeners
  document.getElementById('dir-btn-create').addEventListener('click', () => {
    const input = document.getElementById('dir-new-name');
    const targetName = input.value.trim();
    if (targetName) onCreateGroup(targetName, input);
  });
}