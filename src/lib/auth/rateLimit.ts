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
 * Called after a successful login so a user who finally remembers their
 * password is not locked out by their own earlier mistakes.
 */
export async function clearAttempts(key: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
