// src/lib/upi.js
// UPI IDs and payment links. Everyone sets their own UPI ID once (Settings); it's published to
// their groups as a PROFILE event so others can pay them from "Settle up".

/** "name@bank": 2-256 chars of letters, digits, . - _ before the @, a handle of letters after. */
export const isUpiId = (s) => /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i.test(String(s || '').trim());

export const normalizeUpiId = (s) => String(s || '').trim().toLowerCase();

/**
 * upi://pay deep link (NPCI linking spec). Opens the phone's UPI app chooser with the payee,
 * amount and a note filled in; the person still confirms and enters their PIN there.
 */
export function upiPayLink({ upiId, name, amount, note }) {
  const params = new URLSearchParams({ pa: normalizeUpiId(upiId), pn: String(name || '').slice(0, 50), cu: 'INR' });
  if (amount > 0) params.set('am', (Math.round(amount * 100) / 100).toFixed(2));
  if (note) params.set('tn', String(note).slice(0, 80));
  // URLSearchParams writes spaces as "+", which some UPI apps show literally.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

/** UPI deep links only do something on phones (Android opens the app chooser). */
export const canOpenUpi = () => /android|iphone|ipad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /mac/i.test(navigator.platform));
