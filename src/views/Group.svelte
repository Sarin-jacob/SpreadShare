<script>
  import { app, pendingIds, groupName, inviteLink, syncGroup, removeGroup, exportCsv, setGroupCurrency } from '../lib/app.svelte.js';
  import { CONFIG } from '../lib/config.js';
  import { CURRENCIES } from '../lib/currency.js';
  import { ledger } from '../lib/ledger.svelte.js';
  import { optimizeDebts, displayName } from '../lib/engine.js';
  import { processAnalytics } from '../lib/insights.js';
  import { category } from '../lib/categories.js';
  import { money, monthLabel } from '../lib/format.js';
  import { go } from '../lib/router.svelte.js';
  import { toast } from '../lib/toast.svelte.js';
  import Icon from '../components/Icon.svelte';
  import Avatar from '../components/Avatar.svelte';
  import Donut from '../components/Donut.svelte';
  import UpiQr from '../components/UpiQr.svelte';
  import { entryMeta } from '../lib/history.js';
  import { splitTags, tagsOf } from '../lib/tags.js';
  import { prefs } from '../lib/prefs.svelte.js';
  import { upiPayLink, canOpenUpi } from '../lib/upi.js';

  let { groupId } = $props();

  let tab = $state('activity');
  let scope = $state('group');
  let menuOpen = $state(false);
  let sharing = $state(false);
  let query = $state('');
  let onlyMine = $state(false);
  let searchEl = $state();
  let qrFor = $state(null); // settlement shown as a UPI QR (desktop)

  const groupCurrency = $derived(L.currency || CONFIG.DEFAULT_CURRENCY);
  async function changeCurrency(e) {
    const c = e.currentTarget.value;
    menuOpen = false;
    if (c === groupCurrency) return;
    await setGroupCurrency(groupId, c);
    toast(`Balances in this group are now kept in ${c}`);
  }

  // Wide screens show balances in a side column instead of a tab.
  let vw = $state(window.innerWidth);
  const wide = $derived(vw >= 1024); // Tailwind's lg
  $effect(() => {
    if (wide && tab === 'balances') tab = 'activity';
  });

  const me = $derived(app.user.email);
  const L = $derived(ledger.current);
  const memberIds = $derived(Object.keys(L.members).sort((a, b) => (a === me ? -1 : b === me ? 1 : 0)));
  const myNet = $derived(L.members[me]?.netBalance ?? 0);
  const settlements = $derived(optimizeDebts(L.members));
  const analytics = $derived(processAnalytics(app.events, scope === 'you' ? me : null, 0));
  const name = (email) => displayName(email, L.profiles, me);

  const involvesMe = (x) =>
    x.payer === me ||
    x.target === me ||
    (x.payload.payers || []).some((p) => p.user === me) ||
    (x.payload.allocations || []).some((a) => a.user === me && a.value > 0);

  /** Entries matching the search box (title, category, people, amount). */
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return L.expenses.filter((x) => {
      if (onlyMine && !involvesMe(x)) return false;
      if (!q) return true;
      const people = [x.payer, x.target, ...(x.payload.payers || []).map((p) => p.user), ...(x.payload.allocations || []).map((a) => a.user)]
        .filter(Boolean)
        .map((e) => `${e} ${L.profiles[e]?.name || ''}`);
      const cat = category(x.category);
      return [x.title, x.payload.notes, cat.label, cat.value, String(x.amount), ...people].join(' ').toLowerCase().includes(q);
    });
  });
  const filterActive = $derived(!!query.trim() || onlyMine);
  const filteredTotal = $derived(filtered.filter((x) => x.type === 'EXPENSE_ADD').reduce((s, x) => s + x.amount, 0));

  /** Feed grouped by month. */
  /** Comment counts and "edited" marks for the feed. */
  const meta = $derived(entryMeta(app.events));

  const feed = $derived.by(() => {
    const groups = [];
    for (const x of filtered) {
      const label = monthLabel(x.timestamp);
      if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
      groups.at(-1).items.push(x);
    }
    return groups;
  });

  const GREEN = 'text-emerald-600 dark:text-emerald-400';
  const RED = 'text-rose-600 dark:text-rose-400';

  /** How an entry affects the signed-in user: { label, amount?, cls } */
  function impact(x) {
    if (x.type === 'EXPENSE_ADD') {
      const share = (x.payload.allocations || []).find((a) => a.user === me);
      const owes = share ? parseFloat(share.value) || 0 : 0;
      const paid = x.payload.payers?.length
        ? x.payload.payers.filter((p) => p.user === me).reduce((s, p) => s + (parseFloat(p.value) || 0), 0)
        : x.payer === me ? x.amount : 0;
      const net = paid - owes;
      if (net > 0.009) return { label: 'you lent', amount: net, cls: GREEN };
      if (net < -0.009) return { label: 'you borrowed', amount: -net, cls: RED };
      return { label: owes || paid ? 'settled' : 'not involved', cls: 'text-slate-400' };
    }
    if (x.payer === me) return { label: x.type === 'LOAN' ? 'you lent' : 'you paid', amount: x.amount, cls: GREEN };
    if (x.target === me) return { label: x.type === 'LOAN' ? 'you borrowed' : 'you received', amount: x.amount, cls: RED };
    return { label: 'not involved', cls: 'text-slate-400' };
  }

  function subtitle(x) {
    if (x.type === 'TRANSFER') return `${name(x.payer)} paid ${name(x.target)}`;
    if (x.type === 'LOAN') return `${name(x.payer)} lent ${name(x.target)}`;
    const payers = x.payload.payers || [];
    if (payers.length > 1) return `${payers.length} people paid`;
    return `${name(payers[0]?.user || x.payer)} paid`;
  }

  async function invite() {
    sharing = true;
    try {
      const url = await inviteLink(groupId);
      if (navigator.share) {
        await navigator.share({ title: `Join ${groupName(groupId)} on SpreadShare`, url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        toast('Invite link copied');
      }
    } catch (e) {
      toast(e.status === 403 || e.status === 404 ? 'Only the group creator can create invite links' : `Invite failed: ${e.message}`, 'error');
    } finally {
      sharing = false;
    }
  }

  async function refresh() {
    menuOpen = false;
    await syncGroup(groupId);
    toast('Group refreshed', 'info');
  }

  async function remove() {
    menuOpen = false;
    if (!confirm(`Remove “${groupName(groupId)}” from your list? The Google Sheet itself is not deleted.`)) return;
    await removeGroup(groupId);
    go('/');
  }

  function settle(s) {
    go(`/g/${groupId}/add`, { type: 'TRANSFER', from: s.from, to: s.to, amount: s.amount.toFixed(2) });
  }

  /**
   * Opens the phone's UPI app with the payee and amount filled in. When you come back, offers to
   * record the payment (the UPI app doesn't tell us whether it went through).
   */
  function payUpi(s) {
    const upiId = L.profiles[s.to]?.upi;
    if (!canOpenUpi()) {
      qrFor = s; // computer: scan a QR with your phone instead
      return;
    }
    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', ask);
      toast(`Paid ${name(s.to)} ${money(s.amount)}?`, 'info', { ms: 15000, action: { label: 'Record payment', run: () => settle(s) } });
    };
    document.addEventListener('visibilitychange', ask);
    location.href = upiPayLink({ upiId, name: L.profiles[s.to]?.name, amount: s.amount, note: `${groupName(groupId)} settle-up` });
  }

  /** Friendly nudge via the OS share sheet (WhatsApp, SMS, …) or the clipboard. */
  async function remind(s) {
    const firstName = (L.profiles[s.from]?.name || s.from.split('@')[0]).split(' ')[0];
    const upi = prefs.upi || L.profiles[me]?.upi;
    const text = `Hey ${firstName}! Quick reminder from SpreadShare: you owe me ${money(s.amount)} for “${groupName(groupId)}”.${upi ? ` My UPI ID is ${upi}.` : ''}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Reminder copied. Paste it in your chat.');
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  function onKey(e) {
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.key === 'n') {
      e.preventDefault();
      go(`/g/${groupId}/add`);
    } else if (e.key === '/') {
      e.preventDefault();
      tab = 'activity';
      queueMicrotask(() => searchEl?.focus());
    }
  }
</script>

<svelte:window bind:innerWidth={vw} onclick={(e) => !e.target.closest?.("[data-keep-menu]") && (menuOpen = false)} onkeydown={onKey} />

<div class="space-y-5 pb-16">
  <!-- Header -->
  <div class="flex items-start gap-2">
    <a href="#/" class="btn btn-ghost !p-2 -ml-2 shrink-0" aria-label="Back to groups"><Icon name="back" /></a>
    <div class="flex-1 min-w-0 pt-1">
      <h1 class="text-xl font-black tracking-tight truncate">{groupName(groupId)}</h1>
      <div class="flex items-center mt-1.5 -space-x-1.5">
        {#each memberIds.slice(0, 6) as m (m)}
          <Avatar email={m} profile={L.profiles[m]} size="w-6 h-6" />
        {/each}
        {#if memberIds.length > 6}
          <span class="pl-3 text-xs text-slate-400">+{memberIds.length - 6}</span>
        {/if}
      </div>
    </div>
    <button class="hidden lg:inline-flex btn btn-primary !px-3 !py-2 shrink-0" onclick={() => go(`/g/${groupId}/add`)} title="Add expense (N)">
      <Icon name="plus" class="w-4 h-4" /> Add expense
    </button>
    <button class="btn btn-soft !px-3 !py-2 shrink-0" onclick={invite} disabled={sharing}>
      <Icon name="share" class="w-4 h-4" /> <span class="hidden sm:inline">Invite</span>
    </button>
    <div class="relative shrink-0">
      <button class="btn btn-soft !p-2" aria-label="More actions" onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}>
        <Icon name="more" />
      </button>
      {#if menuOpen}
        <div class="absolute right-0 mt-1 w-52 card shadow-xl p-1 z-20 text-sm" role="menu">
          <button class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" onclick={refresh}>
            <Icon name="refresh" class="w-4 h-4" /> Refresh
          </button>
          <label class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg {L.expenses.length ? 'opacity-60' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}" title={L.expenses.length ? 'The currency can only change before the first entry' : 'Currency the balances are kept in'} data-keep-menu>
            <span class="w-4 text-center text-xs font-bold">¤</span>
            <span class="flex-1">Currency</span>
            <select class="bg-transparent text-right font-semibold" value={groupCurrency} disabled={!!L.expenses.length} onchange={changeCurrency}>
              {#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}
            </select>
          </label>
          <a class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" href="#/g/{groupId}/statement">
            <Icon name="sheet" class="w-4 h-4" /> Monthly statement
          </a>
          <button class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" onclick={() => exportCsv(groupId, app.events)}>
            <Icon name="download" class="w-4 h-4" /> Export CSV
          </button>
          <a class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" href="https://docs.google.com/spreadsheets/d/{groupId}" target="_blank" rel="noopener">
            <Icon name="sheet" class="w-4 h-4" /> Open Google Sheet
          </a>
          <button class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-500/10" onclick={remove}>
            <Icon name="trash" class="w-4 h-4" /> Remove from my list
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if app.sync.error && !app.sync.authExpired}
    <p class="text-xs rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-2">{app.sync.error}</p>
  {/if}

  <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8 lg:items-start">
  <div class="space-y-5 min-w-0">
  {#if !wide}{@render summaryCard()}{/if}

  <div class="seg" role="tablist">
    <button aria-pressed={tab === 'activity'} onclick={() => (tab = 'activity')}>Activity</button>
    {#if !wide}<button aria-pressed={tab === 'balances'} onclick={() => (tab = 'balances')}>Balances</button>{/if}
    <button aria-pressed={tab === 'insights'} onclick={() => (tab = 'insights')}>Insights</button>
  </div>

  {#if tab === 'activity'}
    {#if L.expenses.length > 0}
      <div class="flex items-center gap-2">
        <label class="relative flex-1">
          <Icon name="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            bind:this={searchEl}
            bind:value={query}
            type="search"
            class="field !pl-9 !py-2"
            placeholder="Search entries, people, categories"
            aria-label="Search entries"
            onkeydown={(e) => e.key === 'Escape' && ((query = ''), e.currentTarget.blur())}
          />
        </label>
        <button
          class="btn !px-3 !py-2 shrink-0 text-xs border {onlyMine ? 'border-accent-500 bg-accent-500/10 text-accent-700 dark:text-accent-300' : 'border-slate-200 dark:border-slate-700 text-slate-500'}"
          aria-pressed={onlyMine}
          onclick={() => (onlyMine = !onlyMine)}
        >
          Involving me
        </button>
      </div>
      {#if filterActive}
        <p class="text-xs text-slate-500 px-1">
          {filtered.length} of {L.expenses.length} entries · {money(filteredTotal)} in expenses
        </p>
      {/if}
    {/if}
    {#if app.groupLoading}
      <div class="space-y-2">
        {#each [0, 1, 2] as i (i)}<div class="card h-16 animate-pulse"></div>{/each}
      </div>
    {:else if L.expenses.length === 0}
      <div class="text-center py-10 space-y-3">
        <div class="text-4xl">✨</div>
        <p class="text-sm text-slate-500 dark:text-slate-400">No expenses yet. Add the first one!</p>
        <button class="btn btn-primary" onclick={() => go(`/g/${groupId}/add`)}><Icon name="plus" class="w-4 h-4" /> Add expense</button>
      </div>
    {:else if filtered.length === 0}
      <p class="text-sm text-center text-slate-400 py-8">Nothing matches your search.</p>
    {:else}
      <div class="space-y-5">
        {#each feed as month (month.label)}
          <section class="space-y-2">
            <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">{month.label}</h2>
            <ul class="card divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden">
              {#each month.items as x (x.eventId)}
                {@const cat = x.type === 'EXPENSE_ADD' ? category(x.category) : category('Financial')}
                {@const imp = impact(x)}
                {@const shown = splitTags(x.title)}
                {@const m = meta.get(x.eventId)}
                {@const allTags = tagsOf(x.payload)}
                <li>
                  <a href="#/g/{groupId}/e/{x.eventId}" class="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                    <div class="w-8 text-center shrink-0">
                      <div class="text-[10px] uppercase font-semibold text-slate-400 leading-none">{new Date(x.timestamp).toLocaleDateString(undefined, { month: 'short' })}</div>
                      <div class="text-lg font-bold leading-tight">{new Date(x.timestamp).getDate()}</div>
                    </div>
                    <span class="hidden sm:grid w-9 h-9 rounded-xl place-items-center text-lg shrink-0" style="background:{cat.color}22">{cat.icon}</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold flex items-center gap-1.5 min-w-0">
                        <span class="truncate">{shown.text}</span>
                        {#if pendingIds.has(x.eventId)}
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Waiting to sync"></span>
                        {/if}
                        {#if m?.comments}
                          <span class="shrink-0 text-[11px] font-medium text-slate-400 flex items-center gap-0.5" title="{m.comments} comment{m.comments > 1 ? 's' : ''}"><Icon name="message" class="w-3.5 h-3.5" />{m.comments}</span>
                        {/if}
                        {#if m?.edited}<span class="shrink-0 text-[10px] font-medium text-slate-400">edited</span>{/if}
                        {#if x.payload.recurring || x.payload.recurring_from}<span class="shrink-0 text-[11px]" title="Repeats">🔁</span>{/if}
                      </div>
                      {#if allTags.length}
                        <div class="flex gap-1 mt-0.5 overflow-hidden">
                          {#each allTags.slice(0, 3) as t (t)}<span class="px-1.5 rounded-full text-[10px] font-semibold bg-accent-500/10 text-accent-700 dark:text-accent-300 shrink-0">#{t}</span>{/each}
                        </div>
                      {/if}
                      <div class="text-xs text-slate-500 dark:text-slate-400 truncate"><span class="sm:hidden">{cat.icon} </span>{subtitle(x)} {money(x.amount)}</div>
                    </div>
                    <div class="text-right shrink-0 {imp.cls}">
                      <div class="text-[11px] font-medium leading-tight">{imp.label}</div>
                      {#if imp.amount}<div class="text-sm font-bold tabular-nums">{money(imp.amount)}</div>{/if}
                    </div>
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/if}
  {:else if tab === 'balances'}
    {@render balancesPanel()}
  {:else}
    <div class="seg">
      <button aria-pressed={scope === 'group'} onclick={() => (scope = 'group')}>Whole group</button>
      <button aria-pressed={scope === 'you'} onclick={() => (scope = 'you')}>Your share</button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="card p-4">
        <div class="label !mb-0.5">Total</div>
        <div class="text-xl font-black tabular-nums">{money(analytics.total)}</div>
      </div>
      <div class="card p-4">
        <div class="label !mb-0.5">Expenses</div>
        <div class="text-xl font-black tabular-nums">{analytics.count}</div>
      </div>
    </div>
    <div class="card p-4">
      <h2 class="label">By category</h2>
      <Donut data={analytics.categories} />
    </div>
  {/if}
  </div>

  {#if wide}
    <!-- Desktop: balances stay in view next to the activity feed -->
    <div class="space-y-5 sticky top-8">
      {@render summaryCard()}
      {@render balancesPanel()}
    </div>
  {/if}
  </div>
</div>

{#snippet summaryCard()}
  <div class="rounded-2xl p-5 text-white bg-gradient-to-br from-accent-600 to-accent-800 shadow-lg shadow-accent-900/20">
    <div class="text-xs font-semibold uppercase tracking-wider text-white/70">Your balance</div>
    <div class="text-3xl font-black tracking-tight mt-1 tabular-nums">
      {#if myNet > 0.009}
        +{money(myNet)}
      {:else if myNet < -0.009}
        −{money(-myNet)}
      {:else}
        All settled
      {/if}
    </div>
    <div class="text-sm text-white/80 mt-0.5">
      {#if myNet > 0.009}you are owed overall{:else if myNet < -0.009}you owe overall{:else}nothing owed either way{/if}
      · group spent {money(L.totalSpent, undefined, { decimals: 0 })}
    </div>
  </div>

{/snippet}

{#snippet balancesPanel()}
    <section class="space-y-2">
      <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Settle up</h2>
      {#if settlements.length === 0}
        <div class="card p-4 text-sm text-center text-emerald-600 dark:text-emerald-400 font-semibold">🎉 Everyone is settled up</div>
      {:else}
        <ul class="space-y-2">
          {#each settlements as s (s.from + s.to)}
            {@const involved = s.from === me || s.to === me}
            <li class="card p-3 flex flex-wrap items-center gap-3 {involved ? '!border-accent-500/40' : ''}">
              <div class="flex -space-x-2 shrink-0">
                <Avatar email={s.from} profile={L.profiles[s.from]} />
                <Avatar email={s.to} profile={L.profiles[s.to]} />
              </div>
              <div class="flex-1 min-w-0 text-sm">
                <span class="font-semibold">{name(s.from)}</span>
                <span class="text-slate-400">{s.from === me ? 'owe' : 'owes'}</span>
                <span class="font-semibold">{name(s.to)}</span>
                <div class="font-bold tabular-nums">{money(s.amount)}</div>
              </div>
              <div class="flex flex-col sm:flex-row lg:flex-row gap-1.5 shrink-0 lg:w-full lg:justify-end">
                {#if s.to === me}
                  <button class="btn btn-soft !px-3 !py-1.5 text-xs" onclick={() => remind(s)}><Icon name="bell" class="w-3.5 h-3.5" /> Remind</button>
                {/if}
                {#if s.from === me && L.profiles[s.to]?.upi && groupCurrency === 'INR'}<!-- UPI is rupees only -->
                  <button class="btn btn-primary !px-3 !py-1.5 text-xs" onclick={() => payUpi(s)} title="Pay {L.profiles[s.to].upi}">Pay with UPI</button>
                {/if}
                <button class="btn btn-soft !px-3 !py-1.5 text-xs" onclick={() => settle(s)}>Record payment</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="space-y-2">
      <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Members</h2>
      <ul class="card divide-y divide-slate-100 dark:divide-slate-700/60">
        {#each memberIds as m (m)}
          {@const d = L.members[m]}
          <li class="flex items-center gap-3 px-4 py-3">
            <Avatar email={m} profile={L.profiles[m]} />
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-sm truncate">{name(m)}</div>
              <div class="text-xs text-slate-400 truncate">
                {d.netBalance > 0.009 ? 'gets back' : d.netBalance < -0.009 ? 'owes' : 'settled up'}
              </div>
            </div>
            <div class="text-sm font-bold tabular-nums {d.netBalance > 0.009 ? 'text-emerald-600 dark:text-emerald-400' : d.netBalance < -0.009 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}">
              {d.netBalance > 0.009 ? '+' : d.netBalance < -0.009 ? '−' : ''}{money(Math.abs(d.netBalance))}
            </div>
          </li>
        {/each}
      </ul>
    </section>
{/snippet}

{#if qrFor}
  <UpiQr
    payee={{ upiId: L.profiles[qrFor.to]?.upi, name: L.profiles[qrFor.to]?.name || name(qrFor.to) }}
    amount={qrFor.amount}
    note="{groupName(groupId)} settle-up"
    onclose={() => (qrFor = null)}
    onpaid={() => { const s = qrFor; qrFor = null; settle(s); }}
  />
{/if}

<!-- Floating add button -->
<button
  class="lg:hidden fixed z-20 right-5 bottom-24 md:bottom-8 md:right-8 w-14 h-14 rounded-2xl grid place-items-center text-white bg-accent-600 dark:bg-accent-500 shadow-xl shadow-accent-900/30 active:scale-95 transition"
  aria-label="Add expense"
  onclick={() => go(`/g/${groupId}/add`)}
>
  <Icon name="plus" class="w-6 h-6" stroke={2.5} />
</button>
