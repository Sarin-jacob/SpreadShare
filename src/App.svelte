<script>
  import { app, openGroup, login, refreshSession, pendingIds, syncAll, loadDirectory } from './lib/app.svelte.js';
  import { setBadge } from './lib/pwa.svelte.js';
  import { updates, applyUpdate } from './lib/updates.svelte.js';
  import { route } from './lib/router.svelte.js';
  import { ledger } from './lib/ledger.svelte.js';
  import { display } from './lib/display.svelte.js';
  import { CONFIG } from './lib/config.js';
  import { toast } from './lib/toast.svelte.js';
  import Icon from './components/Icon.svelte';
  import Logo from './components/Logo.svelte';
  import Toasts from './components/Toasts.svelte';
  import SyncStatus from './components/SyncStatus.svelte';
  import SidebarGroups from './components/SidebarGroups.svelte';
  import Login from './views/Login.svelte';
  import Groups from './views/Groups.svelte';
  import Group from './views/Group.svelte';
  import ExpenseForm from './views/ExpenseForm.svelte';
  import ExpenseDetail from './views/ExpenseDetail.svelte';
  import Insights from './views/Insights.svelte';
  import Settings from './views/Settings.svelte';
  import Share from './views/Share.svelte';
  import Quick from './views/Quick.svelte';
  import Statement from './views/Statement.svelte';
  import Search from './views/Search.svelte';
  import Import from './views/Import.svelte';

  const seg = $derived(route.segments);
  const groupId = $derived(seg[0] === 'g' ? seg[1] : null);
  const isSubPage = $derived((seg[0] === 'g' && seg.length > 2) || seg[0] === 'share' || seg[0] === 'quick');
  // Pages with lists, tables and charts use the extra room on desktop; forms stay narrow.
  const widePage = $derived((seg[0] === 'g' && (seg.length === 2 || seg[2] === 'statement')) || seg[0] === 'insights' || !seg[0]);

  // ─── Pull to refresh (phones; list screens only) ───
  const PULL_TRIGGER = 64;
  const canPull = $derived(!seg[0] || seg[0] === 'insights' || (seg[0] === 'g' && seg.length === 2));
  let pull = $state(0);
  let refreshing = $state(false);
  let pullStart = null;

  function onTouchStart(e) {
    if (!app.user || !canPull || refreshing || window.scrollY > 0 || e.touches.length !== 1) return;
    if (e.target.closest?.('[role="dialog"], input, textarea, select')) return;
    pullStart = e.touches[0].clientY;
  }
  function onTouchMove(e) {
    if (pullStart == null) return;
    const dy = e.touches[0].clientY - pullStart;
    pull = dy > 0 && window.scrollY <= 0 ? Math.min(110, dy * 0.5) : 0;
  }
  async function onTouchEnd() {
    if (pullStart == null) return;
    pullStart = null;
    if (pull < PULL_TRIGGER) return (pull = 0);
    if (!navigator.onLine) {
      pull = 0;
      return toast('You’re offline. Changes will sync when you’re back.', 'info');
    }
    if (app.sync.authExpired && !(await refreshSession())) {
      pull = 0;
      return toast('Sign in to Google again to sync', 'info');
    }
    refreshing = true;
    pull = PULL_TRIGGER;
    navigator.vibrate?.(8);
    try {
      await loadDirectory();
      await syncAll();
      toast(app.sync.error ? 'Some groups couldn’t sync' : 'Up to date', app.sync.error ? 'error' : 'info');
    } finally {
      refreshing = false;
      pull = 0;
    }
  }

  $effect(() => {
    if (app.user && groupId) openGroup(groupId);
  });

  $effect(() => setBadge(pendingIds.size));

  // Amounts show in the open group's currency; pages across groups use the default currency.
  $effect.pre(() => {
    display.currency = (groupId && ledger.current.currency) || CONFIG.DEFAULT_CURRENCY;
  });

  const NAV = [
    { href: '#/', label: 'Groups', icon: 'groups', match: (s) => !s[0] || s[0] === 'g' },
    { href: '#/search', label: 'Search', icon: 'search', match: (s) => s[0] === 'search' },
    { href: '#/insights', label: 'Insights', icon: 'chart', match: (s) => s[0] === 'insights' },
    { href: '#/settings', label: 'Settings', icon: 'settings', match: (s) => s[0] === 'settings' },
  ];

  let reconnecting = $state(false);
  async function reconnect() {
    reconnecting = true;
    try {
      await login();
      toast('Reconnected to Google');
    } catch (e) {
      toast(e.message || 'Sign-in failed', 'error');
    } finally {
      reconnecting = false;
    }
  }
</script>

<svelte:window ontouchstart={onTouchStart} ontouchmove={onTouchMove} ontouchend={onTouchEnd} ontouchcancel={onTouchEnd} />

{#if !app.booted}
  <div class="min-h-dvh grid place-items-center">
    <div class="w-8 h-8 rounded-full border-2 border-accent-500 border-t-transparent animate-spin"></div>
  </div>
{:else if !app.user}
  <Login />
{:else}
  {#if pull > 0 || refreshing}
    <div class="md:hidden fixed left-1/2 top-14 z-40 -translate-x-1/2 pointer-events-none" style="transform: translate(-50%, {pull - 40}px)">
      <div class="w-10 h-10 rounded-full grid place-items-center bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 text-accent-600 dark:text-accent-400">
        <span class={refreshing ? 'animate-spin' : ''} style={refreshing ? '' : `transform: rotate(${pull * 4}deg); opacity: ${Math.min(1, pull / PULL_TRIGGER)}`}>
          <Icon name="refresh" class="w-5 h-5" />
        </span>
      </div>
    </div>
  {/if}

  <div class="md:flex max-w-7xl mx-auto min-h-dvh">
    <!-- Desktop sidebar -->
    <aside class="hidden md:flex md:w-60 shrink-0 flex-col gap-6 p-6 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-dvh">
      <a href="#/" class="flex items-center gap-2.5">
        <Logo class="w-8 h-8" />
        <span class="text-lg font-black tracking-tight">SpreadShare</span>
      </a>
      <nav class="space-y-1">
        {#each NAV as item}
          {@const active = item.match(seg)}
          <a
            href={item.href}
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition
              {active ? 'bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800'}"
          >
            <Icon name={item.icon} />
            {item.label}
          </a>
        {/each}
      </nav>
      <SidebarGroups active={groupId} />
      <div class="mt-auto"><SyncStatus /></div>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <header class="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-slate-50/85 dark:bg-slate-900/85 backdrop-blur border-b border-slate-200/70 dark:border-slate-800">
        <a href="#/" class="flex items-center gap-2">
          <Logo class="w-7 h-7" />
          <span class="font-black tracking-tight">SpreadShare</span>
        </a>
        <SyncStatus />
      </header>

      {#if app.sync.authExpired && app.sync.needsSignIn}
        <div class="mx-4 mt-4 md:mx-8 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <span class="flex-1 text-amber-800 dark:text-amber-200">
            Google needs you to sign in again. Your changes are saved on this device and will upload once you do.
          </span>
          <button class="btn btn-primary !py-1.5 shrink-0" data-auth-action onclick={reconnect} disabled={reconnecting}>
            {reconnecting ? 'Connecting…' : 'Reconnect'}
          </button>
        </div>
      {/if}

      {#if updates.available && !updates.dismissed}
        <div class="mx-4 mt-4 md:mx-8 flex items-center gap-3 rounded-xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm" role="status">
          <span class="flex-1">✨ A new version of SpreadShare is ready.</span>
          <button class="btn btn-ghost !py-1.5 !px-3 shrink-0" onclick={() => (updates.dismissed = true)}>Later</button>
          <button class="btn btn-primary !py-1.5 shrink-0" onclick={applyUpdate} disabled={updates.applying}>
            {updates.applying ? 'Updating…' : 'Update'}
          </button>
        </div>
      {/if}

      <main class="flex-1 w-full max-w-2xl {widePage ? 'lg:max-w-5xl' : ''} mx-auto px-4 md:px-8 pt-4 md:pt-8 {isSubPage ? 'pb-10' : 'pb-28 md:pb-10'}">
        {#if seg[0] === 'g' && groupId}
          {#key groupId}
            {#if seg[2] === 'add'}
              <ExpenseForm {groupId} prefill={route.query} />
            {:else if seg[2] === 'e' && seg[3] && seg[4] === 'edit'}
              <ExpenseForm {groupId} editId={seg[3]} />
            {:else if seg[2] === 'e' && seg[3]}
              <ExpenseDetail {groupId} eventId={seg[3]} />
            {:else if seg[2] === 'statement'}
              <Statement {groupId} query={route.query} />
            {:else if seg[2] === 'import'}
              <Import {groupId} />
            {:else}
              <Group {groupId} />
            {/if}
          {/key}
        {:else if seg[0] === 'insights'}
          <Insights />
        {:else if seg[0] === 'share'}
          <Share />
        {:else if seg[0] === 'search'}
          <Search query={route.query} />
        {:else if seg[0] === 'quick'}
          {#key seg[1]}<Quick action={seg[1] === 'scan' ? 'scan' : 'add'} />{/key}
        {:else if seg[0] === 'settings'}
          <Settings />
        {:else}
          <Groups />
        {/if}
      </main>
    </div>
  </div>

  <!-- Mobile bottom nav -->
  {#if !isSubPage}
    <nav class="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur pb-safe">
      <div class="flex justify-around">
        {#each NAV as item}
          {@const active = item.match(seg)}
          <a href={item.href} class="flex-1 flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-semibold {active ? 'text-accent-600 dark:text-accent-400' : 'text-slate-400'}">
            <Icon name={item.icon} />
            {item.label}
          </a>
        {/each}
      </div>
    </nav>
  {/if}
{/if}

<Toasts />
