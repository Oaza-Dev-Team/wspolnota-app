/**
 * The counter now only protects the challenge table from being filled with
 * junk — a cryptographic signature is not something you can guess by trying
 * again and again.
 */
import { prisma } from '@/lib/db';

export const ATTEMPT_LIMIT = 10;
export const WINDOW_MINUTES = 15;

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
}

export async function isRateLimited(key: string): Promise<boolean> {
  const count = await prisma.loginAttempt.count({
    where: { key, at: { gte: windowStart() } },
  });
  return count >= ATTEMPT_LIMIT;
}

export async function recordAttempt(key: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { key } });
}

/**
 * Called after a successful sign-in, so a key that took a few tries to
 * reach — a fumbled fingerprint, a wrong PIN — is not locked out by its own
 * earlier attempts.
 */
export async function clearAttempts(key: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
