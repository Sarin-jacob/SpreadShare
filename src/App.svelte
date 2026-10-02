<script>
  import { app, openGroup, login, pendingIds } from './lib/app.svelte.js';
  import { setBadge } from './lib/pwa.svelte.js';
  import { route } from './lib/router.svelte.js';
  import { toast } from './lib/toast.svelte.js';
  import Icon from './components/Icon.svelte';
  import Logo from './components/Logo.svelte';
  import Toasts from './components/Toasts.svelte';
  import SyncStatus from './components/SyncStatus.svelte';
  import Login from './views/Login.svelte';
  import Groups from './views/Groups.svelte';
  import Group from './views/Group.svelte';
  import ExpenseForm from './views/ExpenseForm.svelte';
  import ExpenseDetail from './views/ExpenseDetail.svelte';
  import Insights from './views/Insights.svelte';
  import Settings from './views/Settings.svelte';
  import Share from './views/Share.svelte';

  const seg = $derived(route.segments);
  const groupId = $derived(seg[0] === 'g' ? seg[1] : null);
  const isSubPage = $derived((seg[0] === 'g' && seg.length > 2) || seg[0] === 'share');

  $effect(() => {
    if (app.user && groupId) openGroup(groupId);
  });

  $effect(() => setBadge(pendingIds.size));

  const NAV = [
    { href: '#/', label: 'Groups', icon: 'groups', match: (s) => !s[0] || s[0] === 'g' },
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

{#if !app.booted}
  <div class="min-h-dvh grid place-items-center">
    <div class="w-8 h-8 rounded-full border-2 border-accent-500 border-t-transparent animate-spin"></div>
  </div>
{:else if !app.user}
  <Login />
{:else}
  <div class="md:flex max-w-6xl mx-auto min-h-dvh">
    <!-- Desktop sidebar -->
    <aside class="hidden md:flex md:w-60 shrink-0 flex-col gap-8 p-6 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-dvh">
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

      {#if app.sync.authExpired}
        <div class="mx-4 mt-4 md:mx-8 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <span class="flex-1 text-amber-800 dark:text-amber-200">
            Your Google session expired. Changes are saved on this device and will upload once you reconnect.
          </span>
          <button class="btn btn-primary !py-1.5 shrink-0" onclick={reconnect} disabled={reconnecting}>
            {reconnecting ? 'Connecting…' : 'Reconnect'}
          </button>
        </div>
      {/if}

      <main class="flex-1 w-full max-w-2xl mx-auto px-4 md:px-8 pt-4 md:pt-8 {isSubPage ? 'pb-10' : 'pb-28 md:pb-10'}">
        {#if seg[0] === 'g' && groupId}
          {#key groupId}
            {#if seg[2] === 'add'}
              <ExpenseForm {groupId} prefill={route.query} />
            {:else if seg[2] === 'e' && seg[3] && seg[4] === 'edit'}
              <ExpenseForm {groupId} editId={seg[3]} />
            {:else if seg[2] === 'e' && seg[3]}
              <ExpenseDetail {groupId} eventId={seg[3]} />
            {:else}
              <Group {groupId} />
            {/if}
          {/key}
        {:else if seg[0] === 'insights'}
          <Insights />
        {:else if seg[0] === 'share'}
          <Share />
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
          <a href={item.href} class="flex flex-col items-center gap-0.5 px-6 py-2 text-[11px] font-semibold {active ? 'text-accent-600 dark:text-accent-400' : 'text-slate-400'}">
            <Icon name={item.icon} />
            {item.label}
          </a>
        {/each}
      </div>
    </nav>
  {/if}
{/if}

<Toasts />
