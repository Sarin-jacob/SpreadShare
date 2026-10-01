<script>
  import { category } from '../lib/categories.js';
  import { money } from '../lib/format.js';

  /** data: { [categoryValue]: amount } */
  let { data = {} } = $props();

  const R = 40;
  const C = 2 * Math.PI * R;

  const slices = $derived.by(() => {
    const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let offset = 0;
    return {
      total,
      items: entries.map(([key, value]) => {
        const len = total ? (value / total) * C : 0;
        const item = { key, value, cat: category(key), pct: total ? value / total : 0, len, offset };
        offset += len;
        return item;
      }),
    };
  });
</script>

{#if slices.items.length === 0}
  <p class="text-sm text-slate-400 py-6 text-center">No spending in this period.</p>
{:else}
  <div class="flex items-center gap-5">
    <svg viewBox="0 0 100 100" class="w-32 h-32 shrink-0 -rotate-90" role="img" aria-label="Spending by category">
      <circle cx="50" cy="50" r={R} fill="none" class="stroke-slate-100 dark:stroke-slate-700" stroke-width="14" />
      {#each slices.items as s (s.key)}
        <circle
          cx="50" cy="50" r={R} fill="none" stroke={s.cat.color} stroke-width="14"
          stroke-dasharray="{Math.max(s.len - 0.8, 0)} {C}"
          stroke-dashoffset={-s.offset}
        >
          <title>{s.cat.label}: {money(s.value)}</title>
        </circle>
      {/each}
    </svg>
    <ul class="flex-1 min-w-0 space-y-1.5">
      {#each slices.items as s (s.key)}
        <li class="flex items-center gap-2 text-xs">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:{s.cat.color}"></span>
          <span class="truncate flex-1 text-slate-600 dark:text-slate-300">{s.cat.icon} {s.cat.label}</span>
          <span class="text-slate-400 tabular-nums">{Math.round(s.pct * 100)}%</span>
          <span class="font-semibold tabular-nums">{money(s.value, undefined, { decimals: 0 })}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
