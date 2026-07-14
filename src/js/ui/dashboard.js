// src/js/ui/dashboard.js

/**
 * Repaints the multi-group workspace directory list panel
 * @param {Array} groupDirectoryIndex - Array of mapped group objects { id, name }
 * @param {Function} onGroupClick - Callback router loop to load a clicked group context
 */
export function repaintGroupDirectoryUI(groupDirectoryIndex, onGroupClick) {
  const container = document.getElementById('groups-directory-list');
  if (!container) return;
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
      <div class="max-w-[85%]">
        <h4 class="font-bold text-slate-800 dark:text-slate-200 group-hover:text-accent-500 transition-colors truncate">${group.name}</h4>
        <p class="text-[9px] font-mono text-slate-400 mt-0.5 truncate">Ref Token: ${group.id}</p>
      </div>
      <svg class="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
    `;
    el.addEventListener('click', () => onGroupClick(group.id, group.name));
    container.appendChild(el);
  });
}