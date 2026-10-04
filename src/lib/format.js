// src/lib/format.js
import { display } from './display.svelte.js';

const moneyFmt = new Map();

/** Formats an amount; without a currency, in the open group's (see display.svelte.js). */
export function money(n, currency = display.currency, { decimals = 2 } = {}) {
  const key = `${currency}:${decimals}`;
  if (!moneyFmt.has(key)) {
    try {
      moneyFmt.set(key, new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }));
    } catch {
      moneyFmt.set(key, { format: (v) => `${currency} ${v.toFixed(decimals)}` });
    }
  }
  return moneyFmt.get(key).format(Number(n) || 0);
}

export const shortDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export const longDate = (d) =>
  new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const monthLabel = (d) =>
  new Date(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(date = new Date()) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
