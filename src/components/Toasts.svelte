<script>
  import { fly } from 'svelte/transition';
  import { toasts, dismissToast } from '../lib/toast.svelte.js';

  const COLORS = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-slate-800 dark:bg-slate-700',
  };
</script>

<div class="fixed z-[100] inset-x-0 bottom-24 md:bottom-auto md:top-5 flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="polite">
  {#each toasts as t (t.id)}
    <div
      transition:fly={{ y: 20, duration: 200 }}
      class="{COLORS[t.type]} text-white text-sm font-semibold pl-4 {t.action ? 'pr-1.5' : 'pr-4'} py-1.5 min-h-10 rounded-xl shadow-lg max-w-sm flex items-center gap-3 pointer-events-auto"
    >
      <span class="py-1">{t.message}</span>
      {#if t.action}
        <button
          class="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-bold uppercase text-xs tracking-wide"
          onclick={() => { dismissToast(t.id); t.action.run(); }}
        >
          {t.action.label}
        </button>
      {/if}
    </div>
  {/each}
</div>
