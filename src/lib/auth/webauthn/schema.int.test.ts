import { randomBytes } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { prisma } from '@/lib/db';

const created: bigint[] = [];

async function account() {
  const a = await prisma.account.create({
    data: {
      email: `schema-${randomBytes(6).toString('hex')}@example.pl`,
      name: 'Testowi',
      role: 'viewer',
      status: 'active',
      webauthnUserId: randomBytes(32).toString('base64url'),
    },
  });
  created.push(a.id);
  return a;
}

afterEach(async () => {
  await prisma.account.deleteMany({ where: { id: { in: created.splice(0) } } });
});

it('stores a credential and hands back the public key unchanged', async () => {
  const a = await account();
  const publicKey = randomBytes(64);

  await prisma.credential.create({
    data: {
      id: randomBytes(16).toString('base64url'),
      accountId: a.id,
      publicKey,
      transports: ['internal', 'hybrid'],
      label: 'Telefon',
    },
  });

  const stored = await prisma.credential.findFirstOrThrow({ where: { accountId: a.id } });
  expect(Buffer.from(stored.publicKey)).toEqual(publicKey);
  expect(stored.transports).toEqual(['internal', 'hybrid']);
  expect(stored.counter).toBe(0n);
});

it('takes the credentials down with the account, leaving nothing to sign in with', async () => {
  const a = await account();
  await prisma.credential.create({
    data: {
      id: randomBytes(16).toString('base64url'),
      accountId: a.id,
      publicKey: randomBytes(64),
      label: 'Telefon',
    },
  });

  await prisma.account.delete({ where: { id: a.id } });
  created.pop();

  expect(await prisma.credential.count({ where: { accountId: a.id } })).toBe(0);
});
