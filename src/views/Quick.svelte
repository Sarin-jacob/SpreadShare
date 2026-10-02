<script>
  // Home-screen shortcuts and quick add land here: #/quick/add or #/quick/scan.
  // Goes straight to the last-used group (or the only group); otherwise asks which one.
  import { app, lastGroupId } from '../lib/app.svelte.js';
  import { replace } from '../lib/router.svelte.js';
  import Icon from '../components/Icon.svelte';
  import GroupPicker from '../components/GroupPicker.svelte';

  let { action = 'add' } = $props();

  const query = $derived(action === 'scan' ? '?scan=1' : '');
  const pick = (id) => replace(`/g/${id}/add${query}`);

  $effect(() => {
    const target = lastGroupId() ?? (app.directory.length === 1 ? app.directory[0].id : null);
    if (target) pick(target);
  });
</script>

<div class="space-y-5">
  <div class="flex items-center gap-2">
    <a href="#/" class="btn btn-ghost !p-2 -ml-2" aria-label="Back"><Icon name="back" /></a>
    <h1 class="text-xl font-black tracking-tight flex-1">{action === 'scan' ? 'Scan a receipt' : 'Add an expense'}</h1>
  </div>
  <GroupPicker onpick={pick} />
</div>
