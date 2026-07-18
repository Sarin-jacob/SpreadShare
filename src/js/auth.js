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
    if (this.tokenClient) return; // Already initialized

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

  // Resolves the promise created in login()
  async _handleAuthCallback(tokenResponse) {
    if (tokenResponse.error !== undefined) {
      console.error("OAuth Bridge Failure:", tokenResponse);
      if (this.authPromiseRejecter) this.authPromiseRejecter(tokenResponse.error);
      return;
    }
    
    this.accessToken = tokenResponse.access_token;
    const expiryTime = Date.now() + (tokenResponse.expires_in * 1000);
    
    sessionStorage.setItem('ss_oauth_token', this.accessToken);
    sessionStorage.setItem('ss_oauth_expiry', expiryTime.toString());

    try {
      const userProfile = await this.fetchUserProfile(this.accessToken);
      if (this.authPromiseResolver) this.authPromiseResolver({ token: this.accessToken, profile: userProfile });
    } catch (err) {
      if (this.authPromiseRejecter) this.authPromiseRejecter(err);
    }
  }

  // Now returns a Promise you can await in the UI
  login() {
    return new Promise((resolve, reject) => {
      this.authPromiseResolver = resolve;
      this.authPromiseRejecter = reject;
      this.tokenClient.requestAccessToken(); 
    });
  }

  getAccessToken() {
    if (!this.accessToken) {
      const cachedToken = sessionStorage.getItem('ss_oauth_token');
      const expiry = parseInt(sessionStorage.getItem('ss_oauth_expiry') || '0', 10);
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
      console.warn("Cached session expired or invalid. Clearing memory keys.");
      this.logout();
      return null;
    }
  }

  logout() {
    this.accessToken = null;
    sessionStorage.removeItem('ss_oauth_token');
    sessionStorage.removeItem('ss_oauth_expiry');
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