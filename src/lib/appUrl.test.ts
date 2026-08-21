import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUrlError, DEV_FALLBACK, assertAppUrl, inviteUrl, parseAppUrl } from './appUrl';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('parseAppUrl', () => {
  it('reads the configured address', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
    expect(parseAppUrl()?.origin).toBe('https://kartoteka.oazagdansk.pl');
  });

  it('says nothing is configured rather than guessing', () => {
    vi.stubEnv('APP_URL', '');
    expect(parseAppUrl()).toBeNull();
  });

  // The likeliest .env typo in this project, and the one `new URL()` reports
  // as a bare "Invalid URL" naming nothing at all.
  it('names the variable and the value when the scheme is missing', () => {
    vi.stubEnv('APP_URL', 'kartoteka.oazagdansk.pl');
    expect(() => parseAppUrl()).toThrow(AppUrlError);
    expect(() => parseAppUrl()).toThrow(/APP_URL/);
    expect(() => parseAppUrl()).toThrow(/kartoteka\.oazagdansk\.pl/);
  });

  // Parses as a URL whose scheme is the hostname — the one malformed value
  // that would otherwise pass, and then scope every passkey to nothing.
  it('refuses a host with a port but no scheme', () => {
    vi.stubEnv('APP_URL', 'kartoteka.oazagdansk.pl:3000');
    expect(() => parseAppUrl()).toThrow(/APP_URL/);
  });

  it('refuses an address that is not http or https', () => {
    vi.stubEnv('APP_URL', 'ftp://kartoteka.oazagdansk.pl');
    expect(() => parseAppUrl()).toThrow(/APP_URL/);
  });
});

describe('inviteUrl', () => {
  it('builds the link from the configured address', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
    expect(inviteUrl('abc123')).toBe('https://kartoteka.oazagdansk.pl/invite/abc123');
  });

  it('drops a trailing slash and any path left in the variable', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl/kartoteka/');
    expect(inviteUrl('abc123')).toBe('https://kartoteka.oazagdansk.pl/invite/abc123');
  });

  it('falls back to localhost for local work', () => {
    vi.stubEnv('APP_URL', '');
    expect(inviteUrl('abc123')).toBe(`${DEV_FALLBACK}/invite/abc123`);
  });

  // The whole point of the fallback keeping its warning: a localhost link
  // printed on a server looks plausible, and re-running create-superadmin to
  // get a better one refuses, the account by then existing. Freshly imported
  // so the once-per-process warning has not already been spent.
  it('warns on stderr rather than substituting localhost in silence', async () => {
    vi.resetModules();
    vi.stubEnv('APP_URL', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fresh = await import('./appUrl');
    fresh.inviteUrl('abc123');

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/APP_URL/);
  });
});

describe('assertAppUrl', () => {
  it('lets a configured production instance start', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertAppUrl()).not.toThrow();
  });

  // Spec §2: the alternative is a container that answers "ok" on /health and
  // then cannot sign anybody in, with nothing in the symptom to say why.
  it('stops a production start with no APP_URL at all', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertAppUrl()).toThrow(/APP_URL/);
  });

  it('stops a production start with a malformed APP_URL', () => {
    vi.stubEnv('APP_URL', 'kartoteka.oazagdansk.pl');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertAppUrl()).toThrow(/APP_URL/);
  });

  it('lets development start with nothing configured', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => assertAppUrl()).not.toThrow();
  });

  // A typo is worth stopping for locally too: it would bind keys to a domain
  // that does not exist, and every one of them would have to be reissued.
  it('stops even a development start when the value is malformed', () => {
    vi.stubEnv('APP_URL', 'kartoteka.oazagdansk.pl');
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => assertAppUrl()).toThrow(/APP_URL/);
  });
});
