<script>
  // Dialog shell: a sheet from the bottom on phones, centred on wider screens. Escape or a tap
  // outside closes it.
  /** @type {{ label: string, onclose: () => void, children: import('svelte').Snippet, class?: string }} */
  let { label, onclose, children, class: cls = 'max-w-sm' } = $props();

  let box = $state();
  $effect(() => {
    const before = document.activeElement;
    box?.focus();
    return () => before?.focus?.({ preventScroll: true });
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (e.stopPropagation(), onclose())} />

<div
  class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4"
  role="presentation"
  onclick={(e) => e.target === e.currentTarget && onclose()}
>
  <div
    bind:this={box}
    class="card w-full {cls} rounded-b-none sm:rounded-b-2xl p-5 shadow-2xl focus:outline-none animate-sheet"
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
    style="padding-bottom: max(1.25rem, env(safe-area-inset-bottom))"
  >
    {@render children()}
  </div>
</div>

<style>
  @keyframes sheet { from { transform: translateY(24px); opacity: 0; } }
  .animate-sheet { animation: sheet 0.18s ease-out; }
</style>
