<script>
  // Stacked bars per month, one colour per category (largest at the bottom).
  import { category } from '../lib/categories.js';
  import { money } from '../lib/format.js';

  /** months: [{ month, label, total, byCategory }] oldest → newest */
  let { months = [] } = $props();
  let hover = $state(null);

  const max = $derived(Math.max(1, ...months.map((m) => m.total)));
  const order = $derived.by(() => {
    const totals = {};
    for (const m of months) for (const [c, v] of Object.entries(m.byCategory)) totals[c] = (totals[c] || 0) + v;
    return Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  });
  const shown = $derived(hover != null ? months[hover] : months.at(-1));
</script>

<div class="space-y-3">
  <div class="flex items-baseline justify-between text-sm">
    <span class="text-slate-500">{shown ? new Date(`${shown.month}-01T12:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : ''}</span>
    <span class="font-bold tabular-nums">{shown ? money(shown.total, undefined, { decimals: 0 }) : ''}</span>
  </div>
  <div class="flex items-end gap-2 h-32" role="img" aria-label="Your spending in the last {months.length} months">
    {#each months as m, i (m.month)}
      <button
        type="button"
        class="flex-1 h-full flex flex-col justify-end items-stretch group"
        onmouseenter={() => (hover = i)}
        onmouseleave={() => (hover = null)}
        onfocus={() => (hover = i)}
        onblur={() => (hover = null)}
        aria-label="{m.label}: {money(m.total, undefined, { decimals: 0 })}"
      >
        <div class="w-full flex flex-col-reverse rounded-md overflow-hidden {hover === i || (hover == null && i === months.length - 1) ? '' : 'opacity-70'}" style="height:{(m.total / max) * 100}%">
          {#each order as c (c)}
            {#if m.byCategory[c]}
              <div style="height:{(m.byCategory[c] / m.total) * 100}%; background:{category(c).color}" title="{category(c).label}: {money(m.byCategory[c], undefined, { decimals: 0 })}"></div>
            {/if}
          {/each}
        </div>
      </button>
    {/each}
  </div>
  <div class="flex gap-2 text-[11px] text-slate-400">
    {#each months as m (m.month)}<span class="flex-1 text-center">{m.label}</span>{/each}
  </div>
  {#if shown?.total}
    <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {#each order.filter((c) => shown.byCategory[c]) as c (c)}
        <span class="flex items-center gap-1 text-slate-600 dark:text-slate-300">
          <span class="w-2 h-2 rounded-full" style="background:{category(c).color}"></span>
          {category(c).label} <span class="tabular-nums text-slate-400">{money(shown.byCategory[c], undefined, { decimals: 0 })}</span>
        </span>
      {/each}
    </div>
  {/if}
</div>
