<script>
  // Pick a day: a month calendar in a dialog. Tapping a day picks it. value is 'YYYY-MM-DD' (local).
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';
  import Icon from './Icon.svelte';

  /** @type {{ value: string, onpick: (value: string) => void, onclose: () => void }} */
  let { value, onpick, onclose } = $props();

  const pad2 = (n) => String(n).padStart(2, '0');
  const dayKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

  const now = new Date();
  const todayKey = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(untrack(() => value) || '') ?? [null, now.getFullYear(), now.getMonth() + 1, now.getDate()];
  const picked = { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  const pickedKey = dayKey(picked.y, picked.mo, picked.d);

  let view = $state({ y: picked.y, mo: picked.mo });
  let years = $state(false); // month / year grid instead of days

  const locale = navigator.language || 'en';
  // Weeks start on the locale's first day (Sunday in the US / India, Monday in most of Europe).
  const firstDay = (() => {
    try {
      const l = new Intl.Locale(locale);
      const info = l.getWeekInfo?.() ?? l.weekInfo;
      if (info?.firstDay) return info.firstDay % 7;
    } catch {}
    return /^(en-(US|IN|CA|PH)|hi|ja|ko|zh|pt-BR|he)/.test(locale) || locale === 'en' ? 0 : 1;
  })();
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + ((firstDay + i) % 7)).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const monthNames = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'short' }));

  const cells = $derived.by(() => {
    const lead = (new Date(view.y, view.mo, 1).getDay() - firstDay + 7) % 7;
    const days = new Date(view.y, view.mo + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  });
  const title = $derived(new Date(view.y, view.mo, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  const heading = new Date(picked.y, picked.mo, picked.d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  function shift(n) {
    if (years) return (view = { ...view, y: view.y + n });
    const d = new Date(view.y, view.mo + n, 1);
    view = { y: d.getFullYear(), mo: d.getMonth() };
  }

  function pick(key) {
    onpick(key);
    onclose();
  }
</script>

<Modal label="Pick a date" {onclose}>
  <div class="space-y-4 select-none">
    <div>
      <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Date</div>
      <div class="text-2xl font-black tracking-tight">{heading}</div>
    </div>

    <div class="flex items-center gap-1">
      <button type="button" class="btn btn-ghost !p-2.5" onclick={() => shift(-1)} aria-label={years ? 'Previous year' : 'Previous month'}><Icon name="back" class="w-5 h-5" /></button>
      <button type="button" class="flex-1 py-2 rounded-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-700/50 flex items-center justify-center gap-1" onclick={() => (years = !years)} aria-expanded={years}>
        {years ? view.y : title}
        <svg class="w-4 h-4 text-slate-400 transition {years ? 'rotate-180' : ''}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" /></svg>
      </button>
      <button type="button" class="btn btn-ghost !p-2.5" onclick={() => shift(1)} aria-label={years ? 'Next year' : 'Next month'}><Icon name="chevron" class="w-5 h-5" /></button>
    </div>

    {#if years}
      <div class="grid grid-cols-3 gap-2 min-h-[18rem] content-start">
        {#each monthNames as name, i}
          <button
            type="button"
            class="py-4 rounded-xl text-sm font-semibold {view.y === picked.y && i === picked.mo ? 'bg-accent-600 text-white' : 'bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700'}"
            onclick={() => { view = { ...view, mo: i }; years = false; }}
          >{name}</button>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-7 text-center min-h-[18rem] content-start">
        {#each weekdays as w}<div class="text-xs font-semibold text-slate-400 pb-2">{w}</div>{/each}
        {#each cells as d}
          {#if d}
            {@const key = dayKey(view.y, view.mo, d)}
            <button
              type="button"
              class="mx-auto my-0.5 w-10 h-10 rounded-full text-sm tabular-nums transition-colors
                {key === pickedKey ? 'bg-accent-600 text-white font-bold' : key === todayKey ? 'ring-1 ring-accent-500 text-accent-700 dark:text-accent-300 font-semibold' : key > todayKey ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}"
              aria-label={new Date(view.y, view.mo, d).toLocaleDateString(undefined, { dateStyle: 'full' })}
              aria-pressed={key === pickedKey}
              onclick={() => pick(key)}
            >{d}</button>
          {:else}<span></span>{/if}
        {/each}
      </div>
    {/if}

    <div class="flex gap-2">
      <button type="button" class="btn btn-ghost" onclick={() => pick(todayKey)}>Today</button>
      <span class="flex-1"></span>
      <button type="button" class="btn btn-soft" onclick={onclose}>Cancel</button>
    </div>
  </div>
</Modal>
