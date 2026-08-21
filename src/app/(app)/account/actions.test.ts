import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { afterEach, expect, it, vi } from 'vitest';

// Same shape as the other two actions.test.ts files (see login/actions.test.ts
// for the fuller reasoning): forcing verifyRegistrationResponse() to report an
// unverified registration makes finishAddKey() return at its earliest
// possible exit, before saveCredential is ever reached.
//
// @/lib/db throws the instant it is imported without a DATABASE_URL, and this
// suite runs offline — stubbed unconditionally so every real module below
// that imports it, directly or not, can still load.
vi.mock('@/lib/db', () => ({ prisma: {} }));

// finishAddKey's very first statement — requireUser() must return a user
// whose id matches the fake challenge owner below, or the ownership check
// right after consumeChallenge would refuse before ever reaching the verify
// call this test is about.
vi.mock('@/lib/auth/requireUser', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1n, role: 'admin', regionId: null }),
}));

vi.mock('@/lib/auth/webauthn/challenge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/webauthn/challenge')>()),
  consumeChallenge: vi.fn().mockResolvedValue({ accountId: 1n }),
}));

// Never called in this scenario (the key is refused before it would be
// saved), but the real modules would still import @/lib/db transitively.
vi.mock('@/lib/auth/webauthn/credentials', () => ({
  LastKeyError: class extends Error {},
  UnknownKeyError: class extends Error {},
  removeCredential: vi.fn(),
  renameCredential: vi.fn(),
}));
vi.mock('@/lib/auth/webauthn/register', () => ({
  labelFor: vi.fn(),
  registrationOptions: vi.fn(),
  saveCredential: vi.fn(),
}));

const { verifyRegistrationResponse } = vi.hoisted(() => ({
  verifyRegistrationResponse: vi.fn(),
}));
vi.mock('@simplewebauthn/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@simplewebauthn/server')>()),
  verifyRegistrationResponse,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function fakeResponse(): RegistrationResponseJSON {
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: 'webauthn.create', challenge: 'abc', origin: 'http://localhost:3000' }),
  ).toString('base64url');
  return {
    id: 'cred-1',
    rawId: 'cred-1',
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON, attestationObject: '' },
  } as unknown as RegistrationResponseJSON;
}

// The timeout is generous because of what this test spends its time on: the
// dynamic import below pulls in the whole server-action graph — Next's
// internals plus @simplewebauthn/server — for the first time, and on a cold
// module cache that alone can pass Vitest's 5 s default on a slower machine.
// Confirmed to predate the fix wave of 21.08: the three user-verification
// tests time out on the untouched branch too. The work being measured is an
// import, not the assertion, so raising the ceiling here loses nothing.
it('asks SimpleWebAuthn to require user verification when adding a key', async () => {
  verifyRegistrationResponse.mockResolvedValue({ verified: false });
  const { finishAddKey } = await import('./actions');

  const result = await finishAddKey(fakeResponse());

  expect(result).toEqual({ error: 'Nie udało się dodać klucza' });
  expect(verifyRegistrationResponse).toHaveBeenCalledTimes(1);
  expect(verifyRegistrationResponse.mock.calls[0]?.[0]).toMatchObject({
    requireUserVerification: true,
  });
}, 30_000);
