import { afterEach, describe, expect, it, vi } from 'vitest';
import { rpConfig } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rpConfig', () => {
  it('derives the relying party id and origin from APP_URL', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
    expect(rpConfig()).toEqual({
      rpID: 'kartoteka.oazagdansk.pl',
      origin: 'https://kartoteka.oazagdansk.pl',
    });
  });

  it('drops a trailing slash, so the origin matches what the browser sends', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl/');
    expect(rpConfig().origin).toBe('https://kartoteka.oazagdansk.pl');
  });

  it('keeps the port in the origin but not in the id', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    expect(rpConfig()).toEqual({ rpID: 'localhost', origin: 'http://localhost:3000' });
  });

  it('falls back to localhost in development, where there is nothing to configure', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(rpConfig().rpID).toBe('localhost');
  });

  it('refuses to guess in production: a wrong origin only shows up as sign-in failing', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => rpConfig()).toThrow(/APP_URL/);
  });

  // A scheme-less value used to reach `new URL()` and come back as a bare
  // "Invalid URL" naming neither the variable nor what it was set to.
  it('names APP_URL and the value when it is not an address', () => {
    vi.stubEnv('APP_URL', 'kartoteka.oazagdansk.pl');
    expect(() => rpConfig()).toThrow(/APP_URL/);
    expect(() => rpConfig()).toThrow(/kartoteka\.oazagdansk\.pl/);
  });
});
