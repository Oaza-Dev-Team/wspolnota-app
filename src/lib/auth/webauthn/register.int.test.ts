import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { labelFor, registrationOptions, saveCredential } from './register';

const created: bigint[] = [];

beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const ids = created.splice(0);
  // audit.account_id is ON DELETE SET NULL, not CASCADE — deleting the
  // account first would leave the row this test creates orphaned forever.
  await prisma.audit.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.account.deleteMany({ where: { id: { in: ids } } });
});

async function pendingAccount() {
  const token = randomBytes(32).toString('base64url');
  const a = await prisma.account.create({
    data: {
      email: `reg-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Kowalscy',
      role: 'region',
      // account_region_matches_role requires a region for this role.
      regionId: 7,
      status: 'pending',
      webauthnUserId: randomBytes(32).toString('base64url'),
      inviteTokenHash: token,
      inviteExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  created.push(a.id);
  return a;
}

it('asks for a discoverable key and for the user to be verified', async () => {
  const a = await pendingAccount();
  const options = await registrationOptions(a.id);

  // Discoverable, so the sign-in screen needs no e-mail field at all.
  expect(options.authenticatorSelection?.residentKey).toBe('required');
  // Without this the passkey stops being two factors and the whole design
  // argument collapses. It is not a detail to leave at its default.
  expect(options.authenticatorSelection?.userVerification).toBe('required');
  expect(options.rp.id).toBe('kartoteka.oazagdansk.pl');
});

it('remembers the challenge it just handed out', async () => {
  const a = await pendingAccount();
  const options = await registrationOptions(a.id);

  const stored = await prisma.webauthnChallenge.findUnique({
    where: { challenge: options.challenge },
  });
  expect(stored?.accountId).toBe(a.id);
  expect(stored?.purpose).toBe('registration');
});

it('offers the keys already registered, so the same device is not stored twice', async () => {
  const a = await pendingAccount();
  await prisma.credential.create({
    data: {
      id: 'already-here',
      accountId: a.id,
      publicKey: randomBytes(64),
      transports: ['internal'],
      label: 'Telefon',
    },
  });

  const options = await registrationOptions(a.id);
  expect(options.excludeCredentials?.map((c) => c.id)).toEqual(['already-here']);
});

it('activates the account, spends the invitation and audits, all at once', async () => {
  const a = await pendingAccount();

  await saveCredential(a.id, {
    id: 'new-key',
    publicKey: randomBytes(64),
    counter: 0n,
    transports: ['internal'],
    label: 'Ten komputer',
  });

  const after = await prisma.account.findUniqueOrThrow({ where: { id: a.id } });
  expect(after.status).toBe('active');
  expect(after.inviteTokenHash).toBeNull();
  expect(after.inviteExpiresAt).toBeNull();

  expect(await prisma.credential.count({ where: { accountId: a.id } })).toBe(1);

  const audit = await prisma.audit.findFirst({
    where: { accountId: a.id, kind: 'account' },
    orderBy: { at: 'desc' },
  });
  expect(audit?.description).toContain('klucz');
});

it('names a key by how it will be reached next time', () => {
  expect(labelFor('platform', ['internal'])).toBe('To urządzenie');
  expect(labelFor('cross-platform', ['hybrid'])).toBe('Telefon');
  expect(labelFor('cross-platform', ['usb'])).toBe('Kluczyk USB');
  expect(labelFor(undefined, [])).toBe('Klucz dostępu');
});
