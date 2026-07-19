// src/js/auth.js

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ');

class AuthenticationService {
  constructor() {
    this.tokenClient = null;
    this.accessToken = null;
    this.authPromiseResolver = null;
    this.authPromiseRejecter = null;
  }

  async init(clientId) {
    if (this.tokenClient) return;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: async (tokenResponse) => this._handleAuthCallback(tokenResponse),
        });
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  async _handleAuthCallback(tokenResponse) {
    if (tokenResponse.error !== undefined) {
      console.error("OAuth Bridge Failure:", tokenResponse);
      if (this.authPromiseRejecter) this.authPromiseRejecter(tokenResponse.error);
      return;
    }
    
    this.accessToken = tokenResponse.access_token;
    const expiryTime = Date.now() + (tokenResponse.expires_in * 1000);
    
    // SWITCHED TO LOCALSTORAGE: Keeps PWA logged in for months
    localStorage.setItem('ss_oauth_token', this.accessToken);
    localStorage.setItem('ss_oauth_expiry', expiryTime.toString());

    try {
      const userProfile = await this.fetchUserProfile(this.accessToken);
      if (this.authPromiseResolver) this.authPromiseResolver({ token: this.accessToken, profile: userProfile });
    } catch (err) {
      if (this.authPromiseRejecter) this.authPromiseRejecter(err);
    }
  }

  login() {
    return new Promise((resolve, reject) => {
      this.authPromiseResolver = resolve;
      this.authPromiseRejecter = reject;
      this.tokenClient.requestAccessToken(); 
    });
  }

  getAccessToken() {
    if (!this.accessToken) {
      const cachedToken = localStorage.getItem('ss_oauth_token');
      const expiry = parseInt(localStorage.getItem('ss_oauth_expiry') || '0', 10);
      if (cachedToken && Date.now() < expiry) {
        this.accessToken = cachedToken;
      }
    }
    return this.accessToken;
  }

  async checkExistingSession() {
    const activeToken = this.getAccessToken();
    if (!activeToken) return null;

    try {
      const userProfile = await this.fetchUserProfile(activeToken);
      return { token: activeToken, profile: userProfile };
    } catch (err) {
      console.warn("Cached session expired or invalid.");
      this.logout();
      return null;
    }
  }

  // ─── THE SILENT BACKGROUND REFRESHER ───
  async ensureValidToken(emailHint) {
    const cachedToken = localStorage.getItem('ss_oauth_token');
    const expiry = parseInt(localStorage.getItem('ss_oauth_expiry') || '0', 10);
    const bufferZone = 5 * 60 * 1000; // 5 minutes

    // If token is safe, return it instantly
    if (cachedToken && Date.now() < (expiry - bufferZone)) {
      this.accessToken = cachedToken;
      return cachedToken;
    }

    console.log("[Auth] Token expired or expiring soon. Silent refresh initiated...");

    return new Promise((resolve, reject) => {
      this.authPromiseResolver = resolve;
      this.authPromiseRejecter = reject;
      
      // prompt: 'none' tells Google to invisibly fetch a new token via iframe
      this.tokenClient.requestAccessToken({
         prompt: 'none',
         hint: emailHint // Required: Tells Google WHICH user session to refresh
      });
    }).then(res => res.token);
  }

  logout() {
    this.accessToken = null;
    localStorage.removeItem('ss_oauth_token');
    localStorage.removeItem('ss_oauth_expiry');
  }

  async fetchUserProfile(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Profile verification rejection.");
    return res.json(); 
  }
}

export const AuthService = new AuthenticationService();