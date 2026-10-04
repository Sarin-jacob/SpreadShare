<script>
  // UPI payment QR for desktop: scan it with any UPI app on your phone; payee and amount come
  // pre-filled (same upi://pay link the phone button opens).
  import { onMount } from 'svelte';
  import { upiPayLink } from '../lib/upi.js';
  import { money } from '../lib/format.js';
  import { toast } from '../lib/toast.svelte.js';
  import Icon from './Icon.svelte';

  /** payee: { upiId, name }, amount, note; onpaid(): record the payment; onclose() */
  let { payee, amount, note, onpaid, onclose } = $props();

  const link = $derived(upiPayLink({ upiId: payee.upiId, name: payee.name, amount, note }));
  let path = $state('');
  let size = $state(0);

  onMount(async () => {
    // The encoder is only needed here, so it stays out of the main bundle.
    const { default: qrcode } = await import('qrcode-generator');
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    size = n;
    path = d;
  });

  async function copyId() {
    try {
      await navigator.clipboard.writeText(payee.upiId);
      toast('UPI ID copied');
    } catch {
      toast(payee.upiId, 'info');
    }
  }

  const onKey = (e) => e.key === 'Escape' && onclose();
</script>

<svelte:window onkeydown={onKey} />

<div class="fixed inset-0 z-50 grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="card w-full max-w-sm p-5 space-y-4 text-center shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="upi-title">
    <div class="flex items-start gap-2 text-left">
      <div class="flex-1 min-w-0">
        <h2 id="upi-title" class="font-black text-lg tracking-tight">Pay {payee.name}</h2>
        <p class="text-xs text-slate-500">Scan with GPay, PhonePe, Paytm, BHIM or your bank's app</p>
      </div>
      <button class="btn btn-ghost !p-1.5 -mr-1.5" aria-label="Close" onclick={onclose}><Icon name="x" /></button>
    </div>

    <!-- Always dark on white: scanners expect it, also in dark mode -->
    <div class="mx-auto w-60 h-60 rounded-xl bg-white p-3 grid place-items-center">
      {#if path}
        <svg viewBox="-2 -2 {size + 4} {size + 4}" class="w-full h-full" shape-rendering="crispEdges" role="img" aria-label="UPI QR code for {payee.upiId}">
          <path d={path} fill="#0f172a" />
        </svg>
      {:else}
        <div class="w-8 h-8 rounded-full border-2 border-accent-500 border-t-transparent animate-spin"></div>
      {/if}
    </div>

    <div>
      <div class="text-3xl font-black tabular-nums">{money(amount)}</div>
      <button class="text-sm text-slate-500 hover:text-accent-600 inline-flex items-center gap-1" onclick={copyId} title="Copy UPI ID">
        {payee.upiId} <Icon name="copy" class="w-3.5 h-3.5" />
      </button>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <button class="btn btn-soft" onclick={onclose}>Cancel</button>
      <button class="btn btn-primary" onclick={onpaid}><Icon name="check" class="w-4 h-4" /> I've paid</button>
    </div>
    <p class="text-[11px] text-slate-400">“I've paid” records the payment in the group. UPI doesn't tell SpreadShare whether it went through.</p>
  </div>
</div>
