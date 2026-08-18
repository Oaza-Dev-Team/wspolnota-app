import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword', () => {
  it('produces an argon2id hash, never the plaintext', async () => {
    const stored = await hashPassword('tajne-haslo');
    expect(stored).not.toContain('tajne-haslo');
    expect(stored.startsWith('$argon2id$')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await hashPassword('to-samo')).not.toBe(await hashPassword('to-samo'));
  });
});

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    expect(await verifyPassword(await hashPassword('poprawne'), 'poprawne')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    expect(await verifyPassword(await hashPassword('poprawne'), 'niepoprawne')).toBe(false);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await verifyPassword('to-nie-jest-hasz', 'cokolwiek')).toBe(false);
  });

  it('handles Polish characters in passwords', async () => {
    const stored = await hashPassword('zażółć-gęślą-jaźń');
    expect(await verifyPassword(stored, 'zażółć-gęślą-jaźń')).toBe(true);
  });
});
