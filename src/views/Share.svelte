<script>
  // Landing screen for things shared into the installed app (receipt photos, payment messages).
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte.js';
  import { peekShared, clearShared } from '../lib/share.js';
  import { parsePaymentText } from '../lib/paymentText.js';
  import { money } from '../lib/format.js';
  import { go, replace } from '../lib/router.svelte.js';
  import Icon from '../components/Icon.svelte';

  let shared = $state.raw(null);
  let loaded = $state(false);
  let preview = $state(null);

  const image = $derived(shared?.files.find((f) => f.type.startsWith('image/')) ?? null);
  const payment = $derived(shared && !image ? parsePaymentText(shared.text) : null);

  onMount(() => {
    peekShared().then((s) => {
      shared = s;
      loaded = true;
      if (image) preview = URL.createObjectURL(image);
      // One group: no need to ask.
      if (s && app.directory.length === 1) pick(app.directory[0].id);
    });
    return () => preview && URL.revokeObjectURL(preview);
  });

  function pick(groupId) {
    replace(`/g/${groupId}/add?shared=1`);
  }

  async function cancel() {
    await clearShared();
    go('/');
  }
</script>

<div class="space-y-5">
  <div class="flex items-center gap-2">
    <button class="btn btn-ghost !p-2 -ml-2" aria-label="Cancel" onclick={cancel}><Icon name="x" /></button>
    <h1 class="text-xl font-black tracking-tight flex-1">Add to SpreadShare</h1>
  </div>

  {#if !loaded}
    <div class="card h-24 animate-pulse"></div>
  {:else if !shared}
    <div class="card p-8 text-center space-y-3">
      <div class="text-4xl">📭</div>
      <p class="text-sm text-slate-500">Nothing was shared, or it was already added.</p>
      <a href="#/" class="btn btn-primary">Go to groups</a>
    </div>
  {:else}
    <div class="card p-4 flex items-center gap-4">
      {#if preview}
        <img src={preview} alt="Shared receipt" class="w-16 h-20 rounded-lg object-cover bg-slate-100 dark:bg-slate-900 shrink-0" />
        <div class="min-w-0">
          <div class="font-semibold">Receipt image</div>
          <div class="text-xs text-slate-500">It will open in the scanner.</div>
        </div>
      {:else}
        <span class="w-12 h-12 rounded-xl grid place-items-center bg-accent-500/10 text-accent-600 dark:text-accent-400 shrink-0"><Icon name="message" /></span>
        <div class="min-w-0 flex-1">
          {#if payment}
            <div class="font-semibold">{money(payment.amount, payment.currency || undefined)}{payment.merchant ? ` · ${payment.merchant}` : ''}</div>
            <div class="text-xs text-slate-500">
              {payment.direction === 'in' ? 'Money received' : 'Payment'}{payment.when ? ` · ${new Date(payment.when).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
            </div>
          {:else}
            <div class="font-semibold">Shared text</div>
          {/if}
          <p class="text-xs text-slate-400 mt-1 line-clamp-2 break-words">{shared.text}</p>
        </div>
      {/if}
    </div>

    {#if app.directory.length === 0}
      <p class="text-sm text-center text-slate-500">Create a group first, then share again.</p>
      <a href="#/" class="btn btn-primary w-full">Create a group</a>
    {:else}
      <section class="space-y-2">
        <h2 class="label px-1">Which group is it for?</h2>
        <ul class="space-y-2">
          {#each app.directory as g (g.id)}
            <li>
              <button class="card w-full p-4 flex items-center gap-3 text-left hover:border-accent-500/50 transition" onclick={() => pick(g.id)}>
                <span class="w-10 h-10 rounded-xl grid place-items-center bg-accent-500/10 text-accent-600 dark:text-accent-400 font-black">{g.name.charAt(0).toUpperCase()}</span>
                <span class="flex-1 font-semibold truncate">{g.name}</span>
                <Icon name="chevron" class="w-4 h-4 text-slate-400" />
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</div>
