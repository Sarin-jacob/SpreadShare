// js/auth.js
let tokenClient;
let accessToken = null;

// Scopes required for Drive Folder structures & Sheet row appends
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

export function initGoogleAuth(clientId, onAuthSuccess) {
  // Load the Identity client library dynamically
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          console.error("Authentication Error Matrix:", tokenResponse);
          return;
        }
        accessToken = tokenResponse.access_token;
        onAuthSuccess(accessToken);
      },
    });
  };
  document.head.appendChild(script);
}

export function requestAuthenticationData() {
  // Request token parsing or display Google pop-up picker
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function getAccessToken() {
  return accessToken;
}