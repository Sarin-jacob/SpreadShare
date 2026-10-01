<script>
  import { fly } from 'svelte/transition';
  import { toasts } from '../lib/toast.svelte.js';

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
      class="{COLORS[t.type]} text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg max-w-sm text-center"
    >
      {t.message}
    </div>
  {/each}
</div>
