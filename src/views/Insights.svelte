<script>
  import { app } from '../lib/app.svelte.js';
  import { loadAllEvents, eventsByGroup } from '../lib/cache.svelte.js';
  import { computeLedgerState } from '../lib/engine.js';
  import { memberEffect } from '../lib/statement.js';
  import { tagsOf } from '../lib/tags.js';
  import BudgetsCard from '../components/BudgetsCard.svelte';
  import { processAnalytics } from '../lib/insights.js';
  import { money } from '../lib/format.js';
  import Donut from '../components/Donut.svelte';
  import TrendChart from '../components/TrendChart.svelte';

  let days = $state(30);
  let events = $state.raw([]);
  let loaded = $state(false);

  $effect(() => {
    app.cacheVersion; // re-read whenever any group's cache changes
    loadAllEvents().then((all) => {
      events = all;
      loaded = true;
    });
  });

  const missing = $derived(app.directory.filter((g) => !app.groupSyncedAt[g.id] && !events.some((e) => e.spreadsheetId === g.id)).length);

  const me = app.user.email;
  const data = $derived(processAnalytics(events, me, days));
  const maxDay = $derived(Math.max(1, ...Object.values(data.dayOfWeek)));
  const avg = $derived(data.total / days);

  const byGroup = $derived.by(() => {
    const out = {};
    for (const g of app.directory) {
      const gEvents = events.filter((e) => e.spreadsheetId === g.id);
      const t = processAnalytics(gEvents, me, days).total;
      if (t > 0) out[g.id] = { name: g.name, total: t };
    }
    return Object.values(out).sort((a, b) => b.total - a.total);
  });

  /** Your share per #tag in the selected period. */
  const byTag = $derived.by(() => {
    const from = Date.now() - days * 86_400_000;
    const totals = new Map();
    for (const group of Object.values(eventsByGroup(events))) {
      for (const x of computeLedgerState(group).expenses) {
        if (x.type !== 'EXPENSE_ADD' || new Date(x.timestamp).getTime() < from) continue;
        const share = memberEffect(x, me).share;
        if (share > 0) for (const t of tagsOf(x.payload)) totals.set(t, (totals.get(t) || 0) + share);
      }
    }
    return [...totals].map(([tag, total]) => ({ tag, total })).sort((a, b) => b.total - a.total).slice(0, 8);
  });

  const RANGES = [
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: 365, label: '1 year' },
  ];
</script>

<div class="space-y-5">
  <div>
    <h1 class="text-2xl font-black tracking-tight">Insights</h1>
    <p class="text-sm text-slate-500 dark:text-slate-400">Your share of spending across all groups.</p>
  </div>

  <div class="seg">
    {#each RANGES as r}
      <button aria-pressed={days === r.value} onclick={() => (days = r.value)}>{r.label}</button>
    {/each}
  </div>

  <div class="rounded-2xl p-5 text-white bg-gradient-to-br from-slate-800 to-accent-900 overflow-hidden">
    <div class="text-xs font-semibold uppercase tracking-wider text-white/60">You spent</div>
    <div class="text-3xl font-black tabular-nums mt-1">{money(data.total)}</div>
    <div class="text-sm text-white/70">{data.count} expenses · ~{money(avg, undefined, { decimals: 0 })}/day</div>
    <div class="mt-4 -mx-1"><TrendChart points={data.trend} /></div>
  </div>

  {#if missing > 0}
    <p class="text-xs text-center text-slate-500 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2">
      {app.sync.progress ? `Downloading groups… ${app.sync.progress.done}/${app.sync.progress.total}` : `${missing} group${missing > 1 ? 's' : ''} not downloaded yet. Reconnect or tap sync.`}
    </p>
  {:else if loaded && data.count === 0}
    <p class="text-sm text-center text-slate-400 py-4">No expenses in this period.</p>
  {/if}

  {#if loaded}<BudgetsCard {events} email={me} />{/if}

  <div class="card p-4">
    <h2 class="label">By category</h2>
    <Donut data={data.categories} />
  </div>

  {#if byTag.length}
    <div class="card p-4 space-y-2">
      <h2 class="label">By tag</h2>
      {#each byTag as t (t.tag)}
        <a href="#/search?q={encodeURIComponent('#' + t.tag)}" class="flex items-center gap-3 text-sm">
          <span class="flex-1 truncate font-medium text-accent-700 dark:text-accent-300">#{t.tag}</span>
          <div class="w-1/3 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div class="h-full bg-accent-500 rounded-full" style="width:{(t.total / byTag[0].total) * 100}%"></div>
          </div>
          <span class="w-20 text-right font-semibold tabular-nums">{money(t.total, undefined, { decimals: 0 })}</span>
        </a>
      {/each}
    </div>
  {/if}

  {#if byGroup.length > 1}
    <div class="card p-4 space-y-2">
      <h2 class="label">By group</h2>
      {#each byGroup as g (g.name)}
        <div class="flex items-center gap-3 text-sm">
          <span class="flex-1 truncate">{g.name}</span>
          <div class="w-1/3 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div class="h-full bg-accent-500 rounded-full" style="width:{(g.total / data.total) * 100}%"></div>
          </div>
          <span class="w-20 text-right font-semibold tabular-nums">{money(g.total, undefined, { decimals: 0 })}</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="card p-4 space-y-2">
    <h2 class="label">By weekday</h2>
    {#each Object.entries(data.dayOfWeek) as [day, v] (day)}
      <div class="flex items-center gap-3 text-sm">
        <span class="w-9 text-slate-400 font-semibold">{day}</span>
        <div class="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div class="h-full bg-accent-500 rounded-full transition-[width] duration-500" style="width:{(v / maxDay) * 100}%"></div>
        </div>
        <span class="w-20 text-right font-semibold tabular-nums">{money(v, undefined, { decimals: 0 })}</span>
      </div>
    {/each}
  </div>
</div>
