<script>
  // Full-screen receipt scanner: crop (4 draggable corners, perspective-corrected) →
  // brightness / contrast / B&W → on-device OCR → review → hand results to the form.
  import { onMount } from 'svelte';
  import { money } from '../lib/format.js';
  import { ocrOffline, checkOcrOffline, keepAfterScan } from '../lib/ocrOffline.svelte.js';
  import Icon from './Icon.svelte';

  /**
   * file: the photo to scan
   * onapply({ receipt, draft, image, mode: 'total' | 'items' })
   */
  let { file, onapply, onclose } = $props();

  let R = $state(null); // lazily imported receipt module
  let step = $state('loading'); // loading | edit | scanning | review | error
  let error = $state('');
  let source = $state.raw(null);
  let quad = $state([]);
  let adj = $state({ bright: 0, contrast: 0, gray: false, autoLevels: true });
  let model = $state('idle'); // idle | loading (from offline copy) | downloading | ready | failed
  let result = $state.raw(null);
  let image = $state(null);
  let elapsed = $state(0);

  let canvasEl = $state();
  let stageEl = $state();
  let stageW = $state(1);
  let dragging = null;

  onMount(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    open();
    return () => (document.body.style.overflow = prevOverflow);
  });

  async function open() {
    try {
      R = await import('../lib/receipt/index.js');
      source = await R.loadPhoto(file);
      quad = R.autoQuad(source);
      step = 'edit';
      // Fetch (or load from the offline copy) the OCR model while the user adjusts the crop.
      await checkOcrOffline();
      if (!navigator.onLine && !R.isOcrReady() && ocrOffline.status !== 'ready') {
        throw new Error('offline-no-reader');
      }
      if (!R.isOcrReady()) {
        // Already on the device → just starting it up; otherwise this is the one-time download.
        model = ocrOffline.status === 'ready' ? 'loading' : 'downloading';
        R.preloadOcr().then(() => (model = 'ready'), () => (model = 'failed'));
      } else {
        model = 'ready';
      }
    } catch (e) {
      fail(e);
    }
  }

  function fail(e) {
    console.error(e);
    error = e?.message === 'offline-no-reader'
      ? 'You’re offline and the receipt reader isn’t on this device yet. Connect once (or download it in Settings) and scanning will work offline from then on.'
      : /fetch|network|load/i.test(e?.message || '')
      ? 'Couldn’t download the receipt reader. Check your connection and try again.'
      : e?.message || 'Couldn’t read this photo.';
    step = 'error';
  }

  // Live preview: the photo with CSS-filter adjustments (the scan applies the exact pixel version).
  $effect(() => {
    if (!canvasEl || !source || !R) return;
    canvasEl.width = source.width;
    canvasEl.height = source.height;
    const g = canvasEl.getContext('2d');
    g.filter = R.previewFilter(adj);
    g.drawImage(source, 0, 0);
    g.filter = 'none';
  });

  const handleR = $derived(source ? (source.width / Math.max(1, stageW)) * 14 : 10);

  function toSource(e) {
    const box = stageEl.getBoundingClientRect();
    return [
      Math.min(source.width, Math.max(0, ((e.clientX - box.left) / box.width) * source.width)),
      Math.min(source.height, Math.max(0, ((e.clientY - box.top) / box.height) * source.height)),
    ];
  }
  function down(e, i) {
    dragging = i;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (dragging == null) return;
    quad[dragging] = toSource(e);
  }
  const up = () => (dragging = null);

  function rotate(dir) {
    source = R.rotate(source, dir);
    quad = R.autoQuad(source);
  }

  async function scan() {
    step = 'scanning';
    elapsed = 0;
    const started = Date.now();
    const timer = setInterval(() => (elapsed = Math.round((Date.now() - started) / 1000)), 500);
    try {
      await new Promise((r) => setTimeout(r, 30)); // let the UI paint
      const flat = R.applyAdjustments(R.warp(source, $state.snapshot(quad)), $state.snapshot(adj));
      image = R.canvasToDataUrl(flat);
      result = await R.scanReceipt(flat);
      model = 'ready';
      keepAfterScan();
      step = 'review';
    } catch (e) {
      fail(e);
    } finally {
      clearInterval(timer);
    }
  }

  const r = $derived(result?.receipt);
  const draft = $derived(r && R ? R.receiptToDraft(r) : null);
  const failed = $derived(result?.check.checks.filter((c) => !c.ok) ?? []);
  const cur = $derived(r?.currency || undefined);
  const summaryRows = $derived(
    r
      ? [
          ['Subtotal', r.subtotal],
          ...r.discounts.map((d) => [d.label || 'Discount', d.amount]),
          ...r.charges.map((c) => [c.label || 'Charge', c.amount]),
          ...r.taxes.map((t) => [`${t.label || 'Tax'}${t.inclusive ? ' (incl.)' : ''}`, t.amount]),
        ].filter(([, v]) => v != null)
      : []
  );

  function apply(mode) {
    onapply({ receipt: r, draft, image, mode, compact: R.compactScan(r) });
  }

  function onKey(e) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Scan receipt">
  <div class="max-w-2xl mx-auto px-4 py-4 pb-safe space-y-4">
    <div class="flex items-center gap-2">
      <button class="btn btn-ghost !p-2 -ml-2" aria-label="Close scanner" onclick={onclose}><Icon name="x" /></button>
      <h2 class="text-lg font-black tracking-tight flex-1">Scan receipt</h2>
      {#if model === 'loading'}
        <span class="text-xs text-slate-500 animate-pulse">Starting reader…</span>
      {:else if model === 'downloading'}
        <span class="text-xs text-slate-500 animate-pulse">Downloading reader (~67 MB, once)…</span>
      {:else if model === 'ready' && step === 'edit'}
        <span class="text-xs text-emerald-600 dark:text-emerald-400">Reader ready</span>
      {/if}
    </div>

    {#if step === 'loading'}
      <div class="py-24 grid place-items-center">
        <div class="w-8 h-8 rounded-full border-2 border-accent-500 border-t-transparent animate-spin"></div>
      </div>
    {:else if step === 'error'}
      <div class="card p-6 text-center space-y-4">
        <div class="text-4xl">🧾</div>
        <p class="text-sm">{error}</p>
        <div class="flex gap-2 justify-center">
          {#if source}<button class="btn btn-soft" onclick={() => (step = 'edit')}>Back to crop</button>{/if}
          <button class="btn btn-primary" onclick={onclose}>Close</button>
        </div>
      </div>
    {:else if step === 'edit' || step === 'scanning'}
      <p class="text-sm text-slate-500 dark:text-slate-400">Drag the corners onto the receipt's edges. Use the sliders if it's dark or faded.</p>
      <div class="rounded-2xl bg-slate-900 p-2 grid place-items-center">
        <div class="relative inline-block touch-none select-none" bind:this={stageEl} bind:clientWidth={stageW}>
          <canvas bind:this={canvasEl} class="block max-w-full max-h-[55vh] w-auto h-auto rounded-lg"></canvas>
          {#if source}
            <svg
              class="absolute inset-0 w-full h-full"
              viewBox="0 0 {source.width} {source.height}"
              preserveAspectRatio="none"
              role="presentation"
              onpointermove={move}
              onpointerup={up}
              onpointercancel={up}
            >
              <polygon points={quad.map((p) => p.join(',')).join(' ')} class="fill-accent-500/15 stroke-accent-400" stroke-width={handleR / 5} />
              {#each quad as p, i (i)}
                <circle
                  cx={p[0]} cy={p[1]} r={handleR}
                  class="fill-white stroke-accent-500 cursor-grab"
                  stroke-width={handleR / 3.5}
                  role="slider"
                  aria-label="Corner {i + 1}"
                  aria-valuenow={Math.round(p[0])}
                  tabindex="-1"
                  onpointerdown={(e) => down(e, i)}
                />
              {/each}
            </svg>
          {/if}
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="btn btn-soft !py-2" onclick={() => rotate(-1)} disabled={step === 'scanning'}>⟲ Rotate</button>
        <button class="btn btn-soft !py-2" onclick={() => rotate(1)} disabled={step === 'scanning'}>⟳ Rotate</button>
        <button class="btn btn-soft !py-2" onclick={() => (quad = R.autoQuad(source))} disabled={step === 'scanning'}>Auto corners</button>
        <button class="btn btn-soft !py-2" onclick={() => (quad = R.fullQuad(source))} disabled={step === 'scanning'}>Whole photo</button>
      </div>

      <div class="card p-4 space-y-3 text-sm">
        <label class="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3">
          Brightness <input type="range" min="-60" max="60" bind:value={adj.bright} class="accent-[var(--accent-500)]" />
          <span class="text-right tabular-nums text-slate-500">{adj.bright}</span>
        </label>
        <label class="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3">
          Contrast <input type="range" min="-40" max="100" bind:value={adj.contrast} class="accent-[var(--accent-500)]" />
          <span class="text-right tabular-nums text-slate-500">{adj.contrast}</span>
        </label>
        <div class="flex flex-wrap gap-x-5 gap-y-2">
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={adj.gray} class="w-4 h-4 accent-[var(--accent-500)]" /> Black &amp; white</label>
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={adj.autoLevels} class="w-4 h-4 accent-[var(--accent-500)]" /> Auto-fix dark / faded</label>
        </div>
      </div>

      <button class="btn btn-primary w-full !py-3.5 text-base" onclick={scan} disabled={step === 'scanning' || model === 'failed'}>
        {#if step === 'scanning'}
          {model === 'ready' ? `Reading… ${elapsed}s` : model === 'loading' ? 'Starting reader…' : 'Downloading reader…'}
        {:else}
          Scan receipt
        {/if}
      </button>
      {#if model === 'failed'}
        <p class="text-xs text-rose-500 text-center">Couldn’t download the receipt reader. Check your connection and reopen the scanner.</p>
      {/if}
    {:else if step === 'review' && r}
      <div class="card p-5 space-y-4">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-sm text-slate-500 dark:text-slate-400 truncate">{draft?.title || 'Unknown merchant'}</div>
            <div class="text-3xl font-black tabular-nums">{r.total == null ? 'No total found' : money(r.total, cur)}</div>
            {#if draft?.when}
              <div class="text-xs text-slate-500 mt-0.5">{new Date(draft.when).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
            {/if}
          </div>
          <span
            class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold {result.check.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}"
            title={failed.map((c) => `${c.name}: ${c.detail}`).join('\n')}
          >
            {result.check.ok ? 'Numbers add up ✓' : 'Please check'}
          </span>
        </div>

        {#if r.items.length}
          <ul class="divide-y divide-slate-100 dark:divide-slate-700/60 text-sm">
            {#each r.items as it, i (i)}
              <li class="flex items-center gap-3 py-1.5">
                <span class="flex-1 min-w-0 truncate">{it.name}</span>
                {#if it.qty && it.qty !== 1}<span class="text-xs text-slate-400 tabular-nums">×{it.qty}</span>{/if}
                <span class="tabular-nums font-medium">{money(it.total, cur)}</span>
              </li>
            {/each}
          </ul>
        {/if}

        {#if summaryRows.length}
          <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm border-t border-slate-100 dark:border-slate-700/60 pt-3">
            {#each summaryRows as [label, value], i (i)}
              <dt class="text-slate-500 truncate">{label}</dt>
              <dd class="text-right tabular-nums">{money(value, cur)}</dd>
            {/each}
          </dl>
        {/if}

        {#if failed.length}
          <ul class="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2 space-y-0.5">
            {#each failed as c (c.name)}<li>{c.name}: {c.detail}</li>{/each}
          </ul>
        {/if}

        <p class="text-xs text-slate-400">Read on this device in {(result.ms / 1000).toFixed(1)}s</p>
      </div>

      <div class="grid gap-2 {draft?.items.length ? 'sm:grid-cols-2' : ''}">
        <button class="btn btn-primary !py-3" onclick={() => apply('total')} disabled={r.total == null && !draft?.items.length}>
          <Icon name="check" class="w-4 h-4" /> Use these details
        </button>
        {#if draft?.items.length}
          <button class="btn btn-soft !py-3" onclick={() => apply('items')}>Split by items ({draft.items.length})</button>
        {/if}
      </div>
      <div class="flex gap-2">
        <button class="btn btn-ghost flex-1" onclick={() => (step = 'edit')}>Adjust crop &amp; rescan</button>
        <button class="btn btn-ghost flex-1" onclick={onclose}>Cancel</button>
      </div>

      <details class="text-xs">
        <summary class="cursor-pointer text-slate-500">What the scanner read</summary>
        <pre class="mt-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-auto max-h-72 whitespace-pre">{result.lines}</pre>
      </details>
      {#if image}
        <details class="text-xs">
          <summary class="cursor-pointer text-slate-500">Cleaned-up image (attached to the expense)</summary>
          <img src={image} alt="Flattened receipt" class="mt-2 max-w-full rounded-lg" />
        </details>
      {/if}
    {/if}
  </div>
</div>
