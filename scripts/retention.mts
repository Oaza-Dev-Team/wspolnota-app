/**
 * Retention job (spec §4.4, §12): audit entries older than 24 months and
 * sessions past their expiry.
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
import { prisma } from '../src/lib/db';

export const AUDIT_RETENTION_MONTHS = 24;

export function auditCutoff(now: Date): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENTION_MONTHS);
  return cutoff;
}

export async function runRetention(
  now: Date = new Date(),
): Promise<{ audit: number; sessions: number }> {
  const cutoff = auditCutoff(now);

  const audit = await prisma.audit.deleteMany({ where: { at: { lt: cutoff } } });
  const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });

  return { audit: audit.count, sessions: sessions.count };
}

// Only when run as a command, so the test can import the function without the
// process exiting underneath it. Built through pathToFileURL rather than by
// string surgery: a Windows path turns into file:///C:/… , with three slashes.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (invokedDirectly) {
  const result = await runRetention();
  console.log(
    `Retention: removed ${result.audit} audit entries older than ` +
      `${AUDIT_RETENTION_MONTHS} months and ${result.sessions} expired sessions.`,
  );
  await prisma.$disconnect();
}
