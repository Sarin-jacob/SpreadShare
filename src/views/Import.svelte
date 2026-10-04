<script>
  // Bulk add from a list of transactions: GPay / PhonePe / Paytm / bank app history screenshots,
  // bank statement PDFs, or pasted messages. Read on the device, reviewed here, added in one go.
  import { app, appendEvent } from '../lib/app.svelte.js';
  import { ledger } from '../lib/ledger.svelte.js';
  import { displayName } from '../lib/engine.js';
  import { CONFIG } from '../lib/config.js';
  import { CATEGORIES } from '../lib/categories.js';
  import { getMultiplier } from '../lib/currency.js';
  import { computeSplit } from '../lib/split.js';
  import { round2 } from '../lib/math.js';
  import { parseTransactionList, dedupeTransactions, findDate } from '../lib/txnList.js';
  import { parsePaymentText } from '../lib/paymentText.js';
  import { suggestCategoryFor } from '../lib/categorize.js';
  import { getCategoryModel } from '../lib/categoryModel.svelte.js';
  import { findDuplicates } from '../lib/duplicates.js';
  import { ocrOffline, checkOcrOffline } from '../lib/ocrOffline.svelte.js';
  import { money } from '../lib/format.js';
  import { go } from '../lib/router.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import Icon from '../components/Icon.svelte';
  import Avatar from '../components/Avatar.svelte';

  let { groupId } = $props();

  const me = app.user.email;
  const L = $derived(ledger.current);
  const BASE = $derived(L.currency || CONFIG.DEFAULT_CURRENCY);
  const members = $derived(Object.keys(L.members).sort((a, b) => (a === me ? -1 : b === me ? 1 : 0)));
  const name = (email) => displayName(email, L.profiles, me);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  let step = $state('pick'); // pick | reading | review
  let progress = $state({ done: 0, total: 0, note: '' });
  let rows = $state([]);
  let pasteText = $state('');
  let payer = $state(me);
  let excluded = $state({});
  let saving = $state(false);
  let model = null;

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function toRows(txs) {
    return txs.map((t, i) => {
      const title = t.title;
      const amount = t.amount;
      const date = t.date ? ymd(t.date) : ymd(new Date());
      const dup = findDuplicates(L.expenses, { amount, when: `${date}T12:00`, title })[0] || null;
      return {
        id: `${Date.now()}-${i}`,
        include: t.direction !== 'credit' && !t.failed && !dup,
        title,
        amount: String(amount),
        date,
        undated: !t.date,
        currency: t.currency || BASE,
        direction: t.direction,
        failed: t.failed,
        dup,
        category: suggestCategoryFor({ title }, model)?.category || 'General',
      };
    });
  }

  async function readFiles(files) {
    files = [...files].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (!files.length) return;
    model = await getCategoryModel();
    step = 'reading';
    progress = { done: 0, total: files.length, note: '' };
    const found = [];
    try {
      const R = await import('../lib/receipt/index.js');
      for (const f of files) {
        const needsOcr = !R.isPdf(f);
        if (needsOcr && !R.isOcrReady()) {
          if ((await checkOcrOffline()) !== 'ready' && !navigator.onLine) throw new Error('offline-no-reader');
          progress.note = ocrOffline.status === 'ready' ? 'Starting the reader…' : 'Downloading the reader (~67 MB, once)…';
          await R.preloadOcr();
        }
        progress.note = '';
        const { lines } = await R.readListLines(f);
        found.push(...parseTransactionList(lines));
        progress.done++;
      }
    } catch (e) {
      console.error(e);
      toast(
        e?.message === 'offline-no-reader'
          ? 'You’re offline and the reader isn’t on this device yet. Text PDFs and pasted messages still work.'
          : e?.message || 'Couldn’t read that file',
        'error',
        { ms: 6000 }
      );
    }
    finish(found);
  }

  function readPasted() {
    const text = pasteText.trim();
    if (!text) return;
    // Several bank / UPI messages separated by blank lines, or a copied list.
    const chunks = text.split(/\n\s*\n/).map((c) => c.trim()).filter(Boolean);
    // (Day-first dates as Indian banks write them, when the message parser leaves the date open.)
    const messages = chunks.map((c) => {
      const m = parsePaymentText(c);
      return m && { ...m, day: m.date ? new Date(`${m.date.split('|')[0]}T12:00`) : findDate(c)?.date ?? null };
    }).filter(Boolean);
    const txs = messages.length >= Math.max(1, chunks.length * 0.6)
      ? messages.map((m) => ({
          title: m.merchant || (m.direction === 'in' ? 'Money received' : 'Payment'),
          amount: m.amount,
          currency: m.currency,
          direction: m.direction === 'in' ? 'credit' : 'debit',
          date: m.day,
          failed: false,
        }))
      : parseTransactionList(text.split('\n'));
    getCategoryModel().then((m) => {
      model = m;
      finish(txs);
    });
  }

  function finish(txs) {
    const unique = dedupeTransactions(txs);
    rows = [...rows, ...toRows(unique)].sort((a, b) => b.date.localeCompare(a.date));
    step = rows.length ? 'review' : 'pick';
    if (!unique.length) toast('No transactions found. Try a clearer screenshot or a text PDF.', 'info', { ms: 5000 });
  }

  const chosen = $derived(rows.filter((r) => r.include && Number(r.amount) > 0));
  const chosenTotal = $derived(chosen.reduce((s, r) => s + Number(r.amount), 0));
  const splitMembers = $derived(members.filter((m) => !excluded[m]));

  async function addAll() {
    if (!chosen.length || !splitMembers.length || saving) return;
    saving = true;
    try {
      const rates = {};
      for (const cur of new Set(chosen.map((r) => r.currency))) rates[cur] = cur === BASE ? 1 : (await getMultiplier(cur, BASE)) ?? null;
      const missing = Object.entries(rates).find(([, r]) => !r);
      if (missing) throw new Error(`No exchange rate for ${missing[0]} right now. Try again online.`);
      for (const r of chosen) {
        const amount = round2(Number(r.amount));
        const rate = rates[r.currency];
        const total = round2(amount * rate);
        const split = computeSplit('EQUALLY', total, members, { excluded });
        await appendEvent(groupId, 'EXPENSE_ADD', {
          title: r.title.trim() || 'Payment',
          raw_amount_string: String(amount),
          evaluated_amount: total,
          foreign_amount: amount,
          foreign_currency: r.currency,
          exchange_rate: rate,
          currency: BASE,
          custom_timestamp: new Date(`${r.date}T12:00`).toISOString(),
          category: r.category,
          split_strategy: 'EQUALLY',
          split_members: splitMembers,
          allocations: Object.entries(split.alloc).filter(([, v]) => v > 0).map(([user, value]) => ({ user, value })),
          payers: [{ user: payer, value: total }],
          import_source: 'list',
        });
      }
      toast(`Added ${chosen.length} expense${chosen.length === 1 ? '' : 's'}`);
      go(`/g/${groupId}`);
    } catch (e) {
      toast(e.message || 'Couldn’t add them', 'error');
    } finally {
      saving = false;
    }
  }

  const setAll = (on) => rows.forEach((r) => (r.include = on && !r.failed));
</script>

<div class="space-y-5 pb-24">
  <div class="flex items-center gap-2">
    <a href="#/g/{groupId}" class="btn btn-ghost !p-2 -ml-2" aria-label="Back"><Icon name="back" /></a>
    <h1 class="text-xl font-black tracking-tight flex-1">Import transactions</h1>
  </div>

  {#if step !== 'review'}
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Add many expenses at once from a screenshot of your GPay, PhonePe, Paytm or bank app history, or a bank statement PDF.
      Everything is read on this device.
    </p>
  {/if}

  {#if step === 'reading'}
    <div class="card p-6 text-center space-y-3">
      <div class="w-8 h-8 mx-auto rounded-full border-2 border-accent-500 border-t-transparent animate-spin"></div>
      <p class="text-sm">Reading {Math.min(progress.done + 1, progress.total)} of {progress.total}…</p>
      {#if progress.note}<p class="text-xs text-slate-500">{progress.note}</p>{/if}
    </div>
  {:else}
    <div class="card p-4 space-y-3">
      <div class="grid {touch ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'} gap-2">
        {#if touch}
          <label class="btn btn-soft !py-2.5 cursor-pointer">
            <Icon name="image" class="w-4 h-4" /> Screenshots
            <input type="file" accept="image/*" multiple class="hidden" onchange={(e) => readFiles(e.currentTarget.files)} />
          </label>
          <label class="btn btn-soft !py-2.5 cursor-pointer">
            <Icon name="sheet" class="w-4 h-4" /> Statement PDF
            <input type="file" accept="application/pdf,.pdf" multiple class="hidden" onchange={(e) => readFiles(e.currentTarget.files)} />
          </label>
        {:else}
          <label class="btn btn-soft !py-2.5 cursor-pointer sm:col-span-2">
            <Icon name="image" class="w-4 h-4" /> Choose screenshots or PDFs
            <input type="file" accept="image/*,application/pdf,.pdf" multiple class="hidden" onchange={(e) => readFiles(e.currentTarget.files)} />
          </label>
        {/if}
      </div>
      <p class="text-xs text-slate-400">Several overlapping screenshots of one long list are fine: repeats are merged.</p>
      <details class="text-sm" open={!rows.length && !touch}>
        <summary class="cursor-pointer text-xs font-semibold text-accent-700 dark:text-accent-300">Or paste bank / UPI messages</summary>
        <textarea class="field mt-2 min-h-24 text-sm" bind:value={pasteText} placeholder="Paste several messages, with a blank line between them"></textarea>
        <button type="button" class="btn btn-soft w-full !py-2 mt-2 text-sm" disabled={!pasteText.trim()} onclick={readPasted}>Read messages</button>
      </details>
    </div>
  {/if}

  {#if step === 'review'}
    <div class="flex items-center justify-between gap-2 text-sm">
      <span class="font-semibold">{rows.length} found · {chosen.length} selected</span>
      <span class="flex gap-3 text-xs font-semibold text-accent-600 dark:text-accent-400">
        <button type="button" onclick={() => setAll(true)}>Select all</button>
        <button type="button" onclick={() => setAll(false)}>None</button>
      </span>
    </div>

    <ul class="card divide-y divide-slate-100 dark:divide-slate-700/60">
      {#each rows as r (r.id)}
        <li class="p-3 space-y-2 {r.include ? '' : 'opacity-60'}">
          <div class="flex items-center gap-2">
            <input type="checkbox" class="w-5 h-5 shrink-0 accent-[var(--accent-500)]" bind:checked={r.include} aria-label="Add {r.title}" />
            <input class="field !py-1.5 flex-1 min-w-0" bind:value={r.title} aria-label="Title" />
            <input class="field !py-1.5 !w-24 text-right tabular-nums" bind:value={r.amount} inputmode="decimal" aria-label="Amount" />
          </div>
          <div class="flex flex-wrap items-center gap-2 pl-7 text-xs">
            <input type="date" class="field !w-auto !py-1 !px-2 text-xs {r.undated ? '!border-amber-500' : ''}" bind:value={r.date} aria-label="Date" title={r.undated ? 'No date found: check it' : ''} />
            <select class="field !w-auto !py-1 !px-2 text-xs" bind:value={r.category} aria-label="Category">
              {#each CATEGORIES as c (c.value)}<option value={c.value}>{c.icon} {c.label}</option>{/each}
            </select>
            {#if r.currency !== BASE}<span class="text-slate-500">{r.currency}</span>{/if}
            {#if r.direction === 'credit'}<span class="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold">Received</span>{/if}
            {#if r.failed}<span class="px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold">Failed</span>{/if}
            {#if r.dup}
              <a href="#/g/{groupId}/e/{r.dup.eventId}" class="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold" title="{r.dup.title}, {money(r.dup.amount)}">Already added?</a>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    <div class="card p-4 space-y-3">
      <div class="flex items-center gap-3">
        <label class="label !mb-0 w-20" for="imp-payer">Paid by</label>
        <select id="imp-payer" class="field flex-1" bind:value={payer}>
          {#each members as m (m)}<option value={m}>{m === me ? 'You' : name(m)}</option>{/each}
        </select>
      </div>
      <div>
        <span class="label">Split equally between</span>
        <div class="flex flex-wrap gap-1.5">
          {#each members as m (m)}
            {@const on = !excluded[m]}
            <button
              type="button"
              aria-pressed={on}
              class="flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full border text-xs font-medium transition
                {on ? 'border-accent-500 bg-accent-500/10' : 'border-slate-200 dark:border-slate-700 opacity-50'}"
              onclick={() => (excluded[m] = on)}
            >
              <Avatar email={m} profile={L.profiles[m]} size="w-5 h-5" />
              {name(m)}
            </button>
          {/each}
        </div>
      </div>
      <p class="text-xs text-slate-400">You can change any of them afterwards like a normal expense.</p>
    </div>

    <div class="sticky bottom-0 -mx-4 px-4 py-3 md:static md:mx-0 md:px-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur md:bg-transparent pb-safe">
      <button class="btn btn-primary w-full !py-3.5 text-base" disabled={!chosen.length || !splitMembers.length || saving} onclick={addAll}>
        {saving ? 'Adding…' : `Add ${chosen.length} expense${chosen.length === 1 ? '' : 's'} · ${money(chosenTotal, chosen.every((r) => r.currency === chosen[0]?.currency) ? chosen[0]?.currency : undefined)}`}
      </button>
    </div>
  {/if}
</div>
