import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { ClonedKeyError } from './policy';
import {
  SignInError,
  authenticationOptions,
  completeSignIn,
  resolveCredential,
} from './authenticate';

const created: bigint[] = [];
// authenticationOptions() stores its challenge with accountId NULL — nobody
// has said who they are yet at that point — so a sweep scoped to `created`
// above would never reach these rows. Tracked by value instead, the way
// challenge.int.test.ts does.
const challenges: string[] = [];

beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://kartoteka.oazagdansk.pl');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.webauthnChallenge.deleteMany({ where: { challenge: { in: challenges.splice(0) } } });
  await prisma.account.deleteMany({ where: { id: { in: created.splice(0) } } });
});

async function accountWithKey(status: 'active' | 'disabled' | 'pending', counter = 0n) {
  const a = await prisma.account.create({
    data: {
      email: `auth-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Kowalscy',
      role: 'region',
      // account_region_matches_role requires a region for this role.
      regionId: 3,
      status,
      webauthnUserId: randomBytes(32).toString('base64url'),
    },
  });
  created.push(a.id);

  const id = randomBytes(16).toString('base64url');
  await prisma.credential.create({
    data: { id, accountId: a.id, publicKey: randomBytes(64), counter, label: 'Telefon' },
  });
  return { account: a, credentialId: id };
}

it('asks for no particular key, so the browser offers whatever it holds', async () => {
  const options = await authenticationOptions();
  challenges.push(options.challenge);
  // Empty on purpose: naming credentials here would need an e-mail first, and
  // that would turn the sign-in form into a way of asking who has an account.
  expect(options.allowCredentials ?? []).toEqual([]);
  expect(options.userVerification).toBe('required');
  expect(options.rpId).toBe('kartoteka.oazagdansk.pl');
});

it('remembers the challenge without tying it to anybody', async () => {
  const options = await authenticationOptions();
  challenges.push(options.challenge);
  const stored = await prisma.webauthnChallenge.findUnique({
    where: { challenge: options.challenge },
  });
  expect(stored?.purpose).toBe('authentication');
  expect(stored?.accountId).toBeNull();
});

it('finds the account behind a key', async () => {
  const { account, credentialId } = await accountWithKey('active');
  const found = await resolveCredential(credentialId);
  expect(found.account.id).toBe(account.id);
});

it('refuses a key nobody registered', async () => {
  await expect(resolveCredential('never-seen')).rejects.toThrow(SignInError);
});

it('signs in an active account and opens a session', async () => {
  const { account, credentialId } = await accountWithKey('active');
  const token = await completeSignIn(credentialId, account.id, 1n);

  expect(token).toMatch(/^[\w-]{20,}$/);
  expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(1);

  const key = await prisma.credential.findUniqueOrThrow({ where: { id: credentialId } });
  expect(key.counter).toBe(1n);
  expect(key.lastUsedAt).not.toBeNull();

  const after = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  expect(after.lastLoginAt).not.toBeNull();
});

it('refuses a disabled account holding a perfectly good key', async () => {
  const { account, credentialId } = await accountWithKey('disabled');
  await expect(completeSignIn(credentialId, account.id, 1n)).rejects.toThrow(SignInError);
  expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(0);
});

it('refuses an account still holding an invitation', async () => {
  const { account, credentialId } = await accountWithKey('pending');
  await expect(completeSignIn(credentialId, account.id, 1n)).rejects.toThrow(SignInError);
});

it('refuses a counter that did not advance', async () => {
  const { account, credentialId } = await accountWithKey('active', 5n);
  await expect(completeSignIn(credentialId, account.id, 5n)).rejects.toThrow(ClonedKeyError);
  expect(await prisma.session.count({ where: { accountId: account.id } })).toBe(0);

  // The refusal happens before the transaction, not just before the session:
  // the stored counter must still read the pre-attempt value.
  const key = await prisma.credential.findUniqueOrThrow({ where: { id: credentialId } });
  expect(key.counter).toBe(5n);
  expect(key.lastUsedAt).toBeNull();
});

it('lets a synced passkey through, which never counts past zero', async () => {
  const { account, credentialId } = await accountWithKey('active', 0n);
  await expect(completeSignIn(credentialId, account.id, 0n)).resolves.toBeTruthy();
});
