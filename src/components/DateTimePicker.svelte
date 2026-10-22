<script>
  // Calendar + time wheels, in place of the browser's date / time inputs (which look different on
  // every phone and are fiddly to tap). value is local time: 'YYYY-MM-DDTHH:mm', or 'YYYY-MM-DD'
  // with time={false}.
  import Icon from './Icon.svelte';
  import Wheel from './Wheel.svelte';

  /** @type {{ value: string, time?: boolean, onpick?: () => void }} */
  let { value = $bindable(), time = true, onpick } = $props();

  const pad2 = (n) => String(n).padStart(2, '0');
  const dayKey = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

  // Current value as parts (falls back to now when empty / invalid).
  const parts = $derived.by(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value || '');
    const now = new Date();
    return m
      ? { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] != null ? +m[4] : now.getHours(), mi: m[5] != null ? +m[5] : now.getMinutes() }
      : { y: now.getFullYear(), mo: now.getMonth(), d: now.getDate(), h: now.getHours(), mi: now.getMinutes() };
  });

  function set({ y = parts.y, mo = parts.mo, d = parts.d, h = parts.h, mi = parts.mi }) {
    const day = dayKey(y, mo, d);
    value = time ? `${day}T${pad2(h)}:${pad2(mi)}` : day;
  }

  // Month on screen (follows the value when it moves to another month).
  let view = $state({ y: 0, mo: 0 });
  let picking = $state(false); // month / year grid instead of days
  $effect.pre(() => {
    view = { y: parts.y, mo: parts.mo };
  });

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

  const today = new Date();
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = $derived.by(() => {
    const lead = (new Date(view.y, view.mo, 1).getDay() - firstDay + 7) % 7;
    const days = new Date(view.y, view.mo + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  });
  const title = $derived(new Date(view.y, view.mo, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));

  function shift(n) {
    if (picking) return (view = { ...view, y: view.y + n });
    const d = new Date(view.y, view.mo + n, 1);
    view = { y: d.getFullYear(), mo: d.getMonth() };
  }

  function pickDay(d) {
    set({ y: view.y, mo: view.mo, d });
    onpick?.();
  }

  // Time wheels, 12- or 24-hour as the locale writes it.
  const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
  const [am, pm] = [0, 12].map((h) => new Date(2024, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', hour12: true }).replace(/[\d\s]/g, '') || (h ? 'PM' : 'AM'));
  const hours = hour12 ? Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) })) : Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad2(i) }));
  const minutes = Array.from({ length: 60 }, (_, i) => ({ value: i, label: pad2(i) }));
  const halves = [{ value: 0, label: am }, { value: 1, label: pm }];

  const shownHour = $derived(hour12 ? (parts.h % 12 || 12) : parts.h);
  const half = $derived(parts.h >= 12 ? 1 : 0);
  const setHour = (v) => set({ h: hour12 ? (v % 12) + half * 12 : v });
  const setHalf = (v) => set({ h: (parts.h % 12) + v * 12 });

  function now() {
    const n = new Date();
    set({ y: n.getFullYear(), mo: n.getMonth(), d: n.getDate(), h: n.getHours(), mi: n.getMinutes() });
  }
</script>

<div class="space-y-3 select-none">
  <div class="flex items-center gap-1">
    <button type="button" class="btn btn-ghost !p-2" onclick={() => shift(-1)} aria-label={picking ? 'Previous year' : 'Previous month'}><Icon name="back" class="w-4 h-4" /></button>
    <button type="button" class="flex-1 py-1.5 rounded-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-700/50" onclick={() => (picking = !picking)} aria-expanded={picking}>
      {picking ? view.y : title}
    </button>
    <button type="button" class="btn btn-ghost !p-2" onclick={() => shift(1)} aria-label={picking ? 'Next year' : 'Next month'}><Icon name="chevron" class="w-4 h-4" /></button>
  </div>

  {#if picking}
    <div class="grid grid-cols-4 gap-1.5">
      {#each monthNames as m, i}
        <button
          type="button"
          class="py-2.5 rounded-lg text-sm font-semibold {view.y === parts.y && i === parts.mo ? 'bg-accent-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}"
          onclick={() => { view = { ...view, mo: i }; picking = false; }}
        >{m}</button>
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-7 text-center">
      {#each weekdays as w}<div class="text-[11px] font-semibold text-slate-400 pb-1">{w}</div>{/each}
      {#each cells as d}
        {#if d}
          {@const key = dayKey(view.y, view.mo, d)}
          {@const selected = view.y === parts.y && view.mo === parts.mo && d === parts.d}
          <button
            type="button"
            class="mx-auto my-0.5 w-9 h-9 rounded-full text-sm tabular-nums transition-colors
              {selected ? 'bg-accent-600 text-white font-bold' : key === todayKey ? 'ring-1 ring-accent-500 text-accent-700 dark:text-accent-300 font-semibold' : key > todayKey ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}"
            aria-label={new Date(view.y, view.mo, d).toLocaleDateString(undefined, { dateStyle: 'full' })}
            aria-pressed={selected}
            onclick={() => pickDay(d)}
          >{d}</button>
        {:else}<span></span>{/if}
      {/each}
    </div>
  {/if}

  {#if time}
    <div class="flex items-center justify-center gap-2 border-t border-slate-100 dark:border-slate-700/60 pt-3">
      <Wheel items={hours} value={shownHour} label="Hour" onchange={setHour} />
      <span class="text-xl font-bold text-slate-400">:</span>
      <Wheel items={minutes} value={parts.mi} label="Minute" onchange={(v) => set({ mi: v })} />
      {#if hour12}<Wheel items={halves} value={half} label="AM or PM" onchange={setHalf} />{/if}
      <button type="button" class="chip ml-2" onclick={now}>Now</button>
    </div>
  {/if}
</div>
