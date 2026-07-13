// src/js/auth.js
let tokenClient;
let accessToken = null;

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets ' +
               'https://www.googleapis.com/auth/drive.file ' +
               'https://www.googleapis.com/auth/userinfo.email ' +
               'https://www.googleapis.com/auth/userinfo.profile';

export function initGoogleAuth(clientId, onAuthSuccess) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (tokenResponse) => {
          if (tokenResponse.error !== undefined) {
            console.error("OAuth Bridge Failure:", tokenResponse);
            return;
          }
          
          accessToken = tokenResponse.access_token;
          
          // Persist token session state strings
          const expiryTime = Date.now() + (tokenResponse.expires_in * 1000);
          sessionStorage.setItem('ss_oauth_token', accessToken);
          sessionStorage.setItem('ss_oauth_expiry', expiryTime.toString());

          try {
            const userProfile = await fetchUserProfile(accessToken);
            onAuthSuccess(accessToken, userProfile);
          } catch (err) {
            console.error("Failed to retrieve user profile parameters:", err);
          }
        },
      });
      resolve(); // Script fully populated and initialization completed
    };
    document.head.appendChild(script);
  });
}

/**
 * FIXED: Removed { prompt: 'consent' }. 
 * Google will now seamlessly skip the permission screen if the user has already approved these scopes.
 */
export function requestAuthenticationData() {
  tokenClient.requestAccessToken(); 
}

export function getAccessToken() {
  if (!accessToken) {
    const cachedToken = sessionStorage.getItem('ss_oauth_token');
    const expiry = parseInt(sessionStorage.getItem('ss_oauth_expiry') || '0');
    if (cachedToken && Date.now() < expiry) {
      accessToken = cachedToken;
    }
  }
  return accessToken;
}

/**
 * Dynamic Session Verification Router
 * Validates cached storage sessions immediately upon app initialization.
 */
export async function checkExistingSession(onAuthSuccess) {
  const activeToken = getAccessToken();
  if (activeToken) {
    try {
      // Validate token status live against profile endpoint parameters
      const userProfile = await fetchUserProfile(activeToken);
      onAuthSuccess(activeToken, userProfile);
      return true;
    } catch (err) {
      console.warn("Cached session expired or invalid. Clearing memory keys.", err);
      clearSessionContext();
    }
  }
  return false;
}

/**
 * Triggers explicit logouts
 */
export function clearSessionContext() {
  accessToken = null;
  sessionStorage.removeItem('ss_oauth_token');
  sessionStorage.removeItem('ss_oauth_expiry');
  // Optional: Remove group caching locations if you want a true blank slate state
  localStorage.removeItem('ss_active_sheet_id');
}

async function fetchUserProfile(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Profile verification rejection.");
  return res.json(); 
}