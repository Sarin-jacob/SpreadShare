<script>
  // Covers the app until the device unlock (fingerprint, face, PIN) succeeds.
  import { onMount } from 'svelte';
  import { lock, unlock, disableLock } from '../lib/lock.svelte.js';
  import { logout } from '../lib/app.svelte.js';
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';

  // Try straight away; browsers that need a tap first just leave the button.
  onMount(() => {
    if (document.visibilityState === 'visible') unlock();
  });

  async function signOut() {
    if (!confirm('Sign out? This turns the lock off and removes this device’s copy of your groups. Your data stays in Google Drive.')) return;
    disableLock();
    await logout();
  }
</script>

<div class="fixed inset-0 z-[60] grid place-items-center bg-slate-50 dark:bg-slate-900 p-6 pb-safe" role="dialog" aria-modal="true" aria-label="SpreadShare is locked">
  <div class="w-full max-w-xs text-center space-y-6">
    <Logo class="w-16 h-16 mx-auto" />
    <div>
      <h1 class="text-xl font-black tracking-tight">SpreadShare is locked</h1>
      <p class="text-sm text-slate-500 mt-1">Use your fingerprint, face or device PIN.</p>
    </div>
    <button class="btn btn-primary w-full !py-3.5 text-base" onclick={unlock} disabled={lock.busy}>
      <Icon name="shield" class="w-5 h-5" /> {lock.busy ? 'Waiting…' : 'Unlock'}
    </button>
    {#if lock.error}<p class="text-xs text-rose-600 dark:text-rose-400">{lock.error}</p>{/if}
    <button class="text-xs text-slate-400 underline underline-offset-2" onclick={signOut}>Can’t unlock? Sign out</button>
  </div>
</div>
