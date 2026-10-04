// src/lib/display.svelte.js
// The currency amounts are shown in by default: the open group's currency, or your default
// currency on pages that span groups. Reactive, so money() in templates follows it.
import { CONFIG } from './config.js';

export const display = $state({ currency: CONFIG.DEFAULT_CURRENCY });
