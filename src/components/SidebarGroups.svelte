<script>
  // Desktop sidebar: every group with your balance, for switching without going back to the list.
  import { app } from '../lib/app.svelte.js';
  import { loadAllEvents, summarizeGroups } from '../lib/cache.svelte.js';
  import { money } from '../lib/format.js';

  let { active = null } = $props();
  let summary = $state({});

  $effect(() => {
    app.cacheVersion; // re-read whenever any group's cache changes
    const email = app.user.email;
    loadAllEvents().then((all) => (summary = summarizeGroups(all, email)));
  });

  const time = (id) => (summary[id]?.lastActivity ? new Date(summary[id].lastActivity).getTime() : 0);
  const groups = $derived([...app.directory].sort((a, b) => time(b.id) - time(a.id)));
</script>

{#if groups.length}
  <div class="min-h-0 flex flex-col">
    <h2 class="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Your groups</h2>
    <ul class="space-y-0.5 overflow-y-auto -mr-2 pr-2">
      {#each groups as g (g.id)}
        {@const net = summary[g.id]?.net ?? 0}
        <li>
          <a
            href="#/g/{g.id}"
            class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition
              {active === g.id ? 'bg-slate-200/70 dark:bg-slate-800 font-semibold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'}"
          >
            <span class="flex-1 truncate">{g.name}</span>
            {#if Math.abs(net) > 0.009}
              <span class="text-xs tabular-nums font-semibold {net > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                {net > 0 ? '+' : '−'}{money(Math.abs(net), undefined, { decimals: 0 })}
              </span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </div>
{/if}
