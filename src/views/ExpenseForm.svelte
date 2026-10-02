<script>
  import { untrack } from 'svelte';
  import { app, appendEvent } from '../lib/app.svelte.js';
  import { ledger } from '../lib/ledger.svelte.js';
  import { displayName, parsePayload } from '../lib/engine.js';
  import { CONFIG } from '../lib/config.js';
  import { CATEGORIES } from '../lib/categories.js';
  import { CURRENCIES, getMultiplier } from '../lib/currency.js';
  import { evaluate, evaluateLoose, round2 } from '../lib/math.js';
  import { computeSplit, exactWithRemainder } from '../lib/split.js';
  import { suggestCategory, expenseText } from '../lib/categorize.js';
  import { getCategoryModel } from '../lib/categoryModel.svelte.js';
  import { compressImage } from '../lib/image.js';
  import { money, toLocalInput } from '../lib/format.js';
  import { go, replace } from '../lib/router.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import Icon from '../components/Icon.svelte';
  import Avatar from '../components/Avatar.svelte';
  import ReceiptScanner from '../components/ReceiptScanner.svelte';

  let { groupId, editId = null, prefill = {} } = $props();

  const BASE = CONFIG.DEFAULT_CURRENCY;
  const me = app.user.email;
  const L = $derived(ledger.current);
  const members = $derived([...new Set([me, ...Object.keys(L.members)])]);
  const name = (email) => displayName(email, L.profiles, me);

  // ─── Form state ───
  let type = $state('EXPENSE_ADD');
  let title = $state('');
  let when = $state(toLocalInput());
  let amountExpr = $state('');
  let currency = $state(BASE);
  let rateExpr = $state('1');
  let rateLoading = $state(false);
  let categoryValue = $state('General');
  let categoryTouched = $state(false); // the user picked a category → never auto-change it
  let autoCategory = $state(null); // { category, source } when the current category was suggested
  let categoryModel = $state.raw(null);
  getCategoryModel().then((m) => (categoryModel = m));
  let payerMode = $state('SINGLE');
  let payer = $state(me);
  let payerInputs = $state({});
  let strategy = $state('EQUALLY');
  let excluded = $state({}); // email → true when left out of an equal split
  let splitInputs = $state({});
  let from = $state(me);
  let to = $state('');
  let interestExpr = $state('');
  let receipt = $state(null);
  let receiptItems = $state([]); // [{ name, amount: string, members: string[] }] for the 'ITEMS' split
  let receiptScan = $state(null); // compact copy of a scanned receipt, kept on the expense
  let scanFile = $state(null);
  let dropping = $state(false); // an image is being dragged over the scan card
  // Phones get separate Camera / Gallery buttons; desktops get a file picker + drag-and-drop + paste.
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let compressing = $state(false);
  let saving = $state(false);
  let ready = $state(false);

  // Editing an entry, or duplicating one (?copy=<eventId>) as a starting point
  const sourceId = $derived(editId || prefill.copy || null);
  const source = $derived(sourceId ? app.events.find((e) => e.eventId === sourceId) : null);

  // Initialise once the data we need is available (events load asynchronously).
  $effect(() => {
    if (ready) return;
    if (sourceId && !source && (app.groupLoading || !app.events.length)) return;
    untrack(() => {
      if (source) {
        loadFrom(source);
        if (!editId) when = toLocalInput(); // a duplicate happens now
      } else {
        applyPrefill();
      }
      ready = true;
    });
  });

  function applyPrefill() {
    if (prefill.type === 'TRANSFER' || prefill.type === 'LOAN') {
      type = prefill.type;
      from = prefill.from || me;
      to = prefill.to || '';
      title = prefill.type === 'TRANSFER' ? 'Settle up' : '';
    }
    if (prefill.amount) amountExpr = prefill.amount;
  }

  function loadFrom(ev) {
    const p = parsePayload(ev);
    type = ev.event_type;
    title = p.title || '';
    when = toLocalInput(p.custom_timestamp || ev.timestamp);
    currency = p.foreign_currency || BASE;
    rateExpr = String(p.exchange_rate || 1);
    amountExpr = p.raw_amount_string || String(p.foreign_amount ?? p.evaluated_amount ?? '');
    receipt = p.receipt_local_url || null;

    if (type === 'EXPENSE_ADD') {
      categoryValue = p.category || 'General';
      categoryTouched = true;
      receiptScan = p.receipt_scan || null;
      const payers = p.payers || [];
      if (payers.length > 1) {
        payerMode = 'MULTIPLE';
        payerInputs = Object.fromEntries(payers.map((x) => [x.user, String(round2(x.value))]));
      } else {
        payer = payers[0]?.user || ev.actor_identity;
      }
      const allocs = p.allocations || [];
      strategy = p.split_strategy || 'EQUALLY';
      if (strategy === 'EQUALLY') {
        const inSplit = new Set(p.split_members || allocs.filter((a) => a.value > 0).map((a) => a.user));
        excluded = Object.fromEntries(members.filter((m) => !inSplit.has(m)).map((m) => [m, true]));
      } else if (strategy === 'ITEMS' && p.receipt_items?.length) {
        receiptItems = p.receipt_items.map((i) => ({ name: i.name, amount: String(i.amount), members: [...i.members] }));
      } else if (p.split_inputs) {
        splitInputs = { ...p.split_inputs };
      } else {
        // Older entries only stored the resulting amounts; reproduce them exactly.
        strategy = 'EXACT';
        splitInputs = Object.fromEntries(allocs.map((a) => [a.user, String(round2(a.value))]));
      }
    } else {
      from = ev.actor_identity;
      to = p.target_peer_identity || '';
      interestExpr = p.interest_rate ? String(p.interest_rate) : '';
    }
  }

  // ─── Derived amounts ───
  const amount = $derived(evaluateLoose(amountExpr) ?? 0);
  const rate = $derived(currency === BASE ? 1 : evaluate(rateExpr) ?? 0);
  const total = $derived(round2(amount * rate));
  const hasOperator = $derived(/[+\-*/×÷]/.test(amountExpr.replace(/^-/, '')));

  // Item prices are typed in the bill's currency; convert them like the total before splitting.
  const itemsInBase = $derived(
    receiptItems.map((i) => {
      const v = evaluate(i.amount);
      return { ...i, amount: v === null ? i.amount : v * rate };
    })
  );

  const split = $derived(
    type === 'EXPENSE_ADD'
      ? computeSplit(strategy, total, members, { excluded, inputs: splitInputs, items: itemsInBase, nameOf: name })
      : { alloc: {} }
  );

  // Suggest a category from the description, scanned shop and item names as they change.
  $effect(() => {
    if (type !== 'EXPENSE_ADD' || categoryTouched) return;
    const text = expenseText({ title, receipt_scan: receiptScan, receipt_items: receiptItems });
    const s = suggestCategory(text, categoryModel);
    untrack(() => {
      autoCategory = s;
      categoryValue = s?.category ?? 'General';
    });
  });

  function pickCategory(value) {
    categoryValue = value;
    categoryTouched = true;
    autoCategory = null;
  }

  const payers = $derived.by(() => {
    if (payerMode === 'SINGLE') return { list: [{ user: payer, value: total }] };
    const r = exactWithRemainder(total, payerInputs, members, name);
    const list = Object.entries(r.vals || {}).filter(([, v]) => v > 0).map(([user, value]) => ({ user, value }));
    return { list, auto: r.auto, error: r.error && `Payers: ${r.error}` };
  });

  const error = $derived.by(() => {
    if (!(total > 0)) return 'Enter an amount';
    if (currency !== BASE && !(rate > 0)) return 'Enter an exchange rate';
    if (type === 'EXPENSE_ADD') {
      if (!title.trim()) return 'Add a description';
      return payers.error || split.error || null;
    }
    if (!to) return `Choose who ${type === 'LOAN' ? 'borrowed' : 'received'} it`;
    if (from === to) return 'Pick two different people';
    if (interestExpr.trim() && evaluate(interestExpr) === null) return 'Check the interest rate';
    return null;
  });

  // ─── Actions ───
  async function onCurrencyChange() {
    if (currency === BASE) return (rateExpr = '1');
    rateLoading = true;
    const r = await getMultiplier(currency, BASE);
    rateLoading = false;
    if (r) rateExpr = String(round4(r));
    else toast('Couldn’t fetch the exchange rate , enter it manually', 'info');
  }
  const round4 = (n) => Math.round(n * 10000) / 10000;

  function insert(op) {
    amountExpr = (amountExpr || '') + op;
  }
  function collapse() {
    const v = evaluate(amountExpr);
    if (v !== null) amountExpr = String(round2(v));
  }

  async function onFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    compressing = true;
    try {
      receipt = await compressImage(file);
    } catch {
      toast('Couldn’t read that image', 'error');
    } finally {
      compressing = false;
    }
  }

  // ─── Receipt scanning ───
  function startScan(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('That isn’t an image. Choose a photo or screenshot of the receipt.', 'error');
      return;
    }
    scanFile = file;
  }

  function onScanFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    startScan(file);
  }

  function onDrop(e) {
    e.preventDefault();
    dropping = false;
    startScan([...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/')) || e.dataTransfer?.files?.[0]);
  }

  /** Ctrl/Cmd+V a screenshot anywhere on the form to scan it (text pastes are left alone). */
  function onPaste(e) {
    if (type !== 'EXPENSE_ADD' || scanFile) return;
    const image = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!image) return;
    e.preventDefault();
    startScan(image);
  }

  function applyScan({ draft, image, mode, compact }) {
    scanFile = null;
    if (draft.amount != null) amountExpr = String(draft.amount);
    if (draft.currency && draft.currency !== currency && CURRENCIES.includes(draft.currency)) {
      currency = draft.currency;
      onCurrencyChange();
    }
    if (draft.title && !title.trim()) title = draft.title;
    if (draft.when) when = draft.when;
    // Category: picked up by the auto-categorise effect from the shop and item names.
    receipt = image;
    receiptScan = compact;

    const everyone = members.filter((m) => !excluded[m]);
    if (draft.items.length) {
      receiptItems = draft.items.map((i) => ({ name: i.name, amount: String(i.total), members: [...everyone] }));
    }
    if (mode === 'items') strategy = 'ITEMS';

    if (draft.amount == null) toast('No total found on the receipt , enter the amount', 'info');
    else toast(mode === 'items' ? 'Now tap who had each item' : 'Receipt read , check the details', 'info');
  }

  function addItem() {
    receiptItems.push({ name: '', amount: '', members: members.filter((m) => !excluded[m]) });
  }

  function toggleItemMember(item, m) {
    const i = item.members.indexOf(m);
    if (i === -1) item.members.push(m);
    else item.members.splice(i, 1);
  }

  async function save(e) {
    e?.preventDefault();
    if (error || saving) return;
    saving = true;

    const payload = {
      title: title.trim() || (type === 'TRANSFER' ? 'Payment' : 'Loan'),
      raw_amount_string: amountExpr,
      evaluated_amount: total,
      foreign_amount: round2(amount),
      foreign_currency: currency,
      exchange_rate: rate,
      currency: BASE,
      custom_timestamp: new Date(when).toISOString(),
    };
    let actor;

    if (type === 'EXPENSE_ADD') {
      Object.assign(payload, {
        category: categoryValue,
        split_strategy: strategy,
        allocations: Object.entries(split.alloc).filter(([, v]) => v > 0).map(([user, value]) => ({ user, value })),
        payers: payers.list,
      });
      if (strategy === 'EQUALLY') payload.split_members = members.filter((m) => !excluded[m]);
      else if (strategy === 'ITEMS') {
        payload.receipt_items = receiptItems.map((i) => ({ name: i.name.trim() || 'Item', amount: round2(evaluate(i.amount) ?? 0), members: [...i.members] }));
      } else payload.split_inputs = Object.fromEntries(Object.entries(splitInputs).filter(([, v]) => v?.trim()));
      if (receipt) payload.receipt_local_url = receipt;
      if (receiptScan) payload.receipt_scan = $state.snapshot(receiptScan);
    } else {
      payload.category = 'Financial';
      payload.target_peer_identity = to;
      actor = from;
      const interest = evaluate(interestExpr);
      if (type === 'LOAN' && interest > 0) {
        payload.interest_type = 'SIMPLE';
        payload.interest_rate = interest;
      }
    }

    try {
      if (editId) await appendEvent(groupId, 'EXPENSE_DELETE', { target_event_id: editId });
      await appendEvent(groupId, type, payload, { actor });
      toast(editId ? 'Changes saved' : 'Saved');
      replace(`/g/${groupId}`);
    } catch (err) {
      toast(`Couldn’t save: ${err.message}`, 'error');
      saving = false;
    }
  }

  const TYPES = [
    { value: 'EXPENSE_ADD', label: 'Expense' },
    { value: 'TRANSFER', label: 'Payment' },
    { value: 'LOAN', label: 'Loan' },
  ];
  const STRATEGIES = [
    { value: 'EQUALLY', label: 'Equally' },
    { value: 'SHARES', label: 'Shares' },
    { value: 'EXACT', label: 'Exact' },
    { value: 'ADJUSTMENT', label: '+/−' },
    { value: 'ITEMS', label: 'Items' },
  ];
  const HINTS = {
    SHARES: 'Weights per person (blank = 1, 0 = not included)',
    EXACT: 'Exact amounts , leave one blank to give it the remainder',
    ADJUSTMENT: 'Extra (+) or less (−) than an equal share',
    ITEMS: 'Tap who had each item. Tax, service and discounts are shared in proportion.',
  };
</script>

<svelte:window onpaste={onPaste} />

{#if !ready}
  <div class="py-20 text-center text-slate-400 text-sm">{editId ? 'Loading entry…' : ''}</div>
{:else}
  <form class="space-y-5" onsubmit={save}>
    <div class="flex items-center gap-2">
      <button type="button" class="btn btn-ghost !p-2 -ml-2" aria-label="Back" onclick={() => history.back()}><Icon name="back" /></button>
      <h1 class="text-xl font-black tracking-tight flex-1">{editId ? 'Edit entry' : prefill.copy ? 'Duplicate entry' : 'New entry'}</h1>
    </div>

    {#if !editId}
      <div class="seg">
        {#each TYPES as t}
          <button type="button" aria-pressed={type === t.value} onclick={() => (type = t.value)}>{t.label}</button>
        {/each}
      </div>
    {/if}

    {#if type === 'EXPENSE_ADD'}
      <div
        class="rounded-2xl border border-dashed px-4 py-3 transition
          {dropping ? 'border-accent-500 bg-accent-500/15' : 'border-accent-500/50 bg-accent-500/5'}"
        role="group"
        aria-label="Scan a receipt"
        ondragover={(e) => { e.preventDefault(); dropping = true; }}
        ondragleave={() => (dropping = false)}
        ondrop={onDrop}
      >
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-xl grid place-items-center bg-accent-500/15 text-accent-600 dark:text-accent-400 shrink-0"><Icon name="scan" /></span>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-bold">{receiptScan ? 'Scan another receipt' : 'Scan a receipt'}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              {dropping ? 'Drop the image to scan it' : touch ? 'Fills in the amount, date, shop and items. Read on this device.' : 'Fills in everything. Drop or paste (Ctrl+V) an image here too.'}
            </div>
          </div>
        </div>
        <div class="grid {touch ? 'grid-cols-2' : 'grid-cols-1 sm:w-56 sm:ml-[3.25rem]'} gap-2 mt-3">
          {#if touch}
            <label class="btn btn-soft !py-2 text-sm cursor-pointer">
              <Icon name="camera" class="w-4 h-4" /> Camera
              <input type="file" accept="image/*" capture="environment" class="hidden" onchange={onScanFile} />
            </label>
          {/if}
          <label class="btn btn-soft !py-2 text-sm cursor-pointer">
            <Icon name="image" class="w-4 h-4" /> {touch ? 'Gallery' : 'Choose image'}
            <input type="file" accept="image/*" class="hidden" onchange={onScanFile} />
          </label>
        </div>
      </div>
    {/if}

    <!-- Amount -->
    <div class="card p-4 space-y-3">
      <div class="flex items-center gap-2">
        <select class="field !w-auto !py-2 font-bold" bind:value={currency} onchange={onCurrencyChange} aria-label="Currency">
          {#each CURRENCIES as c}<option value={c}>{c}</option>{/each}
        </select>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="flex-1 min-w-0 bg-transparent text-right text-4xl font-black tracking-tight tabular-nums focus:outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
          bind:value={amountExpr}
          onblur={() => !hasOperator || collapse()}
          inputmode="decimal"
          placeholder="0.00"
          aria-label="Amount"
          autocomplete="off"
          autofocus={!editId}
        />
      </div>
      <div class="flex items-center gap-1.5">
        {#each ['+', '−', '×', '÷'] as op}
          <button type="button" class="btn btn-soft !px-0 !py-1 w-9 text-base" onclick={() => insert(op === '−' ? '-' : op === '×' ? '*' : op === '÷' ? '/' : op)}>{op}</button>
        {/each}
        <span class="flex-1 text-right text-sm text-slate-500 dark:text-slate-400 tabular-nums truncate">
          {#if hasOperator}= {money(amount, currency)}{/if}
        </span>
      </div>
      {#if currency !== BASE}
        <div class="flex items-center gap-2 text-sm border-t border-slate-100 dark:border-slate-700/60 pt-3">
          <span class="text-slate-500 shrink-0">1 {currency} =</span>
          <input class="field !py-1 !w-28 text-right tabular-nums" bind:value={rateExpr} inputmode="decimal" aria-label="Exchange rate" />
          <span class="text-slate-500">{BASE}</span>
          <span class="flex-1 text-right font-bold tabular-nums">{rateLoading ? '…' : money(total)}</span>
        </div>
      {/if}
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="label" for="f-title">Description</label>
        <input id="f-title" class="field" bind:value={title} maxlength="120" placeholder={type === 'EXPENSE_ADD' ? 'Dinner, cab, groceries…' : 'Optional note'} />
      </div>
      <div>
        <label class="label" for="f-when">Date</label>
        <input id="f-when" class="field" type="datetime-local" bind:value={when} />
      </div>
    </div>

    {#if type === 'EXPENSE_ADD'}
      <div>
        <div class="flex items-center justify-between gap-2">
          <span class="label">Category</span>
          {#if autoCategory && !categoryTouched}
            <span class="text-[11px] font-medium text-accent-600 dark:text-accent-400 mb-1.5" title="Tap a category to choose it yourself">
              ✨ Auto · {autoCategory.source === 'history' ? 'learned from your expenses' : 'matched keywords'}
            </span>
          {/if}
        </div>
        <div class="flex flex-wrap gap-1.5">
          {#each CATEGORIES as c}
            <button
              type="button"
              class="px-3 py-1.5 rounded-full text-xs font-semibold border transition
                {categoryValue === c.value ? 'border-accent-500 bg-accent-500/10 text-accent-700 dark:text-accent-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}"
              onclick={() => pickCategory(c.value)}
            >
              {c.icon} {c.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Paid by -->
      <div class="card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="label !mb-0">Paid by</span>
          <button type="button" class="text-xs font-semibold text-accent-600 dark:text-accent-400" onclick={() => (payerMode = payerMode === 'SINGLE' ? 'MULTIPLE' : 'SINGLE')}>
            {payerMode === 'SINGLE' ? 'Multiple people' : 'One person'}
          </button>
        </div>
        {#if payerMode === 'SINGLE'}
          <div class="flex flex-wrap gap-2">
            {#each members as m (m)}
              <button
                type="button"
                class="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-sm font-medium transition
                  {payer === m ? 'border-accent-500 bg-accent-500/10' : 'border-slate-200 dark:border-slate-700'}"
                onclick={() => (payer = m)}
              >
                <Avatar email={m} profile={L.profiles[m]} size="w-6 h-6" />
                {name(m)}
              </button>
            {/each}
          </div>
        {:else}
          <ul class="space-y-2">
            {#each members as m (m)}
              <li class="flex items-center gap-2">
                <Avatar email={m} profile={L.profiles[m]} size="w-7 h-7" />
                <span class="flex-1 text-sm truncate">{name(m)}</span>
                <input
                  class="field !w-28 !py-1.5 text-right tabular-nums"
                  inputmode="decimal"
                  bind:value={payerInputs[m]}
                  placeholder={payers.auto === m ? String(payers.list.find((p) => p.user === m)?.value ?? '0') : '0'}
                />
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <!-- Split -->
      <div class="card p-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="label !mb-0">Split</span>
          <div class="seg !p-0.5 flex-1 max-w-xs">
            {#each STRATEGIES as s}
              <button type="button" aria-pressed={strategy === s.value} onclick={() => (strategy = s.value)}>{s.label}</button>
            {/each}
          </div>
        </div>
        {#if HINTS[strategy]}<p class="text-xs text-slate-400">{HINTS[strategy]}</p>{/if}
        {#if strategy === 'ITEMS'}
          {#if receiptItems.length === 0}
            <p class="text-sm text-slate-500 text-center py-3">Scan a receipt above, or add items by hand.</p>
          {/if}
          <ul class="space-y-3">
            {#each receiptItems as item, idx (item)}
              <li class="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 space-y-2">
                <div class="flex items-center gap-2">
                  <input class="field !py-1.5 flex-1 min-w-0" bind:value={item.name} placeholder="Item {idx + 1}" aria-label="Item name" />
                  <input class="field !py-1.5 !w-24 text-right tabular-nums" bind:value={item.amount} inputmode="decimal" placeholder="0" aria-label="Item price" />
                  <button type="button" class="btn btn-ghost !p-1.5 shrink-0" aria-label="Remove item" onclick={() => receiptItems.splice(idx, 1)}><Icon name="x" class="w-4 h-4" /></button>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  {#each members as m (m)}
                    {@const on = item.members.includes(m)}
                    <button
                      type="button"
                      aria-pressed={on}
                      class="flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full border text-xs font-medium transition
                        {on ? 'border-accent-500 bg-accent-500/10' : 'border-slate-200 dark:border-slate-700 opacity-50'}"
                      onclick={() => toggleItemMember(item, m)}
                    >
                      <Avatar email={m} profile={L.profiles[m]} size="w-5 h-5" />
                      {name(m)}
                    </button>
                  {/each}
                </div>
              </li>
            {/each}
          </ul>
          <button type="button" class="btn btn-soft w-full !py-2 text-xs" onclick={addItem}><Icon name="plus" class="w-4 h-4" /> Add item</button>
          {#if split.itemsTotal != null}
            <p class="text-xs text-slate-500 text-center">
              Items {money(split.itemsTotal)}
              {#if Math.abs(split.extras) >= 0.05}
                · {split.extras > 0 ? 'tax & extras' : 'discounts'} {money(Math.abs(split.extras))} shared in proportion
              {/if}
            </p>
            {#if Math.abs(split.extras) > split.itemsTotal * 0.35}
              <p class="text-xs text-amber-600 dark:text-amber-400 text-center">Items and total are quite far apart : check for missing or misread items.</p>
            {/if}
          {/if}
        {/if}
        <ul class="space-y-2 {strategy === 'ITEMS' ? 'border-t border-slate-100 dark:border-slate-700/60 pt-3' : ''}">
          {#each members as m (m)}
            {@const share = split.alloc[m] ?? 0}
            <li class="flex items-center gap-2">
              {#if strategy === 'ITEMS'}
                <Avatar email={m} profile={L.profiles[m]} size="w-7 h-7" />
                <span class="flex-1 text-sm truncate">{name(m)}</span>
              {:else if strategy === 'EQUALLY'}
                <label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                  <input type="checkbox" class="w-4 h-4 accent-[var(--accent-500)]" checked={!excluded[m]} onchange={(e) => (excluded[m] = !e.currentTarget.checked)} />
                  <Avatar email={m} profile={L.profiles[m]} size="w-7 h-7" />
                  <span class="text-sm truncate {excluded[m] ? 'text-slate-400 line-through' : ''}">{name(m)}</span>
                </label>
              {:else}
                <Avatar email={m} profile={L.profiles[m]} size="w-7 h-7" />
                <span class="flex-1 text-sm truncate">{name(m)}</span>
                <input
                  class="field !w-24 !py-1.5 text-right tabular-nums"
                  inputmode="decimal"
                  bind:value={splitInputs[m]}
                  placeholder={strategy === 'SHARES' ? '1' : strategy === 'EXACT' && split.auto === m ? String(share) : '0'}
                />
              {/if}
              <span class="w-24 text-right text-sm font-semibold tabular-nums {share > 0 ? '' : 'text-slate-400'}">{money(share)}</span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Receipt -->
      <div class="card p-4">
        {#if receipt}
          <div class="flex items-center gap-3">
            <img src={receipt} alt="Receipt" referrerpolicy="no-referrer" class="w-16 h-16 rounded-lg object-cover" />
            <span class="flex-1 text-sm font-medium">Receipt attached</span>
            <button type="button" class="btn btn-ghost !p-2" aria-label="Remove receipt" onclick={() => (receipt = null)}><Icon name="x" /></button>
          </div>
        {:else}
          <label class="flex items-center gap-3 cursor-pointer text-sm text-slate-500 dark:text-slate-400">
            <span class="w-10 h-10 rounded-lg grid place-items-center bg-slate-100 dark:bg-slate-700"><Icon name="camera" /></span>
            {compressing ? 'Processing…' : 'Attach a receipt (optional)'}
            <input type="file" accept="image/*" class="hidden" onchange={onFile} />
          </label>
        {/if}
      </div>
    {:else}
      <div class="card p-4 space-y-4">
        {#each [{ label: type === 'LOAN' ? 'Lender' : 'Paid by', get: () => from, set: (v) => (from = v) }, { label: type === 'LOAN' ? 'Borrower' : 'Paid to', get: () => to, set: (v) => (to = v) }] as row, i}
          <div>
            <span class="label">{row.label}</span>
            <div class="flex flex-wrap gap-2">
              {#each members as m (m)}
                {@const selected = row.get() === m}
                <button
                  type="button"
                  disabled={i === 1 && m === from}
                  class="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-sm font-medium transition disabled:opacity-30
                    {selected ? 'border-accent-500 bg-accent-500/10' : 'border-slate-200 dark:border-slate-700'}"
                  onclick={() => { row.set(m); if (i === 0 && to === m) to = ''; }}
                >
                  <Avatar email={m} profile={L.profiles[m]} size="w-6 h-6" />
                  {name(m)}
                </button>
              {/each}
            </div>
          </div>
        {/each}
        {#if type === 'LOAN'}
          <div class="flex items-center gap-2">
            <label class="label !mb-0 flex-1" for="f-interest">Simple interest (optional)</label>
            <input id="f-interest" class="field !w-24 !py-1.5 text-right" inputmode="decimal" bind:value={interestExpr} placeholder="0" />
            <span class="text-sm text-slate-500">%</span>
          </div>
        {/if}
      </div>
    {/if}

    <div class="sticky bottom-0 -mx-4 px-4 py-3 md:static md:mx-0 md:px-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur md:bg-transparent md:backdrop-blur-none pb-safe">
      {#if error && amountExpr}
        <p class="text-xs text-rose-500 font-medium mb-2 text-center">{error}</p>
      {/if}
      <button class="btn btn-primary w-full !py-3.5 text-base" disabled={!!error || saving}>
        {saving ? 'Saving…' : editId ? 'Save changes' : `Save ${money(total)}`}
      </button>
    </div>
  </form>
{/if}

{#if scanFile}
  <ReceiptScanner file={scanFile} onapply={applyScan} onclose={() => (scanFile = null)} />
{/if}
