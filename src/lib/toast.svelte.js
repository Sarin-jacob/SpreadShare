// src/lib/toast.svelte.js
export const toasts = $state([]);
let nextId = 1;

export function dismissToast(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

/**
 * @param {'success'|'error'|'info'} type
 * @param {{ ms?: number, action?: { label: string, run: () => unknown } }} [opts]
 */
export function toast(message, type = 'success', { ms, action } = {}) {
  const id = nextId++;
  toasts.push({ id, message, type, action });
  setTimeout(() => dismissToast(id), ms ?? (action ? 6000 : 3000));
  return id;
}
