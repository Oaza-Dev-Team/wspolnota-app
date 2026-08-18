import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  createSession, deleteAccountSessions, deleteExpiredSessions, deleteSession, userFromToken,
} from './session';

async function fixture() {
  await prisma.region.upsert({
    where: { id: 7 }, update: {}, create: { id: 7, romanNumeral: 'VII' },
  });
  return prisma.account.upsert({
    where: { email: 'session@example.pl' },
    update: { status: 'active' },
    create: {
      email: 'session@example.pl', name: 'Test Sesji',
      role: 'region', regionId: 7, status: 'active',
    },
  });
}

beforeEach(async () => {
  await prisma.session.deleteMany();
});

afterAll(async () => {
  await prisma.session.deleteMany();
  await prisma.account.deleteMany({ where: { email: 'session@example.pl' } });
  await prisma.$disconnect();
});

describe('createSession', () => {
  it('never stores the raw token', async () => {
    const account = await fixture();
    const token = await createSession(account.id);
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
  });
});

describe('userFromToken', () => {
  it('resolves a valid token to the account', async () => {
    const account = await fixture();
    const token = await createSession(account.id);
    expect(await userFromToken(token)).toEqual({ id: account.id, role: 'region', regionId: 7 });
  });

  it('returns null for an unknown token', async () => {
    expect(await userFromToken('zmyslony-token')).toBeNull();
  });

  it('returns null once the session has expired', async () => {
    const account = await fixture();
    const token = await createSession(account.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await userFromToken(token)).toBeNull();
  });

  it('returns null when the account has been disabled', async () => {
    const account = await fixture();
    const token = await createSession(account.id);
    await prisma.account.update({ where: { id: account.id }, data: { status: 'disabled' } });
    // This is the reason sessions live in the database rather than a JWT.
    expect(await userFromToken(token)).toBeNull();
  });
});

describe('session removal', () => {
  it('deleteSession invalidates just that session', async () => {
    const account = await fixture();
    const a = await createSession(account.id);
    const b = await createSession(account.id);
    await deleteSession(a);
    expect(await userFromToken(a)).toBeNull();
    expect(await userFromToken(b)).not.toBeNull();
  });

  it('deleteAccountSessions invalidates every session of the account', async () => {
    const account = await fixture();
    const a = await createSession(account.id);
    const b = await createSession(account.id);
    await deleteAccountSessions(account.id);
    expect(await userFromToken(a)).toBeNull();
    expect(await userFromToken(b)).toBeNull();
  });

  it('deleteExpiredSessions removes only expired rows', async () => {
    const account = await fixture();
    const alive = await createSession(account.id);
    await createSession(account.id);

    // Expire the second session only; sessions are created in id order.
    const newer = await prisma.session.findFirstOrThrow({ orderBy: { id: 'desc' } });
    await prisma.session.update({
      where: { id: newer.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await deleteExpiredSessions()).toBe(1);
    expect(await userFromToken(alive)).not.toBeNull();
  });
});
