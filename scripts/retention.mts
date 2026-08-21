/**
 * Retention job (spec §4.4, §12): audit entries older than 24 months, sessions
 * past their expiry, WebAuthn challenges past theirs, and sign-in attempts
 * older than the window they are counted in.
 *
 * A cron job on the host, not a scheduler inside the application: several
 * container instances would each run their own timer and race each other over
 * the same rows. The host runs this once a day, alongside pg_dump.
 *
 *   npm run retention
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import 'dotenv/config';
import { AUDIT_RETENTION_MONTHS } from '../src/lib/audit/policy';
import { WINDOW_MINUTES, attemptCutoff } from '../src/lib/auth/rateLimit';
import { prisma } from '../src/lib/db';

export { AUDIT_RETENTION_MONTHS, WINDOW_MINUTES };

export function auditCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENTION_MONTHS);
  return cutoff;
}

export async function runRetention(
  now: Date = new Date(),
): Promise<{ audit: number; sessions: number; challenges: number; attempts: number }> {
  const cutoff = auditCutoff(now);

  const audit = await prisma.audit.deleteMany({ where: { at: { lt: cutoff } } });
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  // A challenge only proves freshness for the few minutes a sign-in or
  // registration ceremony takes; one still on the table past its expiry was
  // never redeemed and has no other cleanup path.
  const challenges = await prisma.webauthnChallenge.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  // login_attempt is keyed by IP address, and isRateLimited never looks
  // further back than the window — so past it the row is an address kept for
  // nothing. Nothing else empties this table: clearAttempts only clears the
  // one bucket that has just signed in successfully, and x-forwarded-for is
  // set by the client, so the row count is not bounded by the number of real
  // users either.
  const attempts = await prisma.loginAttempt.deleteMany({
    where: { at: { lt: attemptCutoff(now) } },
  });

  return {
    audit: audit.count,
    sessions: sessions.count,
    challenges: challenges.count,
    attempts: attempts.count,
  };
}

// Only when run as a command, so the test can import the function without the
// process exiting underneath it. Built through pathToFileURL rather than by
// string surgery: a Windows path turns into file:///C:/… , with three slashes.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (invokedDirectly) {
  const result = await runRetention();
  // Read by whoever keeps the server running, in the same language as the
  // other two scripts they run there.
  console.log(`Skasowano wpisy audytu starsze niż ${AUDIT_RETENTION_MONTHS} mies.: ${result.audit}`);
  console.log(`Wygasłe sesje: ${result.sessions}`);
  console.log(`Wygasłe wyzwania WebAuthn: ${result.challenges}`);
  console.log(`Próby logowania starsze niż ${WINDOW_MINUTES} min: ${result.attempts}`);
  await prisma.$disconnect();
}
