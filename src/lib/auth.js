// src/lib/auth.js
// Google Identity Services token-model auth. Tokens are cached in localStorage so the
// PWA reopens signed in; expired tokens are refreshed through a single shared request.

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

const TOKEN_KEY = 'ss_oauth_token';
const EXPIRY_KEY = 'ss_oauth_expiry';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class AuthRequiredError extends Error {
  constructor(message = 'Google session expired') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

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
          error_callback: (err) => this.#settle(null, new Error(err?.message || err?.type || 'Sign-in cancelled')),
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
    if (res.error) return this.#settle(null, new Error(res.error_description || res.error));
    const expiry = Date.now() + res.expires_in * 1000;
    localStorage.setItem(TOKEN_KEY, res.access_token);
    localStorage.setItem(EXPIRY_KEY, String(expiry));
    this.#settle(res.access_token);
  }

  #settle(token, error) {
    const p = this.#pending;
    this.#pending = null;
    this.#inflight = null;
    if (!p) return;
    error ? p.reject(error) : p.resolve(token);
  }

  #request(options) {
    if (this.#inflight) return this.#inflight;
    if (!this.tokenClient) return Promise.reject(new AuthRequiredError('Google sign-in not loaded'));
    this.#inflight = new Promise((resolve, reject) => {
      this.#pending = { resolve, reject };
      this.tokenClient.requestAccessToken(options);
    });
    return this.#inflight;
  }

  /** Interactive sign-in. Must be called from a user gesture (click). */
  async login() {
    await this.init();
    const token = await this.#request({ prompt: '' });
    const profile = await this.fetchUserProfile(token);
    return { token, profile };
  }

  cachedToken(bufferMs = 0) {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || '0', 10);
    return token && Date.now() < expiry - bufferMs ? token : null;
  }

  /** Returns a usable token, attempting a silent refresh if the cached one is about to expire. */
  async ensureValidToken(emailHint) {
    const cached = this.cachedToken(REFRESH_BUFFER_MS);
    if (cached) return cached;
    try {
      await this.init(); // the sign-in script now loads in the background at startup
      return await this.#request({ prompt: 'none', hint: emailHint });
    } catch {
      // Silent refresh can fail (popup blocked, cookies cleared). Fall back to a still-valid token.
      const stillValid = this.cachedToken();
      if (stillValid) return stillValid;
      throw new AuthRequiredError();
    }
  }

  /** Drop a token the server rejected so the next call refreshes it. */
  invalidate() {
    localStorage.removeItem(EXPIRY_KEY);
  }

  logout() {
    const token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
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
