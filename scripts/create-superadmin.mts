/**
 * Creates the technical account on a fresh production database.
 *
 *   ADMIN_EMAIL=… ADMIN_NAME=… npm run create-superadmin
 *
 * Needed exactly once. Every later account — including the couple responsible
 * for the community — is created from the "Konta" view with a one-time
 * invitation link, which needs somebody already signed in, and this is how
 * that somebody comes to exist.
 *
 * The technical account rather than an admin: the admin is an office in the
 * community that changes hands every few years, while whoever installs the
 * thing has to be able to appoint its holder and to get back in afterwards.
 *
 * The seed script is not an alternative: it wipes the tables and fills them
 * with three hundred fictional couples.
 */
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { INVITE_DAYS } from '../src/lib/accounts/policy';
import { prisma } from '../src/lib/db';

/** Same reasoning as manage.ts's hashToken: the token is 32 random bytes, not
 * a guessable secret, so a fast digest defends it as well as a slow one would. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function main(): Promise<void> {
  const email = process.env['ADMIN_EMAIL'];
  const name = process.env['ADMIN_NAME'];

  if (!email || !name) {
    throw new Error('Ustaw ADMIN_EMAIL i ADMIN_NAME');
  }

  const existing = await prisma.account.findFirst({ where: { role: 'superadmin' } });
  if (existing) {
    // Refusing rather than adding a second one: this script exists to bootstrap
    // an empty installation, and a stray extra caretaker is a security problem.
    // A second one is created from the "Konta" view, by the first.
    throw new Error(`Konto techniczne już istnieje: ${existing.email}`);
  }

  const token = randomBytes(32).toString('base64url');

  const account = await prisma.account.create({
    data: {
      email,
      name,
      role: 'superadmin',
      status: 'pending',
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';
  console.log(`Utworzono konto techniczne: ${account.email}`);
  console.log(`Otwórz link i utwórz klucz: ${appUrl}/invite/${token}`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
