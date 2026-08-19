/**
 * Creates the technical account on a fresh production database.
 *
 *   ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run create-superadmin
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
import { hashPassword } from '../src/lib/auth/password';
import { prisma } from '../src/lib/db';

const MIN_PASSWORD_LENGTH = 10;

async function main(): Promise<void> {
  const email = process.env['ADMIN_EMAIL'];
  const name = process.env['ADMIN_NAME'];
  const password = process.env['ADMIN_PASSWORD'];

  if (!email || !name || !password) {
    throw new Error('Ustaw ADMIN_EMAIL, ADMIN_NAME i ADMIN_PASSWORD');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`);
  }

  const existing = await prisma.account.findFirst({ where: { role: 'superadmin' } });
  if (existing) {
    // Refusing rather than adding a second one: this script exists to bootstrap
    // an empty installation, and a stray extra caretaker is a security problem.
    // A second one is created from the "Konta" view, by the first.
    throw new Error(`Konto techniczne już istnieje: ${existing.email}`);
  }

  const account = await prisma.account.create({
    data: {
      email,
      name,
      role: 'superadmin',
      status: 'active',
      passwordHash: await hashPassword(password),
    },
  });

  console.log(`Utworzono konto techniczne: ${account.email}`);
  console.log('Zmień hasło po pierwszym zalogowaniu.');
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
