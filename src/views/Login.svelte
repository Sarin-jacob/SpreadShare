<script>
  import { login } from '../lib/app.svelte.js';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';

  let busy = $state(false);
  let error = $state('');

  async function signIn() {
    busy = true;
    error = '';
    try {
      await login();
    } catch (e) {
      error = e.message || 'Sign-in failed';
    } finally {
      busy = false;
    }
  }

  const FEATURES = [
    { icon: 'sheet', text: 'Your ledger lives in a Google Sheet you own' },
    { icon: 'cloud', text: 'Works offline, syncs when you’re back' },
    { icon: 'swap', text: 'Fewest payments to settle everyone up' },
  ];
</script>

<div class="min-h-dvh grid place-items-center px-4 py-10">
  <div class="w-full max-w-sm space-y-8">
    <div class="text-center space-y-3">
      <Logo class="w-20 h-20 mx-auto drop-shadow-xl" />
      <h1 class="text-3xl font-black tracking-tight">SpreadShare</h1>
      <p class="text-slate-500 dark:text-slate-400">Split expenses with friends. No servers, no accounts , just your Google Drive.</p>
    </div>

    <ul class="card p-4 space-y-3">
      {#each FEATURES as f}
        <li class="flex items-center gap-3 text-sm">
          <span class="w-8 h-8 rounded-lg grid place-items-center bg-accent-500/10 text-accent-600 dark:text-accent-400 shrink-0">
            <Icon name={f.icon} class="w-4 h-4" />
          </span>
          {f.text}
        </li>
      {/each}
    </ul>

    <div class="space-y-3">
      <button class="btn btn-primary w-full !py-3" onclick={signIn} disabled={busy}>
        {busy ? 'Waiting for Google…' : 'Continue with Google'}
      </button>
      {#if error}
        <p class="text-sm text-rose-500 text-center">{error}</p>
      {/if}
      <p class="text-xs text-slate-400 text-center">
        SpreadShare only gets access to files it creates in your Drive.
      </p>
    </div>
  </div>
</div>
