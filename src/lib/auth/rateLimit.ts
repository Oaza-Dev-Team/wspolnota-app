/**
 * The counter now only protects the challenge table from being filled with
 * junk — a cryptographic signature is not something you can guess by trying
 * again and again.
 *
 * The key is an IP address (see login/actions.ts), which makes every row
 * personal data with no reason to outlive the window it is counted in.
 * clearAttempts only empties the bucket that just succeeded, so the sweeping
 * is done by the nightly retention job.
 */
import { prisma } from '@/lib/db';

export const ATTEMPT_LIMIT = 10;
export const WINDOW_MINUTES = 15;

/**
 * The moment before which an attempt no longer counts. Exported because it is
 * also the line the retention job sweeps behind (scripts/retention.mts): rows
 * older than this are invisible to isRateLimited, so keeping them would only
 * mean storing IP addresses for no purpose.
 */
export function attemptCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);
}

export async function isRateLimited(key: string): Promise<boolean> {
  const count = await prisma.loginAttempt.count({
    where: { key, at: { gte: attemptCutoff() } },
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
