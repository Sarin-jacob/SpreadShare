<script>
  // Pick a time on a clock face, like Android's: drag or tap the hour, it moves on to the minutes,
  // then OK. 24-hour locales get an inner ring for 13–00. Arrow keys move the hand. value is 'HH:mm'.
  import { untrack } from 'svelte';
  import Modal from './Modal.svelte';

  /** @type {{ value: string, onpick: (value: string) => void, onclose: () => void }} */
  let { value, onpick, onclose } = $props();

  const pad2 = (n) => String(n).padStart(2, '0');
  const start = /^(\d{1,2}):(\d{2})/.exec(untrack(() => value) || ''); // the dialog edits a copy
  const now = new Date();
  let h = $state(start ? +start[1] : now.getHours());
  let mi = $state(start ? +start[2] : now.getMinutes());
  let mode = $state('hour'); // 'hour' | 'minute'
  let dragging = $state(false);

  const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false;
  const [am, pm] = [0, 12].map((x) => new Date(2024, 0, 1, x).toLocaleTimeString(undefined, { hour: 'numeric', hour12: true }).replace(/[\d\s]/g, '') || (x ? 'PM' : 'AM'));

  // Dial geometry (viewBox units).
  const C = 128, OUTER = 102, INNER = 66;
  const at = (i, r) => {
    const a = (i / 12) * 2 * Math.PI;
    return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
  };
  // Positions 0–11 clockwise from the top.
  const OUTER_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const INNER_HOURS = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

  const shownHour = $derived(hour12 ? h % 12 || 12 : h);
  const hand = $derived.by(() => {
    if (mode === 'minute') return { ...at(mi / 5, OUTER), label: mi % 5 ? '' : pad2(mi) };
    const inner = !hour12 && (h === 0 || h > 12);
    return { ...at(h % 12, inner ? INNER : OUTER), label: hour12 ? String(h % 12 || 12) : pad2(h), inner };
  });

  let svg = $state();
  function fromPointer(e) {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 256 - C;
    const y = ((e.clientY - r.top) / r.height) * 256 - C;
    let angle = Math.atan2(x, -y);
    if (angle < 0) angle += 2 * Math.PI;
    if (mode === 'minute') {
      mi = Math.round((angle / (2 * Math.PI)) * 60) % 60;
      return;
    }
    const pos = Math.round((angle / (2 * Math.PI)) * 12) % 12;
    const inner = !hour12 && Math.hypot(x, y) < (OUTER + INNER) / 2;
    const picked = (inner ? INNER_HOURS : OUTER_HOURS)[pos];
    h = hour12 ? (picked % 12) + (h >= 12 ? 12 : 0) : picked;
  }
  function down(e) {
    svg.setPointerCapture(e.pointerId);
    dragging = true;
    fromPointer(e);
  }
  function move(e) {
    if (dragging) fromPointer(e);
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (mode === 'hour') mode = 'minute';
  }
  function key(e) {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (step) {
      e.preventDefault();
      if (mode === 'minute') mi = (mi + step + 60) % 60;
      else h = (h + step + 24) % 24;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      mode === 'hour' ? (mode = 'minute') : ok();
    }
  }

  function ok() {
    onpick(`${pad2(h)}:${pad2(mi)}`);
    onclose();
  }
  function setNow() {
    const n = new Date();
    h = n.getHours();
    mi = n.getMinutes();
  }
</script>

<Modal label="Pick a time" {onclose}>
  <div class="space-y-4 select-none">
    <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Time</div>
    <div class="flex items-center justify-center gap-2">
      <button
        type="button"
        class="w-24 py-2 rounded-2xl text-5xl font-black tabular-nums transition-colors {mode === 'hour' ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300' : 'bg-slate-100 dark:bg-slate-700/50'}"
        aria-pressed={mode === 'hour'}
        aria-label="Hour {shownHour}"
        onclick={() => (mode = 'hour')}
      >{hour12 ? shownHour : pad2(h)}</button>
      <span class="text-5xl font-black text-slate-400">:</span>
      <button
        type="button"
        class="w-24 py-2 rounded-2xl text-5xl font-black tabular-nums transition-colors {mode === 'minute' ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300' : 'bg-slate-100 dark:bg-slate-700/50'}"
        aria-pressed={mode === 'minute'}
        aria-label="Minute {pad2(mi)}"
        onclick={() => (mode = 'minute')}
      >{pad2(mi)}</button>
      {#if hour12}
        <div class="flex flex-col gap-1 ml-1">
          {#each [[am, false], [pm, true]] as [label, isPm]}
            <button
              type="button"
              class="px-3 py-1.5 rounded-xl text-sm font-bold transition-colors {(h >= 12) === isPm ? 'bg-accent-600 text-white' : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500'}"
              aria-pressed={(h >= 12) === isPm}
              onclick={() => (h = (h % 12) + (isPm ? 12 : 0))}
            >{label}</button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <svg
      bind:this={svg}
      viewBox="0 0 256 256"
      class="mx-auto w-full max-w-[17rem] touch-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-full"
      role="slider"
      tabindex="0"
      aria-label={mode === 'hour' ? 'Hour' : 'Minute'}
      aria-valuemin={mode === 'hour' ? 0 : 0}
      aria-valuemax={mode === 'hour' ? 23 : 59}
      aria-valuenow={mode === 'hour' ? h : mi}
      aria-valuetext={mode === 'hour' ? `${shownHour}${hour12 ? (h >= 12 ? ` ${pm}` : ` ${am}`) : ''}` : pad2(mi)}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={key}
    >
      <circle cx={C} cy={C} r="126" class="fill-slate-100 dark:fill-slate-700/50" />
      <line x1={C} y1={C} x2={hand.x} y2={hand.y} class="stroke-accent-500" stroke-width="2" />
      <circle cx={C} cy={C} r="4" class="fill-accent-500" />
      <circle cx={hand.x} cy={hand.y} r={hand.inner ? 16 : 19} class="fill-accent-500" />
      {#if mode === 'minute' && !hand.label}<circle cx={hand.x} cy={hand.y} r="3" class="fill-white" />{/if}
      {#if mode === 'hour'}
        {#each OUTER_HOURS as n, i}
          {@const p = at(i, OUTER)}
          <text x={p.x} y={p.y} dy="0.35em" text-anchor="middle" class="text-[15px] font-semibold pointer-events-none {(hour12 ? h % 12 || 12 : h) === n ? 'fill-white' : 'fill-slate-700 dark:fill-slate-200'}">{n}</text>
        {/each}
        {#if !hour12}
          {#each INNER_HOURS as n, i}
            {@const p = at(i, INNER)}
            <text x={p.x} y={p.y} dy="0.35em" text-anchor="middle" class="text-[12px] font-semibold pointer-events-none {h === n ? 'fill-white' : 'fill-slate-500 dark:fill-slate-400'}">{pad2(n)}</text>
          {/each}
        {/if}
      {:else}
        {#each Array.from({ length: 12 }, (_, i) => i * 5) as n, i}
          {@const p = at(i, OUTER)}
          <text x={p.x} y={p.y} dy="0.35em" text-anchor="middle" class="text-[15px] font-semibold pointer-events-none {mi === n ? 'fill-white' : 'fill-slate-700 dark:fill-slate-200'}">{pad2(n)}</text>
        {/each}
      {/if}
    </svg>

    <div class="flex gap-2">
      <button type="button" class="btn btn-ghost" onclick={setNow}>Now</button>
      <span class="flex-1"></span>
      <button type="button" class="btn btn-soft" onclick={onclose}>Cancel</button>
      <button type="button" class="btn btn-primary" onclick={ok}>OK</button>
    </div>
  </div>
</Modal>
