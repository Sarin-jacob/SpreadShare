// src/lib/toast.svelte.js
export const toasts = $state([]);
let nextId = 1;

/** @param {'success'|'error'|'info'} type */
export function toast(message, type = 'success', ms = 3000) {
  const id = nextId++;
  toasts.push({ id, message, type });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i !== -1) toasts.splice(i, 1);
  }, ms);
}
