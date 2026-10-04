// src/lib/batch.svelte.js
// Several receipts picked (or shared) at once: the form scans them one after another. Each
// becomes its own draft to check and save; saving (or skipping) opens the next.

export const batch = $state({
  files: [], // still to do
  total: 0, // in this batch
});

export const batchPosition = () => batch.total - batch.files.length; // 1-based: the one on screen

export function startBatch(files) {
  batch.files = files.slice(1);
  batch.total = files.length;
  return files[0];
}

export const nextInBatch = () => batch.files.shift() || null;

export function endBatch() {
  batch.files = [];
  batch.total = 0;
}

/**
 * Photos picked before the form exists ("Scan a receipt" in the add menu opens the camera during
 * the tap, since browsers only allow that in a tap). The form takes them when it opens.
 */
export const handoff = { files: null };
