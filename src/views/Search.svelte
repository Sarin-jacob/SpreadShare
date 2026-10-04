<script>
  // Search every group on this device: titles, notes, people, categories, amounts and #tags.
  import { untrack } from 'svelte';
  import { app, groupName } from '../lib/app.svelte.js';
  import { loadAllEvents, eventsByGroup } from '../lib/cache.svelte.js';
  import { computeLedgerState, displayName } from '../lib/engine.js';
  import { category } from '../lib/categories.js';
  import { tagsOf, tagCounts, splitTags } from '../lib/tags.js';
  import { memberEffect } from '../lib/statement.js';
  import { money, shortDate } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';

  let { query = {} } = $props();

  const me = app.user.email;
  // Seeded once from the URL; afterwards the URL follows these (see below).
  let q = $state(untrack(() => query.q) || '');
  let onlyMine = $state(untrack(() => query.mine) === '1');
  let entries = $state.raw([]); // [{ groupId, x, profiles }]
  let loaded = $state(false);
  let inputEl = $state();

  $effect(() => {
    app.cacheVersion; // refresh when any group's data changes
    loadAllEvents().then((all) => {
      const out = [];
      for (const [groupId, events] of Object.entries(eventsByGroup(all))) {
        if (!app.directory.some((g) => g.id === groupId)) continue;
        const { expenses, profiles, currency } = computeLedgerState(events);
        for (const x of expenses) out.push({ groupId, x, profiles, currency: currency || undefined });
      }
      entries = out.sort((a, b) => new Date(b.x.timestamp) - new Date(a.x.timestamp));
      loaded = true;
    });
  });

  // Keep the query in the URL (so back / share work) without adding history entries.
  $effect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (onlyMine) params.set('mine', '1');
    const qs = params.toString();
    const target = `/search${qs ? `?${qs}` : ''}`;
    if (`#${target}` !== location.hash) history.replaceState(null, '', `${location.pathname}${location.search}#${target}`);
  });

  $effect(() => inputEl?.focus());

  const involvesMe = (x) => {
    const e = memberEffect(x, me);
    return e.paid > 0 || e.share > 0;
  };

  const results = $derived.by(() => {
    const text = q.trim().toLowerCase();
    const tagTerms = [...text.matchAll(/#([\p{L}\p{M}\p{N}_-]+)/gu)].map((m) => m[1]);
    const words = text.replace(/#[\p{L}\p{M}\p{N}_-]+/gu, ' ').split(/\s+/).filter(Boolean);
    if (!text && !onlyMine) return [];
    return entries.filter(({ x, profiles }) => {
      if (onlyMine && !involvesMe(x)) return false;
      const tags = tagsOf(x.payload);
      if (tagTerms.some((t) => !tags.includes(t))) return false;
      if (!words.length) return true;
      const people = [x.payer, x.target, ...(x.payload.payers || []).map((p) => p.user), ...(x.payload.allocations || []).map((a) => a.user)]
        .filter(Boolean)
        .map((e) => `${e} ${profiles[e]?.name || ''}`);
      const cat = category(x.category);
      const hay = [x.title, x.payload.notes, cat.label, cat.value, String(x.amount), x.payload.receipt_scan?.merchant, ...people].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  });

  const totals = $derived.by(() => {
    let all = 0;
    let mine = 0;
    for (const { x, currency } of results) {
      if (x.type !== 'EXPENSE_ADD' || currency) continue; // totals in the default currency only
      all += x.amount;
      mine += memberEffect(x, me).share;
    }
    return { all, mine };
  });

  // Results per group (count, expense total); tap one to see only that group.
  let groupFilter = $state(null);
  const byGroup = $derived.by(() => {
    const out = new Map();
    for (const { groupId, x, currency } of results) {
      const g = out.get(groupId) ?? { groupId, count: 0, total: 0, currency };
      g.count++;
      if (x.type === 'EXPENSE_ADD') g.total += x.amount;
      out.set(groupId, g);
    }
    return [...out.values()].sort((a, b) => b.count - a.count);
  });
  const visible = $derived(groupFilter && byGroup.some((g) => g.groupId === groupFilter) ? results.filter((r) => r.groupId === groupFilter) : results);

  const topTags = $derived(tagCounts(entries.map((e) => e.x)).slice(0, 12));
  const recent = $derived(entries.slice(0, 8));

  function toggleTag(t) {
    const token = `#${t}`;
    q = q.includes(token) ? q.replace(token, '').replace(/\s{2,}/g, ' ').trim() : `${q} ${token}`.trim();
  }
  const subtitle = (x, profiles) => {
    const n = (e) => displayName(e, profiles, me);
    if (x.type === 'TRANSFER') return `${n(x.payer)} paid ${n(x.target)}`;
    if (x.type === 'LOAN') return `${n(x.payer)} lent ${n(x.target)}`;
    return `${n(x.payload.payers?.[0]?.user || x.payer)} paid · ${category(x.category).label}`;
  };
</script>

{#snippet row({ groupId, x, profiles, currency })}
  {@const cat = x.type === 'EXPENSE_ADD' ? category(x.category) : category('Financial')}
  {@const shown = splitTags(x.title)}
  <li>
    <a href="#/g/{groupId}/e/{x.eventId}" class="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
      <span class="w-9 h-9 rounded-xl grid place-items-center text-lg shrink-0" style="background:{cat.color}22">{cat.icon}</span>
      <div class="flex-1 min-w-0">
        <div class="font-semibold truncate">{shown.text}</div>
        <div class="text-xs text-slate-500 truncate">{groupName(groupId)} · {subtitle(x, profiles)}</div>
        {#if tagsOf(x.payload).length}
          <div class="flex gap-1 mt-0.5">{#each tagsOf(x.payload).slice(0, 3) as t (t)}<span class="px-1.5 rounded-full text-[10px] font-semibold bg-accent-500/10 text-accent-700 dark:text-accent-300">#{t}</span>{/each}</div>
        {/if}
      </div>
      <div class="text-right shrink-0">
        <div class="text-sm font-bold tabular-nums">{money(x.amount, currency)}</div>
        <div class="text-[11px] text-slate-400">{shortDate(x.timestamp)}</div>
      </div>
    </a>
  </li>
{/snippet}

<div class="space-y-5">
  <h1 class="text-2xl font-black tracking-tight">Search</h1>

  <div class="flex items-center gap-2">
    <label class="relative flex-1">
      <Icon name="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input bind:this={inputEl} bind:value={q} type="search" class="field !pl-9" placeholder="Dinner, Asha, 450, #goa…" aria-label="Search all groups" />
    </label>
    <button
      class="btn !px-3 !py-2.5 shrink-0 text-xs border {onlyMine ? 'border-accent-500 bg-accent-500/10 text-accent-700 dark:text-accent-300' : 'border-slate-200 dark:border-slate-700 text-slate-500'}"
      aria-pressed={onlyMine}
      onclick={() => (onlyMine = !onlyMine)}
    >
      Involving me
    </button>
  </div>

  {#if topTags.length}
    <div class="flex flex-wrap gap-1.5">
      {#each topTags as { tag, count } (tag)}
        {@const on = q.toLowerCase().includes(`#${tag}`)}
        <button
          class="px-2.5 py-1 rounded-full text-xs font-semibold border transition {on ? 'border-accent-500 bg-accent-500/15 text-accent-700 dark:text-accent-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}"
          onclick={() => toggleTag(tag)}
        >
          #{tag} <span class="text-slate-400 font-normal">{count}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if !loaded}
    <div class="card h-24 animate-pulse"></div>
  {:else if q.trim() || onlyMine}
    <p class="text-xs text-slate-500 px-1">
      {results.length} result{results.length === 1 ? '' : 's'}
      {#if totals.all}· {money(totals.all)} in expenses · your share {money(totals.mine)}{/if}
    </p>
    {#if byGroup.length > 1}
      <div class="flex flex-wrap gap-1.5">
        {#each byGroup as g (g.groupId)}
          {@const on = groupFilter === g.groupId}
          <button
            class="px-2.5 py-1 rounded-full text-xs font-semibold border transition {on ? 'border-accent-500 bg-accent-500/15 text-accent-700 dark:text-accent-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}"
            aria-pressed={on}
            onclick={() => (groupFilter = on ? null : g.groupId)}
          >
            {groupName(g.groupId)} <span class="font-normal text-slate-400">· {g.count}{g.total ? ` · ${money(g.total, g.currency, { decimals: 0 })}` : ''}</span>
          </button>
        {/each}
      </div>
    {/if}
    {#if visible.length}
      <ul class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
        {#each visible.slice(0, 200) as r (r.groupId + r.x.eventId)}{@render row(r)}{/each}
      </ul>
      {#if visible.length > 200}<p class="text-xs text-center text-slate-400">Showing the newest 200. Narrow your search to see more.</p>{/if}
    {:else}
      <p class="text-sm text-center text-slate-400 py-8">Nothing matches. Try fewer words, or a #tag.</p>
    {/if}
  {:else if recent.length}
    <section class="space-y-2">
      <h2 class="label px-1">Recent across your groups</h2>
      <ul class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
        {#each recent as r (r.groupId + r.x.eventId)}{@render row(r)}{/each}
      </ul>
      <p class="text-xs text-slate-400 px-1">Tip: add #tags like #goa or #office to a title or note to group entries across groups.</p>
    </section>
  {:else}
    <p class="text-sm text-center text-slate-400 py-8">Nothing here yet. Expenses from your groups show up once they've synced.</p>
  {/if}
</div>
