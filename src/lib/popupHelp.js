// src/lib/popupHelp.js
// How to allow pop-ups for this site in the browser you're using: Google's sign-in window is a
// pop-up, so with pop-ups blocked you can't sign in or reconnect.

export function popupHelp(ua = navigator.userAgent) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return 'Open Settings › Apps › Safari (Settings › Safari on older iOS) and turn off Block Pop-ups, then come back and try again.';
  if (/SamsungBrowser/.test(ua)) return 'Open the menu › Settings › Sites and downloads, turn off Block pop-ups, then try again.';
  if (/Firefox|FxiOS/.test(ua)) return 'Tap Options (or Preferences) on the bar that says Firefox prevented a pop-up, choose to allow pop-ups for this site, then try again.';
  if (/Android/.test(ua)) return 'Tap the icon left of the address bar › Permissions (or Site settings) › Pop-ups and redirects › Allow, then try again.';
  if (/Edg\//.test(ua) || /Chrome\//.test(ua)) return 'Click the blocked pop-up icon at the right end of the address bar, choose Always allow pop-ups from this site, then try again.';
  if (/Safari\//.test(ua)) return 'In the menu bar, choose Safari › Settings for This Website… and set Pop-up Windows to Allow, then try again.';
  return 'Allow pop-ups for this site in your browser’s settings, then try again.';
}
