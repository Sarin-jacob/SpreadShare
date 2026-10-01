<script>
  let { checked = false, onchange, label, disabled = false } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => onchange?.(!checked)}
  class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40
    {checked ? 'bg-accent-500' : 'bg-slate-300 dark:bg-slate-600'}"
>
  <span class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {checked ? 'translate-x-5' : ''}"></span>
</button>
