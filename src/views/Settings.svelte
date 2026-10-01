<script>
  import { app, pendingIds, logout, syncAll, rebuildCache, loadDirectory } from '../lib/app.svelte.js';
  import { settings, setTheme, setOled, setAccent, setScale, ACCENTS, SCALES } from '../lib/settings.svelte.js';
  import { pwa, promptInstall } from '../lib/pwa.svelte.js';
  import { ocrOffline, downloadOcr, removeOcr } from '../lib/ocrOffline.svelte.js';
  import Logo from '../components/Logo.svelte';
  import { toast } from '../lib/toast.svelte.js';
  import Avatar from '../components/Avatar.svelte';
  import Icon from '../components/Icon.svelte';
  import Switch from '../components/Switch.svelte';

  let busy = $state(false);

  async function syncNow() {
    busy = true;
    await loadDirectory();
    await syncAll();
    busy = false;
    toast(pendingIds.size ? `${pendingIds.size} entries still waiting` : 'Everything is synced', pendingIds.size ? 'info' : 'success');
  }

  const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;

  async function getReader() {
    if (await downloadOcr()) toast('Receipt reader saved — scanning now works offline');
    else if (ocrOffline.error) toast(`Download failed: ${ocrOffline.error}`, 'error');
  }

  async function dropReader() {
    if (!confirm('Remove the receipt reader from this device? It will download again the next time you scan.')) return;
    await removeOcr();
    toast('Receipt reader removed', 'info');
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
      <div class="flex items-center gap-3">
        <Logo class="w-12 h-12" />
        <div>
          <h2 class="text-sm font-bold">Accent colour</h2>
          <p class="text-xs text-slate-500">Also recolours the app icon.</p>
        </div>
      </div>
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
      <div class="text-sm font-bold whitespace-nowrap">Theme</div>
      <div class="seg w-56">
        {#each [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']] as [value, label]}
          <button aria-pressed={settings.theme === value} onclick={() => setTheme(value)}>{label}</button>
        {/each}
      </div>
    </div>
    <div class="p-4 flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-bold">Pure black (OLED)</div>
        <div class="text-xs text-slate-500">True black backgrounds in dark mode</div>
      </div>
      <Switch label="Pure black" checked={settings.oled} disabled={!settings.dark} onchange={setOled} />
    </div>
    <div class="p-4 flex items-center justify-between gap-4">
      <div class="text-sm font-bold whitespace-nowrap">Text size</div>
      <div class="seg w-48">
        {#each SCALES as s}
          <button aria-pressed={settings.scale === s.value} onclick={() => setScale(s.value)}>{s.label}</button>
        {/each}
      </div>
    </div>
  </section>

  {#if !pwa.installed && (pwa.canPrompt || pwa.showIosHint)}
    <section class="card p-4 flex items-center gap-4">
      <Logo class="w-11 h-11" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold">Install SpreadShare</div>
        <div class="text-xs text-slate-500">
          {pwa.canPrompt ? 'Add it to your home screen — works offline.' : 'Tap Share, then “Add to Home Screen”.'}
        </div>
      </div>
      {#if pwa.canPrompt}
        <button class="btn btn-primary !py-2 shrink-0" onclick={promptInstall}>Install</button>
      {/if}
    </section>
  {/if}

  {#if ocrOffline.status !== 'unsupported'}
    <section class="card p-4 space-y-3">
      <div class="flex items-center gap-4">
        <span class="w-11 h-11 rounded-xl grid place-items-center bg-accent-500/10 text-accent-600 dark:text-accent-400 shrink-0"><Icon name="scan" /></span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold">Receipt reader</div>
          <div class="text-xs text-slate-500">
            {#if ocrOffline.status === 'ready'}
              ✓ On this device{ocrOffline.bytes ? ` · ${mb(ocrOffline.bytes)}` : ''} · scanning works offline
            {:else if ocrOffline.status === 'downloading'}
              Downloading… {Math.round(ocrOffline.progress * 100)}%
            {:else if ocrOffline.status === 'error'}
              <span class="text-rose-500">{ocrOffline.error}</span>
            {:else if ocrOffline.status === 'checking'}
              Checking…
            {:else}
              Download once (~67 MB) to scan receipts offline{pwa.installed ? '' : '. Installed apps get it automatically'}
            {/if}
          </div>
        </div>
        {#if ocrOffline.status === 'ready'}
          <button class="btn btn-ghost !py-2 shrink-0 text-xs" onclick={dropReader}>Remove</button>
        {:else if ocrOffline.status === 'missing' || ocrOffline.status === 'error'}
          <button class="btn btn-soft !py-2 shrink-0" onclick={getReader} disabled={!app.sync.online}>
            <Icon name="download" class="w-4 h-4" /> {ocrOffline.status === 'error' ? 'Retry' : 'Download'}
          </button>
        {/if}
      </div>
      {#if ocrOffline.status === 'downloading'}
        <div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div class="h-full bg-accent-500 rounded-full transition-[width] duration-300" style="width:{Math.max(3, ocrOffline.progress * 100)}%"></div>
        </div>
      {/if}
    </section>
  {/if}

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
