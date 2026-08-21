import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { afterEach, expect, it, vi } from 'vitest';

// Every module below is stubbed for the SAME reason: this file exercises
// finishSignIn() in isolation, without a database, by forcing the mocked
// verifyAuthenticationResponse() to report an unverified assertion. That
// return makes finishSignIn() take its earliest possible exit — before
// completeSignIn, setSessionCookie, clearAttempts or redirect are ever
// reached — so none of those need a working implementation here. What DOES
// need to be real is SignInError itself: finishSignIn's catch block checks
// `e instanceof SignInError`, and a mocked class would fail that check.
//
// @/lib/db throws the instant it is imported without a DATABASE_URL (see its
// own source), and this suite runs offline (vitest.config.mts loads no
// .env) — so it is stubbed unconditionally, even though nothing here ever
// calls a Prisma method. Every real module below (challenge.ts, authenticate.ts
// and, transitively, session.ts) imports it, directly or not.
vi.mock('@/lib/db', () => ({ prisma: {} }));

vi.mock('@/lib/auth/webauthn/challenge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/webauthn/challenge')>()),
  consumeChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/webauthn/authenticate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/webauthn/authenticate')>()),
  resolveCredential: vi.fn().mockResolvedValue({
    credential: {
      id: 'cred-1',
      publicKey: Buffer.alloc(0),
      counter: 0n,
      transports: [],
    },
    account: { id: 1n },
  }),
  completeSignIn: vi.fn(),
}));

// Never called in this scenario, but importing the real modules would pull in
// @/lib/db, which throws immediately without a DATABASE_URL — this suite runs
// offline (vitest.config.mts loads no .env).
vi.mock('@/lib/auth/requireUser', () => ({ setSessionCookie: vi.fn() }));
vi.mock('@/lib/auth/rateLimit', () => ({
  isRateLimited: vi.fn().mockResolvedValue(false),
  recordAttempt: vi.fn(),
  clearAttempts: vi.fn(),
}));

const { verifyAuthenticationResponse } = vi.hoisted(() => ({
  verifyAuthenticationResponse: vi.fn(),
}));
vi.mock('@simplewebauthn/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@simplewebauthn/server')>()),
  verifyAuthenticationResponse,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function fakeResponse(): AuthenticationResponseJSON {
  const clientDataJSON = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge: 'abc', origin: 'http://localhost:3000' }),
  ).toString('base64url');
  return {
    id: 'cred-1',
    rawId: 'cred-1',
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON, authenticatorData: '', signature: '' },
  } as unknown as AuthenticationResponseJSON;
}

it('asks SimpleWebAuthn to require user verification on sign-in', async () => {
  verifyAuthenticationResponse.mockResolvedValue({ verified: false });
  const { finishSignIn } = await import('./actions');

  const result = await finishSignIn(fakeResponse());

  // The second half of the proof, not just the call itself: forcing
  // verified:false must actually reach the ceremony's refusal path, or this
  // test would only prove the mock was wired up, not that the real function
  // used its result.
  expect(result).toEqual({ error: 'Nie udało się zalogować tym kluczem' });
  expect(verifyAuthenticationResponse).toHaveBeenCalledTimes(1);
  expect(verifyAuthenticationResponse.mock.calls[0]?.[0]).toMatchObject({
    requireUserVerification: true,
  });
});
