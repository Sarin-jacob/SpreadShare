<script>
  // One scroll wheel of a time picker: the row in the middle band is the value. Swipe, scroll with
  // a mouse wheel, tap a row, or use the arrow keys.
  /** @type {{ items: { value: any, label: string }[], value: any, label: string, onchange?: (v: any) => void }} */
  let { items, value = $bindable(), label, onchange } = $props();

  const uid = $props.id();
  const ROW = 40; // px; matches h-10
  let el = $state();
  let settle = null;
  let scrolling = false; // a scroll we started: don't read a value back from it

  const index = $derived(Math.max(0, items.findIndex((i) => i.value === value)));

  function scrollTo(i, smooth = false) {
    if (!el) return;
    scrolling = !smooth;
    el.scrollTo({ top: i * ROW, behavior: smooth ? 'smooth' : 'instant' });
    if (!smooth) requestAnimationFrame(() => (scrolling = false));
  }

  // Follow the value when it changes from outside (Today / Now buttons).
  $effect(() => {
    const i = index;
    if (el && Math.round(el.scrollTop / ROW) !== i) scrollTo(i);
  });

  function onScroll() {
    if (scrolling) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (items[i].value !== value) {
        value = items[i].value;
        onchange?.(value);
      }
    }, 90);
  }

  function onKey(e) {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = Math.min(items.length - 1, Math.max(0, index + step));
    value = items[i].value;
    onchange?.(value);
  }
</script>

<div class="relative h-[120px] w-16">
  <div class="pointer-events-none absolute inset-x-0 top-10 h-10 rounded-lg bg-accent-500/10 border border-accent-500/30"></div>
  <div
    bind:this={el}
    class="wheel h-full overflow-y-auto snap-y snap-mandatory overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-lg"
    style="padding-block: {ROW}px; scrollbar-width: none"
    role="listbox"
    tabindex="0"
    aria-label={label}
    aria-activedescendant="{uid}-{index}"
    onscroll={onScroll}
    onkeydown={onKey}
  >
    {#each items as item, i (item.value)}
      <div
        id="{uid}-{i}"
        role="option"
        aria-selected={i === index}
        tabindex="-1"
        class="h-10 snap-center grid place-items-center text-xl tabular-nums cursor-pointer transition-colors {i === index ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-400'}"
        onclick={() => scrollTo(i, true)}
        onkeydown={() => {}}
      >
        {item.label}
      </div>
    {/each}
  </div>
</div>

<style>
  .wheel::-webkit-scrollbar { display: none; }
  .wheel { mask-image: linear-gradient(transparent, #000 30%, #000 70%, transparent); }
</style>
