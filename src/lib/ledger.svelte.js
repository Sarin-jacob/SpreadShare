// src/lib/ledger.svelte.js
// The active group's computed state, shared by every view that needs it.
import { app } from './app.svelte.js';
import { computeLedgerState } from './engine.js';

const state = $derived(computeLedgerState(app.events));

export const ledger = {
  get current() {
    return state;
  },
};
