<script>
  // "?" sheet listing the keyboard shortcuts (handled in App.svelte and Group.svelte).
  import Icon from './Icon.svelte';

  let { onclose } = $props();

  const KEYS = [
    ['N', 'New expense (in a group; elsewhere, in the group you used last)'],
    ['/', 'Search'],
    ['E', 'Edit the entry you’re looking at'],
    ['G then H', 'Groups'],
    ['G then I', 'Insights'],
    ['G then S', 'Settings'],
    ['G then 1–9', 'Open your 1st to 9th group (in the order you added them)'],
    ['Esc', 'Back / close'],
    ['?', 'This list'],
  ];
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="card w-full max-w-md p-5 space-y-4 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="keys-title">
    <div class="flex items-center gap-2">
      <h2 id="keys-title" class="flex-1 font-black text-lg tracking-tight">Keyboard shortcuts</h2>
      <button class="btn btn-ghost !p-1.5 -mr-1.5" aria-label="Close" onclick={onclose}><Icon name="x" /></button>
    </div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {#each KEYS as [k, what] (k)}
        <dt class="text-right whitespace-nowrap">
          {#each k.split(' then ') as part, i (i)}{#if i}<span class="text-xs text-slate-400"> then </span>{/if}<kbd class="px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 font-mono text-xs">{part}</kbd>{/each}
        </dt>
        <dd class="text-slate-600 dark:text-slate-300">{what}</dd>
      {/each}
    </dl>
  </div>
</div>
