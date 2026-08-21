import { hashPassword, verifyPassword } from '@/lib/auth/password';
import type { User } from '@/lib/auth/permissions';
import { createSession, deleteAccountSessions } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { MIN_PASSWORD_LENGTH } from './policy';

/**
 * What an account does to itself. Separate from manage.ts, which is the admin
 * acting on somebody else's account and guards every entry point with
 * canManageAccounts: nothing here asks a permission, because the caller is
 * already the account being changed.
 */

export class PasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordError';
  }
}

/**
 * Returns the raw token of a fresh session — the only moment it exists. The
 * old sessions go: whoever knew the previous password may be holding one, and
 * that is the usual reason for changing it. The caller puts the returned token
 * in the cookie, so the couple doing this stays signed in.
 */
export async function changeOwnPassword(
  u: User,
  current: string,
  next: string,
): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: u.id },
    select: { passwordHash: true },
  });

  // An account still holding an invitation has no hash to compare against.
  // verifyPassword answers false rather than throwing, so this reads as an
  // ordinary wrong password — which, from the form's side, it is.
  if (!await verifyPassword(account.passwordHash ?? '', current)) {
    throw new PasswordError('Obecne hasło jest nieprawidłowe');
  }

  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordError(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`);
  }
  if (next === current) {
    throw new PasswordError('Nowe hasło musi różnić się od obecnego');
  }

  const passwordHash = await hashPassword(next);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: u.id }, data: { passwordHash } });

    await tx.audit.create({
      data: {
        kind: 'account',
        // No name: the history renders the account that wrote the entry, and
        // here that is the same account the entry is about.
        description: 'Zmieniono własne hasło',
        accountId: u.id,
      },
    });
  });

  // Outside the transaction, as everywhere else that ends somebody's access:
  // the sessions must go whether or not the audit row committed first.
  await deleteAccountSessions(u.id);

  return createSession(u.id);
}
