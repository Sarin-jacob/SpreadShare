<script>
  // This month's budgets (your share), with an editor. Budgets sync to your Drive (prefs.svelte.js).
  import { prefs, setBudget } from '../lib/prefs.svelte.js';
  import { budgetStatus, monthToDate, monthProgress } from '../lib/budgets.js';
  import { CATEGORIES, category } from '../lib/categories.js';
  import { money } from '../lib/format.js';
  import Icon from './Icon.svelte';

  /** events: all cached events; email: the signed-in user */
  let { events, email } = $props();

  let editing = $state(false);
  const data = $derived(monthToDate(events, email));
  const rows = $derived(budgetStatus(prefs.budgets, data));
  const pace = $derived(monthProgress());
  const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });
  const daysLeft = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  })();

  const label = (c) => (c === '*' ? 'All spending' : category(c).label);
  const icon = (c) => (c === '*' ? '📊' : category(c).icon);
  const BAR = { ok: 'bg-emerald-500', near: 'bg-amber-500', over: 'bg-rose-500' };
  const TEXT = { ok: 'text-slate-500', near: 'text-amber-600 dark:text-amber-400', over: 'text-rose-600 dark:text-rose-400' };
  const EDIT_ROWS = [{ value: '*' }, ...CATEGORIES.filter((c) => c.value !== 'General')];
</script>

<section class="card p-4 space-y-3">
  <div class="flex items-center justify-between gap-2">
    <h2 class="label !mb-0">Budgets · {monthName}</h2>
    <button class="text-xs font-semibold text-accent-600 dark:text-accent-400 flex items-center gap-1" onclick={() => (editing = !editing)}>
      {#if editing}<Icon name="check" class="w-3.5 h-3.5" /> Done{:else}<Icon name="edit" class="w-3.5 h-3.5" /> {rows.length ? 'Edit' : 'Set budgets'}{/if}
    </button>
  </div>

  {#if editing}
    <p class="text-xs text-slate-500">Monthly limits on your share. Leave blank for no limit. Saved to your Drive, so they follow you to other devices.</p>
    <ul class="space-y-2">
      {#each EDIT_ROWS as c (c.value)}
        <li class="flex items-center gap-3">
          <span class="w-6 text-center">{icon(c.value)}</span>
          <label class="flex-1 text-sm" for="budget-{c.value}">{label(c.value)}</label>
          <input
            id="budget-{c.value}"
            class="field !w-32 !py-1.5 text-right tabular-nums"
            inputmode="decimal"
            placeholder="No limit"
            value={prefs.budgets[c.value] ?? ''}
            onchange={(e) => setBudget(c.value, e.currentTarget.value.replace(/[^\d.]/g, ''))}
          />
        </li>
      {/each}
    </ul>
  {:else if rows.length === 0}
    <p class="text-sm text-slate-500">Set a monthly limit for food, travel or everything. You'll get a heads-up when you get close.</p>
  {:else}
    <ul class="space-y-3">
      {#each rows as r (r.category)}
        <li class="space-y-1">
          <div class="flex items-baseline gap-2 text-sm">
            <span>{icon(r.category)}</span>
            <span class="flex-1 font-medium truncate">{label(r.category)}</span>
            <span class="tabular-nums font-semibold">{money(r.spent, undefined, { decimals: 0 })}</span>
            <span class="text-xs text-slate-400 tabular-nums">/ {money(r.limit, undefined, { decimals: 0 })}</span>
          </div>
          <div class="relative h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div class="h-full rounded-full {BAR[r.status]} transition-[width] duration-500" style="width:{Math.min(100, r.ratio * 100)}%"></div>
            <!-- where you'd be if spending evenly through the month -->
            <div class="absolute inset-y-0 w-px bg-slate-400/70" style="left:{pace * 100}%" title="Even pace for today"></div>
          </div>
          <div class="text-[11px] {TEXT[r.status]}">
            {#if r.status === 'over'}
              Over by {money(-r.left, undefined, { decimals: 0 })}
            {:else}
              {money(r.left, undefined, { decimals: 0 })} left · {daysLeft} day{daysLeft === 1 ? '' : 's'} to go{r.ratio > pace + 0.1 ? ' · ahead of pace' : ''}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
