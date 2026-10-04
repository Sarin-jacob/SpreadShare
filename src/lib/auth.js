// src/lib/auth.js
// Google Identity Services token-model auth. Tokens are cached in localStorage so the
// PWA reopens signed in; expired tokens are refreshed through a single shared request.
//
// Access tokens last one hour and there is no refresh token without a server. Getting a new one
// opens a (usually instantly closing) Google popup, which browsers only allow during a tap or key
// press. So refreshes happen on the user's next interaction (see app.svelte.js), never from a
// background timer, which would only trip the popup blocker.

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// What the app can't work without. Google's consent screen lets people untick these.
export const REQUIRED_SCOPES = {
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  drive: 'https://www.googleapis.com/auth/drive.file',
};

/** Which required permissions a granted-scopes string (space separated) lacks. */
export function missingFromScope(scope) {
  if (scope == null) return []; // not known (token from an older version): assume granted
  const granted = String(scope).split(/\s+/);
  return Object.entries(REQUIRED_SCOPES)
    .filter(([, url]) => !granted.includes(url))
    .map(([name]) => name);
}

/** Google refused a call because a permission wasn't granted (the box was unticked). */
export class MissingPermissionError extends Error {
  constructor(message = 'SpreadShare doesn’t have permission to use your Google Sheets / Drive') {
    super(message);
    this.name = 'MissingPermissionError';
  }
}

const TOKEN_KEY = 'ss_oauth_token';
const SCOPE_KEY = 'ss_oauth_scope';
const EXPIRY_KEY = 'ss_oauth_expiry';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class AuthRequiredError extends Error {
  /** needsUser: Google wants the user to pick an account / consent again (a silent refresh won't do). */
  constructor(message = 'Google session expired', { needsUser = false } = {}) {
    super(message);
    this.name = 'AuthRequiredError';
    this.needsUser = needsUser;
  }
}

// Errors from a silent (prompt: 'none') request that mean only an interactive sign-in can help.
const NEEDS_USER = /interaction_required|consent_required|login_required|account_selection_required|access_denied/;
// Without a reply the popup was blocked or closed; settle rather than hang every API call.
const REQUEST_TIMEOUT_MS = { silent: 20_000, interactive: 180_000 };

/** True while the page may open a popup (inside a tap / key press). */
export const canOpenPopup = () => navigator.userActivation?.isActive ?? true;

class AuthenticationService {
  tokenClient = null;
  clientId = null;
  #loading = null;
  #pending = null; // { resolve, reject } for the in-flight token request
  #inflight = null; // shared promise so concurrent callers don't clobber each other

  init(clientId = this.clientId) {
    this.clientId = clientId;
    if (this.#loading) return this.#loading;
    this.#loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: (res) => this.#onToken(res),
          error_callback: (err) => this.#settle(null, new AuthRequiredError(err?.message || err?.type || 'Sign-in cancelled')),
        });
        resolve();
      };
      script.onerror = () => {
        this.#loading = null;
        reject(new Error('Could not load Google sign-in (offline?)'));
      };
      document.head.appendChild(script);
    });
    return this.#loading;
  }

  #onToken(res) {
    if (res.error) {
      return this.#settle(null, new AuthRequiredError(res.error_description || res.error, { needsUser: NEEDS_USER.test(res.error) }));
    }
    const expiry = Date.now() + res.expires_in * 1000;
    localStorage.setItem(TOKEN_KEY, res.access_token);
    localStorage.setItem(EXPIRY_KEY, String(expiry));
    // The permissions actually granted (people can untick Sheets / Drive on Google's screen).
    if (res.scope) localStorage.setItem(SCOPE_KEY, res.scope);
    this.#settle(res.access_token);
  }

  #settle(token, error) {
    const p = this.#pending;
    this.#pending = null;
    this.#inflight = null;
    clearTimeout(this.#timer);
    if (!p) return;
    error ? p.reject(error) : p.resolve(token);
  }

  #timer = null;

  #request(options, timeoutMs) {
    if (this.#inflight) return this.#inflight;
    if (!this.tokenClient) return Promise.reject(new AuthRequiredError('Google sign-in not loaded'));
    this.#inflight = new Promise((resolve, reject) => {
      this.#pending = { resolve, reject };
      this.#timer = setTimeout(() => this.#settle(null, new AuthRequiredError('Google sign-in timed out')), timeoutMs);
      this.tokenClient.requestAccessToken(options);
    });
    return this.#inflight;
  }

  /**
   * Interactive sign-in. Must be called from a user gesture (click).
   * @param hint email of the account to reconnect, so Google can skip the account chooser
   */
  async login(hint) {
    await this.init();
    const token = await this.#request({ prompt: '', ...(hint ? { hint } : {}) }, REQUEST_TIMEOUT_MS.interactive);
    const profile = await this.fetchUserProfile(token);
    return { token, profile };
  }

  /**
   * New token without any Google UI when the account is still signed in and consented.
   * Call it from a tap or key press: it opens a popup that closes by itself.
   */
  async refreshSilently(hint) {
    await this.init();
    return this.#request({ prompt: 'none', ...(hint ? { hint } : {}) }, REQUEST_TIMEOUT_MS.silent);
  }

  /** Required permissions the current token lacks: [] when all are granted. */
  missingScopes() {
    return missingFromScope(localStorage.getItem(SCOPE_KEY));
  }

  /**
   * Shows Google's consent screen again (with every box) so missing permissions can be granted.
   * Must be called from a tap.
   */
  async requestPermissions(hint) {
    await this.init();
    return this.#request({ prompt: 'consent', ...(hint ? { hint } : {}) }, REQUEST_TIMEOUT_MS.interactive);
  }

  /** Milliseconds until the cached token expires (≤ 0 when there is none or it has expired). */
  expiresIn() {
    if (!localStorage.getItem(TOKEN_KEY)) return 0;
    return parseInt(localStorage.getItem(EXPIRY_KEY) || '0', 10) - Date.now();
  }

  cachedToken(bufferMs = 0) {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || '0', 10);
    return token && Date.now() < expiry - bufferMs ? token : null;
  }

  /**
   * Returns a usable token. If the cached one is about to expire and the page may open a popup
   * right now, refreshes it silently; otherwise uses what's left of it.
   */
  async ensureValidToken(emailHint) {
    const cached = this.cachedToken(REFRESH_BUFFER_MS);
    if (cached) return cached;
    if (canOpenPopup()) {
      try {
        return await this.refreshSilently(emailHint);
      } catch (e) {
        const stillValid = this.cachedToken();
        if (stillValid) return stillValid;
        throw e instanceof AuthRequiredError ? e : new AuthRequiredError();
      }
    }
    const stillValid = this.cachedToken();
    if (stillValid) return stillValid;
    throw new AuthRequiredError();
  }

  /** Drop a token the server rejected so the next call refreshes it. */
  invalidate() {
    localStorage.removeItem(EXPIRY_KEY);
  }

  logout() {
    const token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(SCOPE_KEY);
    if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
  }

  async fetchUserProfile(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) throw new AuthRequiredError();
    if (!res.ok) throw new Error('Could not load Google profile');
    return res.json();
  }
}

export const AuthService = new AuthenticationService();
