import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkStartupConfig } from './startup';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('checkStartupConfig', () => {
  it('lets a configured instance through', () => {
    vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
    vi.stubEnv('NODE_ENV', 'production');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    checkStartupConfig();

    expect(exit).not.toHaveBeenCalled();
  });

  // Exits rather than throwing on purpose: Next reports an error raised out of
  // register() and then keeps the process alive with the port bound, which is
  // the half-dead container this check exists to prevent. Verified by hand
  // against the standalone server of Next 16.3.1.
  it('exits, rather than throwing, when production has no APP_URL', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => checkStartupConfig()).not.toThrow();

    expect(exit).toHaveBeenCalledWith(1);
    // The message, on its own line: the framework's wrapper buries it in a
    // stack trace, and this line is all an operator has to go on.
    expect(error.mock.calls[0]?.[0]).toMatch(/APP_URL/);
  });
});
