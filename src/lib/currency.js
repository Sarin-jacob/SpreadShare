// src/lib/currency.js
// Exchange rates from open.er-api.com, cached in localStorage for 12h so offline entry still works.

const CACHE_KEY = 'ss_fx_cache';
const TTL = 12 * 60 * 60 * 1000;

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY', 'AUD', 'CAD', 'THB'];

function readCache(base) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && c.base === base ? c : null;
  } catch {
    return null;
  }
}

/** Multiplier that converts 1 unit of `from` into `base`. Falls back to stale cache, then 1. */
export async function getMultiplier(from, base) {
  if (from === base) return 1;
  let cache = readCache(base);
  if (!cache || Date.now() - cache.fetchedAt > TTL) {
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
      const data = await res.json();
      if (data.rates) {
        cache = { base, fetchedAt: Date.now(), rates: data.rates };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      }
    } catch (e) {
      console.warn('Exchange rate fetch failed; using cached rates if available', e);
    }
  }
  const rate = cache?.rates?.[from];
  // API returns units of `from` per 1 `base`, so invert it.
  return rate ? 1 / rate : null;
}
