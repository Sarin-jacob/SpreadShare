<script>
  import { app, createGroup } from '../lib/app.svelte.js';
  import { getAll, STORES } from '../lib/db.js';
  import { computeLedgerState } from '../lib/engine.js';
  import { money } from '../lib/format.js';
  import { go } from '../lib/router.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import Icon from '../components/Icon.svelte';

  let name = $state('');
  let creating = $state(false);
  let balances = $state({}); // groupId → your net balance, from the local cache

  $effect(() => {
    app.directory.length; // refresh when the list changes
    getAll(STORES.events).then((all) => {
      const byGroup = {};
      for (const e of all) (byGroup[e.spreadsheetId] ??= []).push(e);
      const out = {};
      for (const [id, events] of Object.entries(byGroup)) {
        out[id] = computeLedgerState(events).members[app.user.email]?.netBalance ?? 0;
      }
      balances = out;
    });
  });

  async function create(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (!navigator.onLine) return toast('You need to be online to create a group', 'error');
    creating = true;
    try {
      const id = await createGroup(n);
      name = '';
      go(`/g/${id}`);
    } catch (err) {
      toast(`Couldn't create group: ${err.message}`, 'error');
    } finally {
      creating = false;
    }
  }

  const firstName = $derived(app.user?.name?.split(' ')[0] || 'there');
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-black tracking-tight">Hi {firstName} 👋</h1>
    <p class="text-sm text-slate-500 dark:text-slate-400">Your shared expense groups.</p>
  </div>

  <form class="flex gap-2" onsubmit={create}>
    <input class="field flex-1" bind:value={name} placeholder="New group name, e.g. Goa Trip" maxlength="80" disabled={creating} />
    <button class="btn btn-primary shrink-0" disabled={creating || !name.trim()}>
      <Icon name="plus" class="w-4 h-4" />
      {creating ? 'Creating…' : 'Create'}
    </button>
  </form>

  {#if app.directory.length === 0}
    <div class="text-center py-12 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
      <div class="text-4xl">🧾</div>
      <p class="font-semibold">No groups yet</p>
      <p class="text-sm text-slate-500 dark:text-slate-400">Create one above, or open an invite link a friend sent you.</p>
    </div>
  {:else}
    <ul class="space-y-2">
      {#each app.directory as group (group.id)}
        {@const bal = balances[group.id] ?? 0}
        <li>
          <a href="#/g/{group.id}" class="card p-4 flex items-center gap-3 hover:border-accent-500/50 transition group">
            <span class="w-11 h-11 rounded-xl grid place-items-center bg-accent-500/10 text-accent-600 dark:text-accent-400 font-black text-lg shrink-0">
              {group.name.charAt(0).toUpperCase()}
            </span>
            <div class="flex-1 min-w-0">
              <div class="font-bold truncate">{group.name}</div>
              <div class="text-xs mt-0.5">
                {#if bal > 0.009}
                  <span class="text-emerald-600 dark:text-emerald-400 font-semibold">You're owed {money(bal)}</span>
                {:else if bal < -0.009}
                  <span class="text-rose-600 dark:text-rose-400 font-semibold">You owe {money(-bal)}</span>
                {:else}
                  <span class="text-slate-400">Settled up</span>
                {/if}
                {#if group.unsynced}<span class="text-amber-500"> · not synced</span>{/if}
              </div>
            </div>
            <Icon name="chevron" class="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>
