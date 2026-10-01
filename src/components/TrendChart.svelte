<script>
  import { money, shortDate } from '../lib/format.js';

  /** points: [{ date: 'YYYY-MM-DD', value }] oldest → newest */
  let { points = [] } = $props();

  const W = 300;
  const H = 80;
  let hover = $state(null);

  const geo = $derived.by(() => {
    const n = points.length;
    const max = Math.max(1, ...points.map((p) => p.value));
    const x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v) => H - 4 - (v / max) * (H - 12);
    const coords = points.map((p, i) => [x(i), y(p.value)]);
    const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ');
    return { coords, line, area: n ? `${line} L${W},${H} L0,${H} Z` : '' };
  });

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (points.length - 1));
    hover = Math.max(0, Math.min(points.length - 1, i));
  }
</script>

<div class="relative">
  <svg
    viewBox="0 0 {W} {H}"
    preserveAspectRatio="none"
    class="w-full h-20 overflow-visible text-accent-400"
    role="img"
    aria-label="Daily spending trend"
    onpointermove={onMove}
    onpointerleave={() => (hover = null)}
  >
    <defs>
      <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.35" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d={geo.area} fill="url(#trend-fill)" />
    <path d={geo.line} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    {#if hover !== null && geo.coords[hover]}
      <line x1={geo.coords[hover][0]} x2={geo.coords[hover][0]} y1="0" y2={H} stroke="currentColor" stroke-opacity="0.4" vector-effect="non-scaling-stroke" />
    {/if}
  </svg>
  {#if hover !== null && points[hover]}
    <div class="absolute -top-7 right-0 text-[11px] font-semibold bg-black/40 text-white rounded-md px-2 py-0.5">
      {shortDate(points[hover].date + 'T00:00')} · {money(points[hover].value)}
    </div>
  {/if}
</div>
