<script>
  import { app, pendingIds, logout, processQueue, rebuildCache, loadDirectory } from '../lib/app.svelte.js';
  import { settings, setDark, setOled, setAccent, setScale, ACCENTS, SCALES } from '../lib/settings.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import Avatar from '../components/Avatar.svelte';
  import Icon from '../components/Icon.svelte';
  import Switch from '../components/Switch.svelte';

  let busy = $state(false);

  async function syncNow() {
    busy = true;
    await loadDirectory();
    await processQueue();
    busy = false;
    toast(pendingIds.size ? `${pendingIds.size} entries still waiting` : 'Everything is synced', pendingIds.size ? 'info' : 'success');
  }

  async function signOut() {
    const warn = pendingIds.size
      ? `\n\n⚠️ ${pendingIds.size} entries haven't synced yet and will be lost.`
      : '';
    if (!confirm(`Sign out of SpreadShare? Your data stays in Google Drive.${warn}`)) return;
    await logout();
  }
</script>

<div class="space-y-5">
  <h1 class="text-2xl font-black tracking-tight">Settings</h1>

  <div class="card p-4 flex items-center gap-4">
    <Avatar email={app.user.email} profile={app.user} size="w-14 h-14" />
    <div class="min-w-0">
      <div class="font-bold text-lg truncate">{app.user.name || app.user.email}</div>
      <div class="text-sm text-slate-500 truncate">{app.user.email}</div>
    </div>
  </div>

  <section class="card divide-y divide-slate-100 dark:divide-slate-700/60">
    <div class="p-4 space-y-3">
      <h2 class="text-sm font-bold">Accent colour</h2>
      <div class="grid grid-cols-6 gap-3 justify-items-center">
        {#each Object.entries(ACCENTS) as [key, hex] (key)}
          <button
            type="button"
            aria-label={key}
            aria-pressed={settings.accent === key}
            class="w-8 h-8 rounded-full transition ring-offset-2 ring-offset-white dark:ring-offset-slate-800 {settings.accent === key ? 'ring-2 ring-slate-400 dark:ring-slate-300 scale-110' : ''}"
            style="background:{hex}"
            onclick={() => setAccent(key)}
          ></button>
        {/each}
      </div>
    </div>
    <div class="p-4 flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-bold">Dark mode</div>
      </div>
      <Switch label="Dark mode" checked={settings.dark} onchange={setDark} />
    </div>
    <div class="p-4 flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-bold">Pure black (OLED)</div>
        <div class="text-xs text-slate-500">True black backgrounds in dark mode</div>
      </div>
      <Switch label="Pure black" checked={settings.oled} disabled={!settings.dark} onchange={setOled} />
    </div>
    <div class="p-4 flex items-center justify-between gap-4">
      <div class="text-sm font-bold">Text size</div>
      <div class="seg w-48">
        {#each SCALES as s}
          <button aria-pressed={settings.scale === s.value} onclick={() => setScale(s.value)}>{s.label}</button>
        {/each}
      </div>
    </div>
  </section>

  <section class="card divide-y divide-slate-100 dark:divide-slate-700/60">
    <div class="p-4 flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-bold">Sync</div>
        <div class="text-xs text-slate-500">
          {pendingIds.size ? `${pendingIds.size} entries waiting to upload` : 'All entries uploaded'}
          {#if app.sync.lastSyncedAt}· last refresh {new Date(app.sync.lastSyncedAt).toLocaleTimeString()}{/if}
        </div>
      </div>
      <button class="btn btn-soft !py-2 shrink-0" onclick={syncNow} disabled={busy || app.sync.authExpired}>
        <Icon name="refresh" class="w-4 h-4 {busy ? 'animate-spin' : ''}" /> Sync now
      </button>
    </div>
    <div class="p-4 flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-bold">Rebuild local cache</div>
        <div class="text-xs text-slate-500">Re-download from Google Sheets. Unsynced entries are kept.</div>
      </div>
      <button class="btn btn-soft !py-2 shrink-0" onclick={rebuildCache}>Rebuild</button>
    </div>
  </section>

  <section class="rounded-2xl p-4 bg-accent-500/5 border border-accent-500/20 text-sm space-y-1">
    <div class="font-bold flex items-center gap-2"><Icon name="shield" class="w-4 h-4 text-accent-500" /> Your data, your Drive</div>
    <p class="text-slate-600 dark:text-slate-400">
      SpreadShare has no server. Every group is a Google Sheet in your Drive's
      “SpreadShare_Workspaces” folder, and this app talks to Google directly from your device.
    </p>
  </section>

  <button class="btn btn-danger w-full !py-3" onclick={signOut}><Icon name="logout" class="w-4 h-4" /> Sign out</button>
</div>
