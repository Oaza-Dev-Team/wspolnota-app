import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Forbidden, type User } from '@/lib/auth/permissions';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, userFromToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { createInvite, redeemInvite, renameAccount, setAccountStatus } from './manage';

const TARGET_NAME = 'Konto testowe zarządzania';

let admin: User;
let regionVII: User;
let targetId: bigint;

beforeAll(async () => {
  const byEmail = async (email: string): Promise<User> => {
    const a = await prisma.account.findUniqueOrThrow({ where: { email } });
    return { id: a.id, role: a.role, regionId: a.regionId };
  };
  admin = await byEmail('admin@example.pl');
  regionVII = await byEmail('rejon7@example.pl');
  // A throwaway account rather than a seeded one: redeeming an invite rewrites
  // the password, and a run interrupted halfway would leave a seeded account
  // unable to sign in for every later test.
  const target = await prisma.account.create({
    data: {
      email: 'zarzadzanie.test@example.pl',
      name: TARGET_NAME,
      role: 'region',
      regionId: 5,
      status: 'active',
      passwordHash: null,
    },
  });
  targetId = target.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { accountId: targetId } });
  await prisma.audit.deleteMany({ where: { accountId: targetId } });
  await prisma.account.delete({ where: { id: targetId } });
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.account.update({
    where: { id: targetId },
    data: {
      // The name is reset too: the rename tests change it, and later ones
      // assert against the original.
      name: TARGET_NAME,
      status: 'active',
      passwordHash: null,
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });
  // Narrowed to this test's own account: deleting every account-kind entry
  // would wipe genuine history that other suites and the app itself wrote.
  await prisma.audit.deleteMany({ where: { description: { contains: TARGET_NAME } } });
  await prisma.session.deleteMany({ where: { accountId: targetId } });
});

describe('setAccountStatus', () => {
  it('disables an account and records it', async () => {
    await setAccountStatus(admin, targetId, 'disabled');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.status).toBe('disabled');
    expect(
      await prisma.audit.count({
        where: { kind: 'account', description: { contains: TARGET_NAME } },
      }),
    ).toBe(1);
  });

  // The checklist requires a disabled account to lose access immediately.
  it('kills the live sessions of a disabled account', async () => {
    const token = await createSession(targetId);
    expect(await userFromToken(token)).not.toBeNull();

    await setAccountStatus(admin, targetId, 'disabled');
    expect(await userFromToken(token)).toBeNull();
    expect(await prisma.session.count({ where: { accountId: targetId } })).toBe(0);
  });

  it('re-enables an account', async () => {
    await setAccountStatus(admin, targetId, 'disabled');
    await setAccountStatus(admin, targetId, 'active');
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: targetId } })).status,
    ).toBe('active');
  });

  it('refuses anyone but admin', async () => {
    await expect(setAccountStatus(regionVII, targetId, 'disabled')).rejects.toThrow(Forbidden);
  });

  it('refuses to disable the admin account itself', async () => {
    await expect(setAccountStatus(admin, admin.id, 'disabled')).rejects.toThrow();
  });
});

describe('createInvite', () => {
  it('returns a raw token and stores only its hash', async () => {
    const token = await createInvite(admin, targetId);
    expect(token.length).toBeGreaterThan(20);

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.inviteTokenHash).not.toBeNull();
    expect(account.inviteTokenHash).not.toBe(token);
    expect(account.inviteExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('replaces any previous invite', async () => {
    const first = await createInvite(admin, targetId);
    const second = await createInvite(admin, targetId);
    expect(first).not.toBe(second);
    await expect(redeemInvite(first, 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses anyone but admin', async () => {
    await expect(createInvite(regionVII, targetId)).rejects.toThrow(Forbidden);
  });
});

describe('redeemInvite', () => {
  it('sets the password and activates the account', async () => {
    await prisma.account.update({ where: { id: targetId }, data: { status: 'pending' } });
    const token = await createInvite(admin, targetId);

    await redeemInvite(token, 'nowe-haslo-123');

    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.status).toBe('active');
    expect(await verifyPassword(account.passwordHash!, 'nowe-haslo-123')).toBe(true);
    // A one-time link: the token is consumed.
    expect(account.inviteTokenHash).toBeNull();
  });

  it('refuses a token that was already used', async () => {
    const token = await createInvite(admin, targetId);
    await redeemInvite(token, 'nowe-haslo-123');
    await expect(redeemInvite(token, 'inne-haslo-456')).rejects.toThrow();
  });

  it('refuses an expired token', async () => {
    const token = await createInvite(admin, targetId);
    await prisma.account.update({
      where: { id: targetId },
      data: { inviteExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(redeemInvite(token, 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses an unknown token', async () => {
    await expect(redeemInvite('zmyslony-token', 'nowe-haslo-123')).rejects.toThrow();
  });

  it('refuses a password that is too short', async () => {
    const token = await createInvite(admin, targetId);
    await expect(redeemInvite(token, 'krotkie')).rejects.toThrow();
  });
});

describe('renameAccount', () => {
  it('changes the name a region tile and the accounts list show', async () => {
    await renameAccount(admin, targetId, 'Anna i Marek Sowa');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.name).toBe('Anna i Marek Sowa');
  });

  it('records the rename in the audit trail with both names', async () => {
    await renameAccount(admin, targetId, 'Ewa i Jan Cichy');
    const entry = await prisma.audit.findFirstOrThrow({
      where: { kind: 'account', description: { contains: 'Ewa i Jan Cichy' } },
      orderBy: { id: 'desc' },
    });
    // Both names, so the history says what actually changed.
    expect(entry.description).toContain(TARGET_NAME);
    await prisma.audit.deleteMany({ where: { id: entry.id } });
  });

  it('trims surrounding whitespace', async () => {
    await renameAccount(admin, targetId, '   Zofia i Jan Nowak   ');
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.name).toBe('Zofia i Jan Nowak');
  });

  it('refuses an empty name', async () => {
    await expect(renameAccount(admin, targetId, '   ')).rejects.toThrow();
    const account = await prisma.account.findUniqueOrThrow({ where: { id: targetId } });
    expect(account.name).toBe(TARGET_NAME);
  });

  it('refuses a name longer than the column allows', async () => {
    await expect(renameAccount(admin, targetId, 'x'.repeat(121))).rejects.toThrow();
  });

  // Same rule as every other account operation: administration is admin-only.
  it('refuses a region account', async () => {
    await expect(renameAccount(regionVII, targetId, 'Podszyci')).rejects.toThrow(Forbidden);
  });
});
