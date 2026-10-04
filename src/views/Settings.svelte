<script>
  import { app, pendingIds, logout, syncAll, rebuildCache, loadDirectory, publishUpi, grantPermissions } from '../lib/app.svelte.js';
  import { prefs, setUpi } from '../lib/prefs.svelte.js';
  import { isUpiId, normalizeUpiId } from '../lib/upi.js';
  import { lock, lockSupported, enableLock, disableLock, setLockAfter } from '../lib/lock.svelte.js';
  import { settings, setTheme, setOled, setAccent, setScale, ACCENTS, SCALES } from '../lib/settings.svelte.js';
  import { pwa, promptInstall } from '../lib/pwa.svelte.js';
  import { ocrOffline, downloadOcr, removeOcr } from '../lib/ocrOffline.svelte.js';
  import { updates, checkForUpdates, applyUpdate, reinstallApp, APP_VERSION, BUILD_ID, BUILD_TIME } from '../lib/updates.svelte.js';
  import Logo from '../components/Logo.svelte';
  import { toast } from '../lib/toast.svelte.js';
  import Avatar from '../components/Avatar.svelte';
  import Icon from '../components/Icon.svelte';
  import Switch from '../components/Switch.svelte';

  let busy = $state(false);

  let canLock = $state(null); // null while checking
  lockSupported().then((ok) => (canLock = ok));
  const LOCK_AFTER = [
    { value: 0, label: 'Right away' },
    { value: 1, label: '1 min' },
    { value: 5, label: '5 min' },
    { value: 15, label: '15 min' },
  ];

  async function toggleLock(on) {
    if (on) {
      if (await enableLock(app.user)) toast('App lock on');
      else if (lock.error && lock.error !== 'Cancelled') toast(lock.error, 'error');
    } else {
      disableLock();
      toast('App lock off', 'info');
    }
  }

  let reviewing = $state(false);
  async function reviewAccess() {
    reviewing = true;
    try {
      toast((await grantPermissions()) ? 'Google access is complete' : 'Some access is still missing. Tick every box on Google’s screen.', 'info');
    } catch (e) {
      toast(e.message || 'Google didn’t give access', 'error');
    } finally {
      reviewing = false;
    }
  }

  let upiInput = $state(prefs.upi || '');
  const upiChanged = $derived(normalizeUpiId(upiInput) !== (prefs.upi || ''));
  const upiValid = $derived(!upiInput.trim() || isUpiId(upiInput));

  async function saveUpi(e) {
    e.preventDefault();
    if (!upiValid) return;
    const value = upiInput.trim() ? normalizeUpiId(upiInput) : null;
    setUpi(value);
    upiInput = value || '';
    await publishUpi(value);
    toast(value ? 'UPI ID saved. Friends can now pay you from Settle up.' : 'UPI ID removed', 'success');
  }

  async function syncNow() {
    busy = true;
    await loadDirectory();
    await syncAll();
    busy = false;
    toast(pendingIds.size ? `${pendingIds.size} entries still waiting` : 'Everything is synced', pendingIds.size ? 'info' : 'success');
  }

  const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;

  async function getReader() {
    if (await downloadOcr()) toast('Receipt reader saved , scanning now works offline');
    else if (ocrOffline.error) toast(`Download failed: ${ocrOffline.error}`, 'error');
  }

  async function dropReader() {
    if (!confirm('Remove the receipt reader from this device? It will download again the next time you scan.')) return;
    await removeOcr();
    toast('Receipt reader removed', 'info');
  }

  const builtOn = new Date(BUILD_TIME).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  async function checkUpdates() {
    if (await checkForUpdates()) return; // the Update button appears
    toast('You’re on the latest version', 'info');
  }

  async function reinstall() {
    if (!confirm('Reinstall SpreadShare? The app’s files are downloaded again and it restarts.\n\nYour groups, unsynced entries, settings and the receipt reader stay on this device.')) return;
    try {
      await reinstallApp();
    } catch (e) {
      toast(e.message, 'error');
    }
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

  <form class="card p-4 space-y-2" onsubmit={saveUpi}>
    <label class="text-sm font-bold" for="upi-id">Your UPI ID</label>
    <p class="text-xs text-slate-500">Shared with your groups so people who owe you can pay in one tap from Settle up. Also added to your reminders.</p>
    <div class="flex gap-2">
      <input id="upi-id" class="field flex-1" bind:value={upiInput} placeholder="name@okbank" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="email" />
      <button class="btn btn-primary shrink-0" disabled={!upiChanged || !upiValid}>Save</button>
    </div>
    {#if !upiValid}<p class="text-xs text-rose-600 dark:text-rose-400">That doesn’t look like a UPI ID (name@bank).</p>{/if}
  </form>

  <section class="card divide-y divide-slate-100 dark:divide-slate-700/60">
    <div class="p-4 flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-bold">Lock with fingerprint or face</div>
        <div class="text-xs text-slate-500">
          {#if canLock === false}
            This device has no fingerprint, face or PIN unlock that the browser can use.
          {:else}
            Asks for your device unlock (fingerprint, face or PIN) when you open SpreadShare. Keeps people who pick up your phone out of the app; it doesn’t encrypt what’s stored on this device.
          {/if}
        </div>
      </div>
      <Switch label="App lock" checked={lock.enabled} disabled={!canLock || lock.busy} onchange={toggleLock} />
    </div>
    {#if lock.enabled}
      <div class="p-4 flex items-center justify-between gap-4">
        <div class="text-sm font-bold whitespace-nowrap">Lock again after</div>
        <div class="seg !p-0.5 flex-1 max-w-xs">
          {#each LOCK_AFTER as o (o.value)}
            <button aria-pressed={lock.after === o.value} onclick={() => setLockAfter(o.value)}>{o.label}</button>
          {/each}
        </div>
      </div>
    {/if}
  </section>

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
          {pwa.canPrompt ? 'Add it to your home screen , works offline.' : 'Tap Share, then “Add to Home Screen”.'}
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
              {#if ocrOffline.persisted === false}
                <span class="block text-amber-600 dark:text-amber-400">Your browser may clear it when storage runs low{pwa.installed ? '' : '. Installing the app keeps it safer'}; it downloads again if that happens.</span>
              {/if}
            {:else if ocrOffline.status === 'downloading'}
              Downloading… {Math.round(ocrOffline.progress * 100)}%
            {:else if ocrOffline.status === 'error'}
              <span class="text-rose-500">{ocrOffline.error}</span>
            {:else if ocrOffline.evicted}
              <span class="text-amber-600 dark:text-amber-400">Your browser cleared it to free up space. {navigator.onLine ? 'It will download again shortly.' : 'It downloads again when you’re online.'}</span>
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

  <section class="card divide-y divide-slate-100 dark:divide-slate-700/60">
    <div class="p-4 flex items-center gap-4">
      <Logo class="w-11 h-11" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold">SpreadShare {APP_VERSION}</div>
        <div class="text-xs text-slate-500 truncate" title={BUILD_ID}>
          {#if updates.available}
            <span class="text-accent-600 dark:text-accent-400 font-semibold">A new version is ready</span>
          {:else}
            Built {builtOn} · {BUILD_ID.split('-')[1] ?? ''}
          {/if}
        </div>
      </div>
      {#if updates.available}
        <button class="btn btn-primary !py-2 shrink-0" onclick={applyUpdate} disabled={updates.applying}>
          {updates.applying ? 'Updating…' : 'Update now'}
        </button>
      {:else if updates.supported}
        <button class="btn btn-soft !py-2 shrink-0" onclick={checkUpdates} disabled={updates.checking || !app.sync.online}>
          <Icon name="refresh" class="w-4 h-4 {updates.checking ? 'animate-spin' : ''}" /> {updates.checking ? 'Checking…' : 'Check for updates'}
        </button>
      {/if}
    </div>
    {#if updates.supported}
      <div class="p-4 flex items-center justify-between gap-4">
        <div>
          <div class="text-sm font-bold">Reinstall app</div>
          <div class="text-xs text-slate-500">Downloads the app fresh if something looks stuck or outdated. Your data stays.</div>
        </div>
        <button class="btn btn-soft !py-2 shrink-0" onclick={reinstall} disabled={updates.applying || !app.sync.online}>Reinstall</button>
      </div>
    {/if}
  </section>

  <section class="rounded-2xl p-4 bg-accent-500/5 border border-accent-500/20 text-sm space-y-1">
    <div class="font-bold flex items-center gap-2"><Icon name="shield" class="w-4 h-4 text-accent-500" /> Your data, your Drive</div>
    <p class="text-slate-600 dark:text-slate-400">
      SpreadShare has no server. Every group is a Google Sheet in your Drive's
      “SpreadShare_Workspaces” folder, and this app talks to Google directly from your device.
    </p>
    <div class="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="flex-1 min-w-0 text-xs {app.sync.missingScopes.length ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-slate-500'}">
        {#if app.sync.missingScopes.length}
          Missing Google access: {app.sync.missingScopes.map((s) => (s === 'sheets' ? 'Sheets' : 'Drive files')).join(' and ')}
        {:else}
          ✓ Access to Google Sheets and to the Drive files SpreadShare creates
        {/if}
      </span>
      <button class="text-xs font-semibold text-accent-600 dark:text-accent-400" data-auth-action onclick={reviewAccess} disabled={reviewing}>
        {app.sync.missingScopes.length ? 'Give access' : 'Review access'}
      </button>
      <a class="text-xs text-slate-500 underline underline-offset-2" href="https://myaccount.google.com/connections" target="_blank" rel="noopener">Manage on Google</a>
    </div>
  </section>

  <button class="btn btn-danger w-full !py-3" onclick={signOut}><Icon name="logout" class="w-4 h-4" /> Sign out</button>
</div>
