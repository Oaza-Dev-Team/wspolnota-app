import { prisma } from '@/lib/db';

export const MAX_LABEL = 60;

export type CredentialSummary = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export class LastKeyError extends Error {
  constructor() {
    super('To jedyny klucz na tym koncie — dodaj drugi, zanim usuniesz ten');
    this.name = 'LastKeyError';
  }
}

/**
 * Deliberately its own error rather than sign-in's SignInError: renaming or
 * removing a key happens while signed in, on the account's own page, so
 * "sign-in failed" would simply be the wrong message. It also keeps this
 * module from depending on the sign-in module, which has no reason to know
 * about it.
 */
export class UnknownKeyError extends Error {
  constructor() {
    super('Nie znaleziono takiego klucza');
    this.name = 'UnknownKeyError';
  }
}

export function listCredentials(accountId: bigint): Promise<CredentialSummary[]> {
  return prisma.credential.findMany({
    where: { accountId },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Every call takes the account id and filters by it: a credential id arrives
 * from the browser, so it says which key, never whose. */
async function ownedOrThrow(accountId: bigint, id: string) {
  const key = await prisma.credential.findFirst({ where: { id, accountId } });
  if (!key) throw new UnknownKeyError();
  return key;
}

export async function renameCredential(
  accountId: bigint,
  id: string,
  rawLabel: string,
): Promise<void> {
  await ownedOrThrow(accountId, id);
  const label = rawLabel.trim().slice(0, MAX_LABEL) || 'Klucz dostępu';
  await prisma.credential.update({ where: { id, accountId }, data: { label } });
}

export async function removeCredential(accountId: bigint, id: string): Promise<void> {
  const key = await ownedOrThrow(accountId, id);

  // Checked on the server, not merely hidden in the interface: a server action
  // is a public POST endpoint, and this is the guard against an account
  // locking itself out, not a cosmetic one.
  await prisma.$transaction(async (tx) => {
    // Serialises concurrent removals for this account. Without it, two
    // requests each see two keys remaining under READ COMMITTED, each pass
    // the guard below, and the account ends up with none - the lockout this
    // guard exists to prevent. Throwing later in this callback rolls back
    // and releases the lock without writing anything.
    await tx.$queryRaw`SELECT "id" FROM "account" WHERE "id" = ${accountId} FOR UPDATE`;

    const remaining = await tx.credential.count({ where: { accountId } });
    if (remaining <= 1) throw new LastKeyError();

    await tx.credential.delete({ where: { id, accountId } });
    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Usunięto klucz dostępu: „${key.label}"`,
        accountId,
      },
    });
  });
}
