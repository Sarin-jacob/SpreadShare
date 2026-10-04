<script>
  import { app, pendingIds, syncAll } from '../lib/app.svelte.js';

  const status = $derived.by(() => {
    if (app.sync.missingScopes?.length) return { dot: 'bg-amber-500', label: 'Needs Google access' };
    if (app.sync.reconnecting) return { dot: 'bg-accent-500 animate-pulse', label: 'Reconnecting…' };
    if (app.sync.authExpired) {
      return { dot: 'bg-amber-500', label: app.sync.needsSignIn ? 'Sign-in needed' : pendingIds.size ? `${pendingIds.size} waiting · tap to sync` : 'Tap to sync' };
    }
    if (!app.sync.online) {
      return { dot: 'bg-slate-400', label: pendingIds.size ? `Offline · ${pendingIds.size} pending` : 'Offline' };
    }
    if (app.sync.progress) {
      return { dot: 'bg-accent-500 animate-pulse', label: `Syncing ${app.sync.progress.done}/${app.sync.progress.total}` };
    }
    if (app.sync.busy > 0) return { dot: 'bg-accent-500 animate-pulse', label: 'Syncing…' };
    if (app.sync.error) return { dot: 'bg-rose-500', label: 'Sync issue' };
    if (pendingIds.size) return { dot: 'bg-amber-500', label: `${pendingIds.size} pending` };
    return { dot: 'bg-emerald-500', label: 'Synced' };
  });
</script>

<button
  type="button"
  onclick={() => syncAll()}
  title={app.sync.error || 'Sync now'}
  class="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400"
>
  <span class="w-2 h-2 rounded-full {status.dot}"></span>
  {status.label}
</button>
