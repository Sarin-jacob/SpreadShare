// src/lib/notify.svelte.js
// Notifications. There is no server, so nothing can be pushed to a closed app. What works:
//  - Activity: when a sync brings in other people's entries, payments or comments that involve
//    you, and the app isn't on screen (in the background, another tab), you get a notification.
//  - Reminders: recurring bills due tomorrow, from data already on the device. The page writes
//    a schedule to Cache Storage; the service worker shows due items on Android's periodic
//    background sync (installed app, roughly daily, Chrome decides) and whenever the app opens.
// Every notification has the app icon and a monochrome badge (Android's status bar shows the
// badge; without one it shows a generic browser icon). The app icon counts unread ones.
import { settings } from './settings.svelte.js';
import { describeActivity, reminderSchedule } from './notifyText.js';

const KEY = 'ss_notify';
export const NOTIFY_CACHE = 'spreadshare-notify'; // keep in sync with public/sw.js
const BADGE = './icons/badge-96.png';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
const saved = read();

export const notify = $state({
  supported: typeof Notification !== 'undefined' && 'serviceWorker' in navigator,
  permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  enabled: !!saved.enabled,
  activity: saved.activity ?? true, // entries / comments involving you
  payments: saved.payments ?? true, // someone paid you
  reminders: saved.reminders ?? true, // recurring bills due tomorrow
  background: false, // periodic background sync registered (installed Android app)
});

const on = () => notify.enabled && notify.permission === 'granted';

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ enabled: notify.enabled, activity: notify.activity, payments: notify.payments, reminders: notify.reminders }));
  } catch {}
}

export function setNotifyKind(kind, value) {
  notify[kind] = value;
  save();
}

/** Turns notifications on (asks the browser for permission; call from a tap). */
export async function enableNotifications() {
  if (!notify.supported) return false;
  notify.permission = await Notification.requestPermission();
  notify.enabled = notify.permission === 'granted';
  save();
  if (notify.enabled) await registerBackground();
  return notify.enabled;
}

export function disableNotifications() {
  notify.enabled = false;
  save();
  navigator.serviceWorker?.ready.then((r) => r.periodicSync?.unregister('ss-reminders')).catch(() => {});
  clearBadge();
}

/** Android, installed app: lets the service worker wake about daily to show reminders. */
async function registerBackground() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.periodicSync) return;
    const status = await navigator.permissions?.query({ name: 'periodic-background-sync' }).catch(() => null);
    if (status && status.state !== 'granted') return;
    await reg.periodicSync.register('ss-reminders', { minInterval: 12 * 3600_000 });
    notify.background = true;
  } catch {
    notify.background = false;
  }
}

const icon = () => `./icons/${settings.accent}-192.png`;

async function updateBadge(reg) {
  if (!('setAppBadge' in navigator)) return;
  const count = (await reg.getNotifications()).length;
  (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}

export function clearBadge() {
  if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
}

/** Shows notifications through the service worker (works when the page is in the background). */
export async function show(items) {
  if (!on() || !items.length) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    for (const n of items) {
      await reg.showNotification(n.title, { body: n.body, icon: icon(), badge: BADGE, tag: n.tag, data: { url: n.url } });
    }
    await updateBadge(reg);
  } catch (e) {
    console.warn('Notification failed', e);
  }
}

/**
 * New events from a group sync. Shown only while the app isn't on screen; while you're looking,
 * the feed already shows them.
 */
export function notifyActivity(fresh, all, ctx) {
  if (!on() || (!notify.activity && !notify.payments) || !fresh.length) return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  show(describeActivity(fresh, all, { ...ctx, kinds: { activity: notify.activity, payments: notify.payments } }));
}

/** Rewrites the reminder schedule the service worker reads, then asks it to show what's due. */
export async function scheduleReminders(groups, names, me) {
  if (!('caches' in window)) return;
  const items = on() && notify.reminders ? reminderSchedule(groups, names, me).map((r) => ({ ...r, icon: icon(), badge: BADGE })) : [];
  try {
    const cache = await caches.open(NOTIFY_CACHE);
    await cache.put('schedule', new Response(JSON.stringify({ items, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: 'CHECK_REMINDERS' });
  } catch {}
}

/** Opening the app counts as having seen the notifications. */
export function initNotifications() {
  if (typeof Notification !== 'undefined') notify.permission = Notification.permission;
  if (notify.permission !== 'granted') notify.enabled = false;
  if (on()) registerBackground();
  const seen = () => document.visibilityState === 'visible' && clearBadge();
  seen();
  document.addEventListener('visibilitychange', seen);
  // A tapped notification when the open window couldn't be navigated by the service worker.
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'OPEN' && typeof e.data.url === 'string' && e.data.url.startsWith('#/')) location.hash = e.data.url;
  });
}
