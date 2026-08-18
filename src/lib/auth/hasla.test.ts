import { describe, expect, it } from 'vitest';
import { sprawdzHaslo, zahashuj } from './hasla';

describe('zahashuj', () => {
  it('produces an argon2id hash, never the plaintext', async () => {
    const hasz = await zahashuj('tajne-haslo');
    expect(hasz).not.toContain('tajne-haslo');
    expect(hasz.startsWith('$argon2id$')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await zahashuj('to-samo')).not.toBe(await zahashuj('to-samo'));
  });
});

describe('sprawdzHaslo', () => {
  it('accepts the correct password', async () => {
    const hasz = await zahashuj('poprawne');
    expect(await sprawdzHaslo(hasz, 'poprawne')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hasz = await zahashuj('poprawne');
    expect(await sprawdzHaslo(hasz, 'niepoprawne')).toBe(false);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await sprawdzHaslo('to-nie-jest-hasz', 'cokolwiek')).toBe(false);
  });

  it('handles Polish characters in passwords', async () => {
    const hasz = await zahashuj('zażółć-gęślą-jaźń');
    expect(await sprawdzHaslo(hasz, 'zażółć-gęślą-jaźń')).toBe(true);
  });
});
