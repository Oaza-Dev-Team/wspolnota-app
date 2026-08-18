import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { User } from './permissions';

export const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Returns the raw token — the only moment it exists outside the cookie. */
export async function createSession(accountId: bigint): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { accountId, tokenHash: hashToken(token), expiresAt },
  });
  return token;
}

/**
 * Resolves a session token, re-checking account status on every call. A JWT
 * could not do this: a disabled account would keep working until its token
 * expired, which the acceptance checklist forbids.
 */
export async function userFromToken(token: string): Promise<User | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { account: true },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date()) return null;
  if (session.account.status !== 'active') return null;

  return {
    id: session.account.id,
    role: session.account.role,
    regionId: session.account.regionId,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Called whenever an account is disabled, so access ends immediately. */
export async function deleteAccountSessions(accountId: bigint): Promise<void> {
  await prisma.session.deleteMany({ where: { accountId } });
}

export async function deleteExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}
