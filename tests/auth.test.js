import { describe, it, expect } from 'vitest';
import { missingFromScope, REQUIRED_SCOPES } from '../src/lib/auth.js';

describe('granted Google permissions', () => {
  const profile = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid';

  it('spots unticked Sheets / Drive boxes', () => {
    expect(missingFromScope(profile)).toEqual(['sheets', 'drive']);
    expect(missingFromScope(`${profile} ${REQUIRED_SCOPES.drive}`)).toEqual(['sheets']);
    expect(missingFromScope(`${REQUIRED_SCOPES.sheets} ${REQUIRED_SCOPES.drive} ${profile}`)).toEqual([]);
  });

  it('assumes everything is granted when it isn’t known (tokens from older versions)', () => {
    expect(missingFromScope(null)).toEqual([]);
  });
});

describe('blocked sign-in window', () => {
  it('is a sign-in error that says the pop-up was blocked', async () => {
    const { PopupBlockedError, AuthRequiredError } = await import('../src/lib/auth.js');
    const e = new PopupBlockedError();
    expect(e).toBeInstanceOf(AuthRequiredError);
    expect(e.popupBlocked).toBe(true);
  });

  it('explains how to allow pop-ups in the browser in use', async () => {
    const { popupHelp } = await import('../src/lib/popupHelp.js');
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    const samsung = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36';
    expect(popupHelp(android)).toMatch(/Pop-ups and redirects/);
    expect(popupHelp(iphone)).toMatch(/Block Pop-ups/);
    expect(popupHelp(desktop)).toMatch(/address bar/);
    expect(popupHelp(samsung)).toMatch(/Sites and downloads/);
  });
});
