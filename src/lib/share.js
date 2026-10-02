// src/lib/share.js
// Reads what the OS share sheet sent to the installed app. public/sw.js (receiveShare) parks the
// shared files and text in SHARE_CACHE and opens #/share; the expense form then takes it.

// Keep in sync with public/sw.js.
const SHARE_CACHE = 'spreadshare-share';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const keyUrl = (key) => new URL(key, document.baseURI).href;

/** The pending share without consuming it: { text, files: File[], at } or null. */
export async function peekShared() {
  if (!('caches' in window) || !(await caches.has(SHARE_CACHE))) return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaRes = await cache.match(keyUrl('__share/meta'));
  if (!metaRes) return null;
  const meta = await metaRes.json();
  if (Date.now() - meta.at > MAX_AGE_MS) {
    await clearShared();
    return null;
  }
  const files = [];
  for (const f of meta.files || []) {
    const res = await cache.match(keyUrl(f.key));
    if (res) files.push(new File([await res.blob()], f.name || 'shared', { type: f.type || res.headers.get('Content-Type') || '' }));
  }
  if (!files.length && !meta.text?.trim()) return null;
  return { text: meta.text || '', files, at: meta.at };
}

export async function clearShared() {
  if ('caches' in window) await caches.delete(SHARE_CACHE);
}

/** Returns the pending share and removes it, so it's only used once. */
export async function takeShared() {
  const shared = await peekShared();
  await clearShared();
  return shared;
}
