import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { User } from '@/lib/auth/permissions';
import { createSession, userFromToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { PasswordError, changeOwnPassword } from './self';

const OWNER_NAME = 'Konto testowe hasła';
const OWNER_EMAIL = 'haslo.test@example.pl';
const CURRENT = 'obecneHaslo123';
const NEXT = 'noweHaslo456789';

let owner: User;
let ownerId: bigint;

/** The stored hash, or an empty string — verifyPassword answers false to that. */
async function storedHash(): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: ownerId } });
  return account.passwordHash ?? '';
}

beforeAll(async () => {
  // A throwaway account rather than a seeded one: these tests rewrite the
  // password, and a run interrupted halfway would leave a seeded account
  // unable to sign in for every later test.
  const account = await prisma.account.create({
    data: {
      email: OWNER_EMAIL,
      name: OWNER_NAME,
      role: 'viewer',
      status: 'active',
      passwordHash: await hashPassword(CURRENT),
    },
  });
  ownerId = account.id;
  owner = { id: account.id, role: account.role, regionId: account.regionId };
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { accountId: ownerId } });
  await prisma.audit.deleteMany({ where: { accountId: ownerId } });
  await prisma.account.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.account.update({
    where: { id: ownerId },
    data: { passwordHash: await hashPassword(CURRENT) },
  });
  await prisma.audit.deleteMany({ where: { accountId: ownerId } });
  await prisma.session.deleteMany({ where: { accountId: ownerId } });
});

describe('changeOwnPassword', () => {
  it('rejects a wrong current password', async () => {
    await expect(changeOwnPassword(owner, 'zupelnieInne123', NEXT))
      .rejects.toBeInstanceOf(PasswordError);

    expect(await verifyPassword(await storedHash(), CURRENT)).toBe(true);
  });

  it('rejects a new password below the minimum length', async () => {
    await expect(changeOwnPassword(owner, CURRENT, 'krotkie'))
      .rejects.toBeInstanceOf(PasswordError);

    expect(await verifyPassword(await storedHash(), CURRENT)).toBe(true);
  });

  it('rejects a new password identical to the current one', async () => {
    await expect(changeOwnPassword(owner, CURRENT, CURRENT))
      .rejects.toBeInstanceOf(PasswordError);
  });

  it('replaces the stored password', async () => {
    await changeOwnPassword(owner, CURRENT, NEXT);

    const hash = await storedHash();
    expect(await verifyPassword(hash, NEXT)).toBe(true);
    expect(await verifyPassword(hash, CURRENT)).toBe(false);
  });

  it('records the change in the audit', async () => {
    await changeOwnPassword(owner, CURRENT, NEXT);

    const entry = await prisma.audit.findFirst({
      where: { accountId: ownerId },
      orderBy: { id: 'desc' },
    });
    expect(entry?.kind).toBe('account');
    expect(entry?.description).toContain('hasło');
  });

  it('ends every existing session and returns a working replacement', async () => {
    const before = await createSession(ownerId);

    const after = await changeOwnPassword(owner, CURRENT, NEXT);

    // Whoever knew the old password may hold a session opened with it.
    expect(await userFromToken(before)).toBeNull();
    // The couple changing their own password stays signed in.
    expect(await userFromToken(after)).not.toBeNull();
  });

  it('leaves an account without a password alone', async () => {
    await prisma.account.update({ where: { id: ownerId }, data: { passwordHash: null } });

    await expect(changeOwnPassword(owner, CURRENT, NEXT))
      .rejects.toBeInstanceOf(PasswordError);
  });
});
