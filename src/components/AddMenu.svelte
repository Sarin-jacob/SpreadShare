<script>
  // "Add" with options: a floating speed-dial on phones / tablets, a split button on desktop.
  import { go } from '../lib/router.svelte.js';
  import { handoff } from '../lib/batch.svelte.js';
  import Icon from './Icon.svelte';

  /** variant: 'fab' | 'header' */
  let { groupId, variant = 'fab' } = $props();
  let open = $state(false);
  let fileEl = $state();
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  // Scan opens the camera (phones) or file picker right here, during the tap: browsers only allow
  // that in a tap, and navigating to the form first would use it up. The form takes the photo.
  function scan() {
    open = false;
    fileEl.click();
  }
  function onPicked(e) {
    const files = [...(e.currentTarget.files || [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    handoff.files = files;
    go(`/g/${groupId}/add`, { scan: '1' });
  }

  const OPTIONS = [
    { label: 'Expense', hint: 'Type it in', icon: 'edit', to: (id) => go(`/g/${id}/add`) },
    { label: 'Scan a receipt', hint: touch ? 'Opens the camera' : 'Pick a photo, screenshot or PDF', icon: 'scan', to: () => scan() },
    { label: 'Payment', hint: 'Someone paid someone back', icon: 'swap', to: (id) => go(`/g/${id}/add`, { type: 'TRANSFER' }) },
    { label: 'Import a list', hint: 'GPay / bank history, statements, Splitwise', icon: 'download', to: (id) => go(`/g/${id}/import`) },
  ];

  function pick(o) {
    if (o.icon === 'scan') return scan();
    open = false;
    o.to(groupId);
  }

  const onKey = (e) => e.key === 'Escape' && (open = false);
</script>

<svelte:window onkeydown={onKey} />

<input
  type="file"
  class="hidden"
  bind:this={fileEl}
  onchange={onPicked}
  accept={touch ? 'image/*' : 'image/*,application/pdf,.pdf'}
  capture={touch ? 'environment' : undefined}
  multiple={!touch}
/>

{#if variant === 'fab'}
  {#if open}
    <button class="lg:hidden fixed inset-0 z-20 bg-slate-900/40 backdrop-blur-[2px]" aria-label="Close menu" onclick={() => (open = false)}></button>
    <ul class="lg:hidden fixed z-30 right-5 bottom-[10.5rem] md:bottom-24 md:right-8 flex flex-col items-end gap-2" role="menu">
      {#each OPTIONS as o, i (o.label)}
        <li style="animation-delay:{(OPTIONS.length - i) * 25}ms" class="add-pop">
          <button role="menuitem" class="flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-2xl bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700" onclick={() => pick(o)}>
            <span class="text-right">
              <span class="block text-sm font-semibold">{o.label}</span>
              <span class="block text-[11px] text-slate-500">{o.hint}</span>
            </span>
            <span class="w-10 h-10 rounded-xl grid place-items-center bg-accent-500/15 text-accent-600 dark:text-accent-400"><Icon name={o.icon} class="w-5 h-5" /></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <button
    class="lg:hidden fixed z-30 right-5 bottom-24 md:bottom-8 md:right-8 w-14 h-14 rounded-2xl grid place-items-center text-white bg-accent-600 dark:bg-accent-500 shadow-xl shadow-accent-900/30 active:scale-95 transition"
    aria-label={open ? 'Close add menu' : 'Add'}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name="plus" class="w-6 h-6 transition-transform {open ? 'rotate-45' : ''}" stroke={2.5} />
  </button>
{:else}
  <div class="relative hidden lg:flex shrink-0">
    <button class="btn btn-primary !px-3 !py-2 !rounded-r-none" onclick={() => go(`/g/${groupId}/add`)} title="Add expense (N)">
      <Icon name="plus" class="w-4 h-4" /> Add expense
    </button>
    <button
      class="btn btn-primary !px-2 !py-2 !rounded-l-none border-l border-white/25"
      aria-label="More ways to add"
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={(e) => { e.stopPropagation(); open = !open; }}
    >
      <Icon name="chevron" class="w-4 h-4 rotate-90" />
    </button>
    {#if open}
      <button class="fixed inset-0 z-20 cursor-default" aria-label="Close menu" onclick={() => (open = false)}></button>
      <div class="absolute right-0 top-full mt-1 w-72 card shadow-xl p-1 z-30" role="menu">
        {#each OPTIONS as o (o.label)}
          <button role="menuitem" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left" onclick={() => pick(o)}>
            <Icon name={o.icon} class="w-4 h-4 text-accent-600 dark:text-accent-400" />
            <span>
              <span class="block text-sm font-semibold">{o.label}</span>
              <span class="block text-[11px] text-slate-500">{o.hint}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
