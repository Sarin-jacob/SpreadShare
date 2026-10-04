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
