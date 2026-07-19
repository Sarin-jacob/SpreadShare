// src/js/services/CurrencyService.js

export class CurrencyService {
  static ratesCache = null;
  static lastFetch = 0;

  static async getMultiplier(fromCurrency, baseCurrency = 'INR') {
    if (fromCurrency === baseCurrency) return 1.0;

    const now = Date.now();
    // Cache rates locally for 12 hours to prevent network spam
    if (!this.ratesCache || (now - this.lastFetch > 12 * 60 * 60 * 1000)) {
      try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
        const data = await res.json();
        this.ratesCache = data.rates;
        this.lastFetch = now;
      } catch(e) {
        console.warn("Exchange rate fetch failed, falling back to cached or 1:1", e);
        if (!this.ratesCache) return 1.0; // Failsafe for offline mode
      }
    }

    const rate = this.ratesCache[fromCurrency];
    // The API returns how much foreign currency equals 1 Base Currency.
    // E.g., 1 INR = 0.012 USD. To get INR from USD, we multiply by (1 / 0.012).
    return rate ? (1 / rate) : 1.0;
  }
}