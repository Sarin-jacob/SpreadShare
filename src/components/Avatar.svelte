<script>
  let { email = '', profile = null, size = 'w-8 h-8', class: cls = '' } = $props();

  let failed = $state(false);
  const name = $derived(profile?.name || email.split('@')[0] || '?');
  const initial = $derived(name.charAt(0).toUpperCase());
  $effect(() => {
    profile?.picture;
    failed = false;
  });
</script>

{#if profile?.picture && !failed}
  <img
    src={profile.picture}
    alt={name}
    title={name}
    referrerpolicy="no-referrer"
    class="{size} {cls} rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-slate-800"
    onerror={() => (failed = true)}
  />
{:else}
  <span
    title={name}
    class="{size} {cls} rounded-full shrink-0 grid place-items-center bg-gradient-to-br from-accent-400 to-accent-600 text-white font-bold text-[0.7em] ring-2 ring-white dark:ring-slate-800 select-none"
  >
    {initial}
  </span>
{/if}
