import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { afterEach, expect, it, vi } from 'vitest';

// Same shape as login/actions.test.ts (see its own header comment): forcing
// verifyRegistrationResponse() to report an unverified registration makes
// finishEnrollment() return at its earliest possible exit, before
// saveCredential, createSession or setSessionCookie are ever reached.
//
// @/lib/db throws the instant it is imported without a DATABASE_URL, and this
// suite runs offline — stubbed unconditionally so every real module below
// that imports it, directly or not, can still load.
vi.mock('@/lib/db', () => ({ prisma: {} }));

vi.mock('@/lib/accounts/manage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/accounts/manage')>()),
  accountForInvite: vi.fn().mockResolvedValue(1n),
}));

vi.mock('@/lib/auth/webauthn/challenge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/webauthn/challenge')>()),
  consumeChallenge: vi.fn().mockResolvedValue({ accountId: 1n }),
}));

// Never called in this scenario (registration is refused before saving a
// credential or opening a session), but real modules would still import
// @/lib/db transitively.
vi.mock('@/lib/auth/requireUser', () => ({ setSessionCookie: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ createSession: vi.fn() }));
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

it('asks SimpleWebAuthn to require user verification on enrolment', async () => {
  verifyRegistrationResponse.mockResolvedValue({ verified: false });
  const { finishEnrollment } = await import('./actions');

  const result = await finishEnrollment('some-token', fakeResponse());

  expect(result).toEqual({ error: 'Nie udało się zarejestrować klucza' });
  expect(verifyRegistrationResponse).toHaveBeenCalledTimes(1);
  expect(verifyRegistrationResponse.mock.calls[0]?.[0]).toMatchObject({
    requireUserVerification: true,
  });
});
