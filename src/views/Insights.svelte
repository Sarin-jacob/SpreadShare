<script>
  import { app } from '../lib/app.svelte.js';
  import { loadAllEvents, eventsByGroup, inCurrency, currencyByGroup } from '../lib/cache.svelte.js';
  import { computeLedgerState } from '../lib/engine.js';
  import { memberEffect } from '../lib/statement.js';
  import { tagsOf } from '../lib/tags.js';
  import BudgetsCard from '../components/BudgetsCard.svelte';
  import { processAnalytics } from '../lib/insights.js';
  import { money } from '../lib/format.js';
  import { CONFIG } from '../lib/config.js';
  import Donut from '../components/Donut.svelte';
  import TrendChart from '../components/TrendChart.svelte';
  import MonthBars from '../components/MonthBars.svelte';
  import Avatar from '../components/Avatar.svelte';
  import { displayName } from '../lib/engine.js';
  import { category } from '../lib/categories.js';
  import { splitTags } from '../lib/tags.js';
  import { myExpenses, monthCompare, monthlyTrend, topPlaces, biggest, sharedWith, covered, monthCalendar, recurringPerMonth, withinDays } from '../lib/deepInsights.js';

  let days = $state(30);
  let events = $state.raw([]);
  let loaded = $state(false);
  let otherCurrency = $state(0); // groups in another currency, not in these totals

  $effect(() => {
    app.cacheVersion; // re-read whenever any group's cache changes
    loadAllEvents().then((all) => {
      // Totals only add up in one currency: groups kept in another one are left out (and counted).
      const cur = currencyByGroup(all);
      otherCurrency = Object.values(cur).filter((c) => c !== CONFIG.DEFAULT_CURRENCY).length;
      events = inCurrency(all);
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

  // ─── Deeper insights (your share of each expense) ───
  const groups = $derived(eventsByGroup(events));
  const rows = $derived(myExpenses(groups, me));
  const ranged = $derived(withinDays(rows, days));
  const month = $derived(monthCompare(rows));
  const trend6 = $derived(monthlyTrend(rows));
  const places = $derived(topPlaces(ranged));
  const big = $derived(biggest(ranged));
  const people = $derived(sharedWith(ranged, me));
  const cover = $derived(covered(ranged));
  const cal = $derived(monthCalendar(rows));
  const recurring = $derived(recurringPerMonth(rows));
  const profiles = $derived(Object.assign({}, ...Object.values(groups).map((g) => computeLedgerState(g).profiles)));
  const nameOf = (m) => displayName(m, profiles, me);
  const groupName = (id) => app.directory.find((g) => g.id === id)?.name || 'Group';
  const pct = (n) => `${Math.abs(Math.round(n * 100))}%`;
  const short = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const heat = (v) => (v <= 0 ? 0 : 0.2 + 0.8 * (v / Math.max(1, cal.max)));

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
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Your share of spending across all groups{otherCurrency ? ` in ${CONFIG.DEFAULT_CURRENCY} (${otherCurrency} group${otherCurrency > 1 ? 's' : ''} in other currencies not included)` : ''}.
    </p>
  </div>

  <div class="seg lg:max-w-md">
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

  <!-- This month (independent of the range above) -->
  {#if loaded && (month.soFar || month.lastFull)}
    <section class="card p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="label !mb-0">This month so far</h2>
          <div class="text-2xl font-black tabular-nums">{money(month.soFar, undefined, { decimals: 0 })}</div>
          {#if month.change != null}
            <div class="text-xs {month.change > 0.05 ? 'text-rose-600 dark:text-rose-400' : month.change < -0.05 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}">
              {month.change > 0.05 ? `▲ ${pct(month.change)} more` : month.change < -0.05 ? `▼ ${pct(month.change)} less` : 'About the same'} than by day {month.day} last month ({money(month.lastSamePoint, undefined, { decimals: 0 })})
            </div>
          {/if}
        </div>
        {#if month.forecast != null}
          <div class="text-right">
            <div class="text-[11px] text-slate-400">at this pace</div>
            <div class="font-bold tabular-nums">{money(month.forecast, undefined, { decimals: 0 })}</div>
            <div class="text-[11px] text-slate-400">by month end</div>
          </div>
        {/if}
      </div>
      <div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden" title="Day {month.day} of {month.days}">
        <div class="h-full bg-accent-500 rounded-full" style="width:{(month.day / month.days) * 100}%"></div>
      </div>
      {#if month.categories.some((c) => Math.abs(c.delta) >= 1)}
        <ul class="text-xs space-y-1">
          {#each month.categories.filter((c) => Math.abs(c.delta) >= 1).slice(0, 3) as c (c.category)}
            <li class="flex items-center gap-2">
              <span>{category(c.category).icon}</span>
              <span class="flex-1 truncate">{category(c.category).label}</span>
              <span class="tabular-nums {c.delta > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">{c.delta > 0 ? '+' : '−'}{money(Math.abs(c.delta), undefined, { decimals: 0 })}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="text-xs text-slate-400">
        Last month in total: {money(month.lastFull, undefined, { decimals: 0 })}{recurring.total ? ` · recurring: ${money(recurring.total, undefined, { decimals: 0 })} a month (${recurring.items.map((i) => i.title).slice(0, 3).join(', ')})` : ''}
      </p>
    </section>
  {/if}

  {#if missing > 0}
    <p class="text-xs text-center text-slate-500 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2">
      {app.sync.progress ? `Downloading groups… ${app.sync.progress.done}/${app.sync.progress.total}` : `${missing} group${missing > 1 ? 's' : ''} not downloaded yet. Reconnect or tap sync.`}
    </p>
  {:else if loaded && data.count === 0}
    <p class="text-sm text-center text-slate-400 py-4">No expenses in this period.</p>
  {/if}

  <div class="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
  {#if loaded}<BudgetsCard {events} email={me} />{/if}

  {#if trend6.some((m) => m.total)}
    <section class="card p-4">
      <h2 class="label">Last 6 months</h2>
      <MonthBars months={trend6} />
    </section>
  {/if}

  {#if cal.max > 0}
    <section class="card p-4 space-y-2">
      <h2 class="label !mb-0">{new Date().toLocaleDateString(undefined, { month: 'long' })}, day by day</h2>
      <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
        {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d, i (i)}<span>{d}</span>{/each}
        {#each Array(cal.offset) as _, i (i)}<span></span>{/each}
        {#each cal.values as v, i (i)}
          <span
            class="aspect-square rounded-md grid place-items-center text-[10px] tabular-nums {i + 1 === cal.today ? 'ring-2 ring-accent-500' : ''} {i + 1 > cal.today ? 'opacity-40' : ''}"
            style="background: color-mix(in srgb, var(--accent-500) {Math.round(heat(v) * 100)}%, transparent)"
            title="{i + 1}: {money(v, undefined, { decimals: 0 })}"
          >
            <span class={heat(v) > 0.6 ? 'text-white' : 'text-slate-500 dark:text-slate-400'}>{i + 1}</span>
          </span>
        {/each}
      </div>
      <p class="text-xs text-slate-400">{cal.values.filter((v) => v > 0).length} spending day{cal.values.filter((v) => v > 0).length === 1 ? '' : 's'} so far · {cal.values.slice(0, cal.today).filter((v) => !v).length} without spending</p>
    </section>
  {/if}

  {#if cover.paid > 0 || cover.share > 0}
    <section class="card p-4 space-y-2">
      <h2 class="label !mb-0">You paid vs. your share</h2>
      <div class="flex items-end gap-4">
        <div><div class="text-[11px] text-slate-400">You paid</div><div class="font-bold tabular-nums">{money(cover.paid, undefined, { decimals: 0 })}</div></div>
        <div><div class="text-[11px] text-slate-400">Your share</div><div class="font-bold tabular-nums">{money(cover.share, undefined, { decimals: 0 })}</div></div>
        <div class="ml-auto text-right">
          <div class="text-[11px] text-slate-400">{cover.covered >= 0 ? 'you covered for others' : 'others covered for you'}</div>
          <div class="text-lg font-black tabular-nums {cover.covered >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">{money(Math.abs(cover.covered), undefined, { decimals: 0 })}</div>
        </div>
      </div>
      <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex">
        <div class="h-full bg-accent-500" style="width:{(Math.min(cover.paid, cover.share) / Math.max(cover.paid, cover.share, 1)) * 100}%"></div>
        <div class="h-full {cover.covered >= 0 ? 'bg-emerald-400' : 'bg-amber-400'}" style="width:{(Math.abs(cover.covered) / Math.max(cover.paid, cover.share, 1)) * 100}%"></div>
      </div>
    </section>
  {/if}

  {#if places.length}
    <section class="card p-4 space-y-2">
      <h2 class="label">Where it went</h2>
      {#each places as p (p.name)}
        <div class="flex items-center gap-3 text-sm">
          <span class="w-6 text-center">{category(p.category).icon}</span>
          <span class="flex-1 min-w-0 truncate">{p.name} <span class="text-xs text-slate-400">· {p.count}×</span></span>
          <span class="font-semibold tabular-nums">{money(p.total, undefined, { decimals: 0 })}</span>
        </div>
      {/each}
    </section>
  {/if}

  {#if big.length}
    <section class="card p-4 space-y-2">
      <h2 class="label">Biggest expenses</h2>
      {#each big as r (r.groupId + r.x.eventId)}
        <a href="#/g/{r.groupId}/e/{r.x.eventId}" class="flex items-center gap-3 text-sm">
          <span class="w-6 text-center">{category(r.x.category).icon}</span>
          <span class="flex-1 min-w-0">
            <span class="block truncate font-medium">{splitTags(r.x.title).text}</span>
            <span class="block text-xs text-slate-400 truncate">{groupName(r.groupId)} · {short(r.date)}{r.share < r.x.amount ? ` · of ${money(r.x.amount, undefined, { decimals: 0 })}` : ''}</span>
          </span>
          <span class="font-semibold tabular-nums">{money(r.share, undefined, { decimals: 0 })}</span>
        </a>
      {/each}
    </section>
  {/if}

  {#if people.length}
    <section class="card p-4 space-y-2">
      <h2 class="label">Who you share with</h2>
      {#each people as p (p.member)}
        <div class="flex items-center gap-3 text-sm">
          <Avatar email={p.member} profile={profiles[p.member]} size="w-7 h-7" />
          <span class="flex-1 min-w-0 truncate">{nameOf(p.member)} <span class="text-xs text-slate-400">· {p.count} expense{p.count === 1 ? '' : 's'}</span></span>
          <span class="font-semibold tabular-nums" title="Your share of what you split with them">{money(p.together, undefined, { decimals: 0 })}</span>
        </div>
      {/each}
    </section>
  {/if}

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
</div>
