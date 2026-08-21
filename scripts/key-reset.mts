/**
 * Issues a one-time link so somebody who lost every key can register a new one.
 *
 *   npm run key:reset -- adres@example.pl
 *
 * The way back in when the interface cannot help: the last remaining admin with
 * no working key, or the very first sign-in after an install. Whoever runs this
 * has a shell on the server and could reach the database directly anyway, so no
 * further permission is checked.
 *
 * Deliberately does NOT revoke the existing keys. The usual reason for running
 * it is a lost phone, and a lost phone still needs its owner's PIN or
 * fingerprint to be of use to anybody — the old key keeps working until this
 * one replaces it. To cut access off at once, disable the account first (from
 * "Konta", or directly in the database) rather than relying on this script.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../src/lib/accounts/manage';
import { INVITE_DAYS } from '../src/lib/accounts/policy';
import { inviteUrl } from '../src/lib/appUrl';
import { prisma } from '../src/lib/db';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error('Podaj adres: npm run key:reset -- adres@example.pl');
  }

  const account = await prisma.account.findUnique({ where: { email } });
  if (!account) throw new Error(`Nie ma konta o adresie ${email}`);

  const token = randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: account.id },
      data: {
        // Issuing a new invitation invalidates the previous one.
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Wydano link do nowego klucza z konsoli serwera: ${email}`,
        // Nobody was signed in — this ran from a shell on the server, not
        // through the app. Audit.accountId is nullable, so the row does not
        // have to pretend somebody was.
        accountId: null,
      },
    });
  });

  console.log(`Link ważny ${INVITE_DAYS} dni — przekaż go osobiście, nie mailem:`);
  console.log(`  ${inviteUrl(token)}`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
