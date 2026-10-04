<script>
  import { app, createGroup } from '../lib/app.svelte.js';
  import { loadAllEvents, summarizeGroups, eventsByGroup } from '../lib/cache.svelte.js';
  import { upcomingRecurring } from '../lib/recurring.js';
  import { splitTags } from '../lib/tags.js';
  import { money, shortDate } from '../lib/format.js';
  import { CONFIG } from '../lib/config.js';
  import { CURRENCIES } from '../lib/currency.js';
  import { go } from '../lib/router.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import Icon from '../components/Icon.svelte';

  let name = $state('');
  let newCurrency = $state(CONFIG.DEFAULT_CURRENCY);
  let creating = $state(false);
  let summary = $state({}); // groupId → { net, lastActivity, count }
  let upcoming = $state([]); // recurring expenses due this week

  $effect(() => {
    app.cacheVersion; // re-read whenever any group's cache changes
    const email = app.user.email;
    loadAllEvents().then((all) => {
      summary = summarizeGroups(all, email);
      upcoming = upcomingRecurring(eventsByGroup(all)).filter((u) => app.directory.some((g) => g.id === u.groupId));
    });
  });

  const totals = $derived.by(() => {
    let owed = 0;
    let owe = 0;
    for (const g of app.directory) {
      // Only groups in your default currency add up; others show in their own currency below.
      if ((summary[g.id]?.currency || CONFIG.DEFAULT_CURRENCY) !== CONFIG.DEFAULT_CURRENCY) continue;
      const net = summary[g.id]?.net ?? 0;
      if (net > 0) owed += net;
      else owe -= net;
    }
    return { owed, owe, net: owed - owe };
  });

  /** Most recently active first; never-downloaded groups at the end. */
  const groups = $derived(
    [...app.directory].sort((a, b) => {
      const ta = summary[a.id]?.lastActivity ? new Date(summary[a.id].lastActivity).getTime() : 0;
      const tb = summary[b.id]?.lastActivity ? new Date(summary[b.id].lastActivity).getTime() : 0;
      return tb - ta;
    })
  );

  async function create(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (!navigator.onLine) return toast('You need to be online to create a group', 'error');
    creating = true;
    try {
      const id = await createGroup(n, newCurrency);
      name = '';
      newCurrency = CONFIG.DEFAULT_CURRENCY;
      go(`/g/${id}`);
    } catch (err) {
      toast(`Couldn't create group: ${err.message}`, 'error');
    } finally {
      creating = false;
    }
  }

  const firstName = $derived(app.user?.name?.split(' ')[0] || 'there');
</script>

<div class="space-y-6">
  <div class="flex items-start gap-3">
    <div class="flex-1 min-w-0">
      <h1 class="text-2xl font-black tracking-tight">Hi {firstName} 👋</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">Your shared expense groups.</p>
    </div>
    {#if app.directory.length}
      <a href="#/quick/add" class="btn btn-primary !py-2 shrink-0" title="Add to the group you used last">
        <Icon name="plus" class="w-4 h-4" /> Add expense
      </a>
    {/if}
  </div>

  {#if app.directory.length > 0}
    <div class="grid grid-cols-2 gap-3">
      <div class="card p-4">
        <div class="label !mb-0.5">You're owed</div>
        <div class="text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">{money(totals.owed)}</div>
      </div>
      <div class="card p-4">
        <div class="label !mb-0.5">You owe</div>
        <div class="text-xl font-black tabular-nums text-rose-600 dark:text-rose-400">{money(totals.owe)}</div>
      </div>
    </div>
  {/if}

  <form class="flex gap-2 lg:max-w-xl" onsubmit={create}>
    <input class="field flex-1 min-w-0" bind:value={name} placeholder="New group name, e.g. Goa Trip" maxlength="80" disabled={creating} />
    <select class="field !w-24 shrink-0" bind:value={newCurrency} disabled={creating} aria-label="Group currency" title="Currency the group's balances are kept in">
      {#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}
    </select>
    <button class="btn btn-primary shrink-0" disabled={creating || !name.trim()}>
      <Icon name="plus" class="w-4 h-4" />
      {creating ? 'Creating…' : 'Create'}
    </button>
  </form>

  {#if upcoming.length}
    <section class="card p-4 space-y-2">
      <h2 class="label !mb-0">🔁 Coming up this week</h2>
      <ul class="space-y-1.5">
        {#each upcoming as u (u.groupId + u.title + u.when)}
          {@const days = Math.round((new Date(u.when).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)}
          <li>
            <a href="#/g/{u.groupId}" class="flex items-center gap-3 text-sm">
              <span class="flex-1 min-w-0 truncate"><span class="font-medium">{splitTags(u.title).text}</span> <span class="text-slate-400">· {app.directory.find((g) => g.id === u.groupId)?.name}</span></span>
              <span class="text-xs text-slate-500 whitespace-nowrap">{days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}</span>
              <span class="font-semibold tabular-nums">{money(u.amount, u.currency || undefined, { decimals: 0 })}</span>
            </a>
          </li>
        {/each}
      </ul>
      <p class="text-[11px] text-slate-400">Added automatically on the day, split the same way.</p>
    </section>
  {/if}

  {#if app.directory.length === 0}
    <div class="text-center py-12 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
      <div class="text-4xl">🧾</div>
      <p class="font-semibold">No groups yet</p>
      <p class="text-sm text-slate-500 dark:text-slate-400">Create one above, or open an invite link a friend sent you.</p>
    </div>
  {:else}
    <ul class="grid gap-2 lg:grid-cols-2 lg:gap-3">
      {#each groups as group (group.id)}
        {@const s = summary[group.id]}
        {@const downloaded = !!s || !!app.groupSyncedAt[group.id]}
        {@const bal = s?.net ?? 0}
        <li>
          <a href="#/g/{group.id}" class="card p-4 flex items-center gap-3 hover:border-accent-500/50 transition group">
            <span class="w-11 h-11 rounded-xl grid place-items-center bg-accent-500/10 text-accent-600 dark:text-accent-400 font-black text-lg shrink-0">
              {group.name.charAt(0).toUpperCase()}
            </span>
            <div class="flex-1 min-w-0">
              <div class="font-bold truncate">{group.name}</div>
              <div class="text-xs mt-0.5 truncate">
                {#if !downloaded}
                  <span class="text-slate-400 animate-pulse">{app.sync.progress ? 'Downloading…' : 'Not downloaded yet'}</span>
                {:else if bal > 0.009}
                  <span class="text-emerald-600 dark:text-emerald-400 font-semibold">You're owed {money(bal, s.currency)}</span>
                {:else if bal < -0.009}
                  <span class="text-rose-600 dark:text-rose-400 font-semibold">You owe {money(-bal, s.currency)}</span>
                {:else}
                  <span class="text-slate-400">Settled up</span>
                {/if}
                {#if s?.lastActivity}<span class="text-slate-400"> · {shortDate(s.lastActivity)}</span>{/if}
                {#if group.unsynced}<span class="text-amber-500"> · not synced</span>{/if}
              </div>
            </div>
            <Icon name="chevron" class="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
