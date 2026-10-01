// src/lib/categoryModel.svelte.js
// The personal category model, trained on every cached expense across all groups and
// rebuilt whenever the local cache changes. Training is a few ms even for thousands of rows.
import { app } from './app.svelte.js';
import { loadAllEvents } from './cache.svelte.js';
import { deletedIds, eventIdOf, parsePayload } from './engine.js';
import { trainModel, expenseText } from './categorize.js';

let version = -1;
let pending = null;

export function getCategoryModel() {
  if (version !== app.cacheVersion || !pending) {
    version = app.cacheVersion;
    pending = loadAllEvents().then((events) => {
      const deleted = deletedIds(events);
      const examples = [];
      for (const e of events) {
        if (e.event_type !== 'EXPENSE_ADD' || deleted.has(eventIdOf(e))) continue;
        try {
          const p = parsePayload(e);
          examples.push({ text: expenseText(p), category: p.category });
        } catch {}
      }
      return trainModel(examples);
    });
  }
  return pending;
}
