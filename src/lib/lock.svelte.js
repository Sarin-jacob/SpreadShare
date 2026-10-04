// src/lib/lock.svelte.js
// App lock with the device's own unlock (fingerprint, face, or the device PIN / pattern), via
// WebAuthn's platform authenticator. A privacy lock: it keeps someone holding your unlocked
// phone out of the app. It doesn't encrypt what's stored on the device.

const KEY = 'ss_lock';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

const saved = read();

export const lock = $state({
  enabled: !!saved?.credentialId,
  /** minutes in the background before it locks again (0 = straight away) */
  after: saved?.after ?? 1,
  locked: !!saved?.credentialId, // locked at every app start
  busy: false,
  error: null,
});

const b64url = {
  encode: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

function save(patch) {
  const next = { ...(read() || {}), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

/** True when this device has a built-in authenticator (fingerprint, face, Windows Hello, PIN). */
export async function lockSupported() {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** Registers a device credential for this app and turns the lock on. Call from a tap. */
export async function enableLock(user) {
  lock.busy = true;
  lock.error = null;
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'SpreadShare', id: location.hostname },
        user: { id: random(16), name: user.email, displayName: user.name || user.email },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    });
    save({ credentialId: b64url.encode(cred.rawId), after: lock.after });
    lock.enabled = true;
    return true;
  } catch (e) {
    lock.error = e?.name === 'NotAllowedError' ? 'Cancelled' : e?.message || 'Couldn’t set up the lock';
    return false;
  } finally {
    lock.busy = false;
  }
}

export function disableLock() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  lock.enabled = false;
  lock.locked = false;
}

export function setLockAfter(minutes) {
  lock.after = minutes;
  save({ after: minutes });
}

/** Asks for the fingerprint / face / device PIN. Resolves true when unlocked. */
export async function unlock() {
  const id = read()?.credentialId;
  if (!id) return (lock.locked = false), true;
  if (lock.busy) return false;
  lock.busy = true;
  lock.error = null;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: b64url.decode(id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    // Byte 32 of the authenticator data holds the flags; 0x04 = the user was verified.
    const flags = new Uint8Array(res.response.authenticatorData)[32];
    if (!(flags & 0x04)) throw new Error('Not verified');
    lock.locked = false;
    return true;
  } catch (e) {
    lock.error = e?.name === 'NotAllowedError' ? null : e?.message || 'Couldn’t unlock';
    return false;
  } finally {
    lock.busy = false;
  }
}

let hiddenAt = 0;

/** Locks again after the app has been in the background for `after` minutes. */
export function initLock() {
  document.addEventListener('visibilitychange', () => {
    if (!lock.enabled) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      // Straight away: lock before the app switcher takes its thumbnail.
      if (lock.after === 0) lock.locked = true;
    } else if (Date.now() - hiddenAt >= lock.after * 60_000) {
      lock.locked = true;
    }
  });
}
