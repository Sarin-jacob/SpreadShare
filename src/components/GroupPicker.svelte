<script>
  // "Which group is it for?" list, last-used group first.
  import { app, lastGroupId } from '../lib/app.svelte.js';
  import Icon from './Icon.svelte';

  let { onpick, title = 'Which group is it for?' } = $props();

  const last = lastGroupId();
  const groups = $derived([...app.directory].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0)));
</script>

{#if app.directory.length === 0}
  <div class="card p-6 text-center space-y-3">
    <p class="text-sm text-slate-500">Create a group first.</p>
    <a href="#/" class="btn btn-primary">Create a group</a>
  </div>
{:else}
  <section class="space-y-2">
    <h2 class="label px-1">{title}</h2>
    <ul class="space-y-2">
      {#each groups as g (g.id)}
        <li>
          <button class="card w-full p-4 flex items-center gap-3 text-left hover:border-accent-500/50 transition" onclick={() => onpick(g.id)}>
            <span class="w-10 h-10 rounded-xl grid place-items-center bg-accent-500/10 text-accent-600 dark:text-accent-400 font-black">{g.name.charAt(0).toUpperCase()}</span>
            <span class="flex-1 min-w-0">
              <span class="block font-semibold truncate">{g.name}</span>
              {#if g.id === last}<span class="block text-xs text-slate-400">Used last</span>{/if}
            </span>
            <Icon name="chevron" class="w-4 h-4 text-slate-400" />
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}
