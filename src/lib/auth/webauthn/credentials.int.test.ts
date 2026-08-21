import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  LastKeyError,
  UnknownKeyError,
  listCredentials,
  removeCredential,
  renameCredential,
} from './credentials';
import { MAX_LABEL } from './policy';

const created: bigint[] = [];

afterEach(async () => {
  const ids = created.splice(0);
  // audit.account_id is ON DELETE SET NULL, not CASCADE — it deliberately
  // outlives the account, so deleting the accounts this file created would
  // not remove the audit rows removeCredential wrote for them. Sweep those
  // first or they orphan permanently in the shared database.
  await prisma.audit.deleteMany({ where: { accountId: { in: ids } } });
  await prisma.account.deleteMany({ where: { id: { in: ids } } });
});

async function accountWith(keys: number) {
  const a = await prisma.account.create({
    data: {
      email: `keys-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Kowalscy',
      role: 'region',
      // account_region_matches_role requires a region for this role.
      regionId: 7,
      status: 'active',
      webauthnUserId: randomBytes(32).toString('base64url'),
    },
  });
  created.push(a.id);

  const ids: string[] = [];
  for (let i = 0; i < keys; i += 1) {
    const id = randomBytes(16).toString('base64url');
    await prisma.credential.create({
      data: { id, accountId: a.id, publicKey: randomBytes(64), label: `Klucz ${i + 1}` },
    });
    ids.push(id);
  }
  return { account: a, ids };
}

it('lists the keys without ever handing out the public key', async () => {
  const { account } = await accountWith(2);
  const list = await listCredentials(account.id);

  expect(list).toHaveLength(2);
  expect(Object.keys(list[0] ?? {})).toEqual(['id', 'label', 'createdAt', 'lastUsedAt']);
});

it('renames a key', async () => {
  const { account, ids } = await accountWith(1);
  await renameCredential(account.id, ids[0] ?? '', '  Telefon Ani  ');

  const key = await prisma.credential.findUniqueOrThrow({ where: { id: ids[0] ?? '' } });
  expect(key.label).toBe('Telefon Ani');
});

it('truncates a label longer than MAX_LABEL', async () => {
  const { account, ids } = await accountWith(1);
  const longLabel = 'x'.repeat(MAX_LABEL + 20);
  await renameCredential(account.id, ids[0] ?? '', longLabel);

  const key = await prisma.credential.findUniqueOrThrow({ where: { id: ids[0] ?? '' } });
  expect(key.label).toBe('x'.repeat(MAX_LABEL));
  expect(key.label).toHaveLength(MAX_LABEL);
});

it('falls back to a default label when given only whitespace', async () => {
  const { account, ids } = await accountWith(1);
  await renameCredential(account.id, ids[0] ?? '', '    ');

  const key = await prisma.credential.findUniqueOrThrow({ where: { id: ids[0] ?? '' } });
  expect(key.label).toBe('Klucz dostępu');
});

it('removes a key when another one remains', async () => {
  const { account, ids } = await accountWith(2);
  await removeCredential(account.id, ids[0] ?? '');
  expect(await prisma.credential.count({ where: { accountId: account.id } })).toBe(1);
});

it('refuses to remove the last key, which would lock the account out', async () => {
  const { account, ids } = await accountWith(1);
  await expect(removeCredential(account.id, ids[0] ?? '')).rejects.toThrow(LastKeyError);
  expect(await prisma.credential.count({ where: { accountId: account.id } })).toBe(1);
});

it('serialises two concurrent removals so a 2-key account cannot reach zero', async () => {
  // Two different keys, removed at once - e.g. the account-settings page open
  // in two tabs, or a double-click on two different "remove" buttons. The
  // `SELECT ... FOR UPDATE` inside removeCredential's transaction is what
  // makes this deterministic rather than a timing gamble: whichever call
  // reaches the lock first serialises the other behind it, so no matter which
  // wins, exactly one succeeds and the account never drops to zero keys.
  const { account, ids } = await accountWith(2);

  const results = await Promise.allSettled([
    removeCredential(account.id, ids[0] ?? ''),
    removeCredential(account.id, ids[1] ?? ''),
  ]);

  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.filter((r) => r.status === 'rejected');
  expect(rejected).toHaveLength(1);
  expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(LastKeyError);

  expect(await prisma.credential.count({ where: { accountId: account.id } })).toBe(1);
});

it('refuses to touch a key belonging to somebody else', async () => {
  const mine = await accountWith(2);
  const theirs = await accountWith(2);

  await expect(removeCredential(mine.account.id, theirs.ids[0] ?? '')).rejects.toThrow(
    UnknownKeyError,
  );
  expect(await prisma.credential.count({ where: { accountId: theirs.account.id } })).toBe(2);
});

it('writes the removal into the history in the same transaction', async () => {
  const { account, ids } = await accountWith(2);
  await removeCredential(account.id, ids[0] ?? '');

  const audit = await prisma.audit.findFirst({
    where: { accountId: account.id, kind: 'account' },
    orderBy: { at: 'desc' },
  });
  expect(audit?.description).toContain('Usunięto klucz');
});
