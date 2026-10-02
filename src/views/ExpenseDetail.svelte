<script>
  import { app, appendEvent, pendingIds, restoreEvent } from '../lib/app.svelte.js';
  import { ledger } from '../lib/ledger.svelte.js';
  import { displayName } from '../lib/engine.js';
  import { category } from '../lib/categories.js';
  import { CONFIG } from '../lib/config.js';
  import { money, longDate } from '../lib/format.js';
  import { go, replace } from '../lib/router.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import Icon from '../components/Icon.svelte';
  import Avatar from '../components/Avatar.svelte';

  let { groupId, eventId } = $props();

  const me = app.user.email;
  const L = $derived(ledger.current);
  const x = $derived(L.expenses.find((e) => e.eventId === eventId));
  const p = $derived(x?.payload || {});
  const cat = $derived(x ? (x.type === 'EXPENSE_ADD' ? category(x.category) : category('Financial')) : null);
  const name = (email) => displayName(email, L.profiles, me);
  const TYPE_LABEL = { EXPENSE_ADD: 'Expense', TRANSFER: 'Payment', LOAN: 'Loan' };

  const payers = $derived(p.payers?.length ? p.payers : x ? [{ user: x.payer, value: x.amount }] : []);
  const shares = $derived(
    x?.type === 'EXPENSE_ADD'
      ? (p.allocations || []).filter((a) => a.value > 0)
      : x ? [{ user: x.target, value: x.amount }] : []
  );

  // Item prices are stored in the bill's own currency, like foreign_amount.
  const itemCur = $derived(p.foreign_currency || undefined);
  const billTotal = $derived(p.foreign_amount ?? x?.amount ?? 0);
  const itemsTotal = $derived((p.receipt_items || []).reduce((sum, it) => sum + (it.amount || 0), 0));

  let zoom = $state(false);

  async function del() {
    if (!confirm('Delete this entry? Balances will be recalculated for everyone.')) return;
    const original = $state.snapshot(x.event);
    try {
      await appendEvent(groupId, 'EXPENSE_DELETE', { target_event_id: eventId });
      navigator.vibrate?.([8, 40, 8]);
      toast(`Deleted “${x?.title ?? original.payload_json?.title}”`, 'info', {
        action: {
          label: 'Undo',
          run: async () => {
            await restoreEvent(groupId, original);
            toast('Restored');
          },
        },
      });
      replace(`/g/${groupId}`);
    } catch (e) {
      toast(`Delete failed: ${e.message}`, 'error');
    }
  }
</script>

<div class="space-y-5">
  <div class="flex items-center gap-2">
    <a href="#/g/{groupId}" class="btn btn-ghost !p-2 -ml-2" aria-label="Back"><Icon name="back" /></a>
    <h1 class="text-xl font-black tracking-tight flex-1">Details</h1>
  </div>

  {#if !x}
    <div class="card p-8 text-center text-sm text-slate-500">
      {app.groupLoading ? 'Loading…' : 'This entry was deleted or doesn’t exist.'}
    </div>
  {:else}
    <div class="card p-5 space-y-4">
      <div class="flex items-start gap-3">
        <span class="w-12 h-12 rounded-2xl grid place-items-center text-2xl shrink-0" style="background:{cat.color}22">{cat.icon}</span>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-bold leading-tight break-words">{x.title}</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {TYPE_LABEL[x.type]} · {cat.label} · {longDate(x.timestamp)}
          </p>
        </div>
      </div>
      <div>
        <div class="text-3xl font-black tabular-nums">{money(x.amount)}</div>
        {#if p.foreign_currency && p.foreign_currency !== (p.currency || CONFIG.DEFAULT_CURRENCY)}
          <div class="text-xs text-slate-500 mt-0.5">
            {money(p.foreign_amount, p.foreign_currency)} at {Number(p.exchange_rate).toFixed(4)}
          </div>
        {/if}
        {#if p.interest_rate}
          <div class="text-xs text-slate-500 mt-0.5">+ {p.interest_rate}% simple interest</div>
        {/if}
      </div>
      {#if pendingIds.has(eventId)}
        <p class="text-xs text-amber-600 dark:text-amber-400 font-medium">⏳ Saved on this device, waiting to sync</p>
      {/if}
    </div>

    <section class="card p-4 space-y-2">
      <h3 class="label">{x.type === 'LOAN' ? 'Lent by' : 'Paid by'}</h3>
      {#each payers as py (py.user)}
        <div class="flex items-center gap-3">
          <Avatar email={py.user} profile={L.profiles[py.user]} />
          <span class="flex-1 text-sm font-medium">{name(py.user)}</span>
          <span class="text-sm font-semibold tabular-nums">{money(py.value)}</span>
        </div>
      {/each}
    </section>

    <section class="card p-4 space-y-2">
      <h3 class="label">{x.type === 'EXPENSE_ADD' ? 'Split between' : x.type === 'LOAN' ? 'Borrowed by' : 'Paid to'}</h3>
      {#each shares as s (s.user)}
        <div class="flex items-center gap-3">
          <Avatar email={s.user} profile={L.profiles[s.user]} />
          <span class="flex-1 text-sm font-medium">{name(s.user)}</span>
          <span class="text-sm font-semibold tabular-nums">{money(s.value)}</span>
        </div>
      {/each}
    </section>

    {#if p.receipt_items?.length}
      <section class="card p-4 space-y-2">
        <h3 class="label">Items</h3>
        {#each p.receipt_items as it, i (i)}
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">{it.name}</div>
              <div class="flex -space-x-1.5 mt-1">
                {#each it.members as m (m)}<Avatar email={m} profile={L.profiles[m]} size="w-5 h-5" />{/each}
              </div>
            </div>
            <span class="text-sm tabular-nums">{money(it.amount, itemCur)}</span>
          </div>
        {/each}
        {#if Math.abs(billTotal - itemsTotal) >= 0.05}
          <p class="text-xs text-slate-500 border-t border-slate-100 dark:border-slate-700/60 pt-2">
            {billTotal > itemsTotal ? 'Tax & extras' : 'Discounts'} of {money(Math.abs(billTotal - itemsTotal), itemCur)} shared in proportion to each person's items.
          </p>
        {/if}
      </section>
    {:else if p.receipt_scan?.items?.length}
      <section class="card p-4 space-y-1.5">
        <h3 class="label">Receipt items</h3>
        {#each p.receipt_scan.items as it, i (i)}
          <div class="flex items-center gap-3 text-sm">
            <span class="flex-1 min-w-0 truncate">{it.name}</span>
            {#if it.qty && it.qty !== 1}<span class="text-xs text-slate-400">×{it.qty}</span>{/if}
            <span class="tabular-nums">{money(it.total, p.receipt_scan.currency || undefined)}</span>
          </div>
        {/each}
      </section>
    {/if}

    {#if x.receiptUrl}
      <section class="card p-4 space-y-2">
        <h3 class="label">Receipt</h3>
        <button type="button" class="block w-full" onclick={() => (zoom = true)}>
          <img src={x.receiptUrl} alt="Receipt" referrerpolicy="no-referrer" class="w-full max-h-72 object-contain rounded-xl bg-slate-100 dark:bg-slate-900" />
        </button>
      </section>
    {/if}

    {#if p.logged_by && p.logged_by !== x.payer}
      <p class="text-xs text-slate-400 text-center">Added by {name(p.logged_by)}</p>
    {/if}

    <div class="grid grid-cols-3 gap-2">
      <button class="btn btn-soft" onclick={() => go(`/g/${groupId}/e/${eventId}/edit`)}><Icon name="edit" class="w-4 h-4" /> Edit</button>
      <button class="btn btn-soft" onclick={() => go(`/g/${groupId}/add`, { copy: eventId })}><Icon name="copy" class="w-4 h-4" /> Duplicate</button>
      <button class="btn btn-danger" onclick={del}><Icon name="trash" class="w-4 h-4" /> Delete</button>
    </div>
  {/if}
</div>

{#if zoom && x?.receiptUrl}
  <button type="button" class="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onclick={() => (zoom = false)} aria-label="Close receipt">
    <img src={x.receiptUrl} alt="Receipt" referrerpolicy="no-referrer" class="max-w-full max-h-full rounded-lg" />
  </button>
{/if}
