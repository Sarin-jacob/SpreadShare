<script>
  // The app icon drawn inline with CSS variables, so it follows the accent colour live.
  import { brandIconSvg, CSS_VAR_SHADES } from '../lib/brandIcon.js';

  let { class: cls = 'w-8 h-8' } = $props();

  const svg = brandIconSvg(CSS_VAR_SHADES, { id: `ss-logo-${Math.random().toString(36).slice(2, 8)}` });
</script>

<span class="{cls} inline-block shrink-0 [&>svg]:w-full [&>svg]:h-full" aria-hidden="true">{@html svg}</span>
