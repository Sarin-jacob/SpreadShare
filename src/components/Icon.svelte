<script>
  /** Stroke icons (Heroicons outline paths, see lib/iconPaths.js). */
  import { ICON_PATHS as PATHS } from '../lib/iconPaths.js';

  let { name, class: cls = 'w-5 h-5', stroke = 2 } = $props();
</script>

<svg class={cls} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
  <path d={PATHS[name]} />
</svg>
