import { createHash, randomBytes } from 'node:crypto';
import type { AccountStatus } from '@/generated/prisma/enums';
import { hashPassword } from '@/lib/auth/password';
import { Forbidden, type User, canManageAccounts } from '@/lib/auth/permissions';
import { deleteAccountSessions } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { INVITE_DAYS, MAX_ACCOUNT_NAME, MIN_PASSWORD_LENGTH } from './policy';

export { INVITE_DAYS, MAX_ACCOUNT_NAME, MIN_PASSWORD_LENGTH };

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteError';
  }
}

/**
 * An invite token is a bearer credential, so only its digest is stored — the
 * same reasoning as for session tokens. SHA-256 rather than argon2 because the
 * token is 32 random bytes, not a guessable secret.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function setAccountStatus(
  u: User,
  id: bigint,
  status: Extract<AccountStatus, 'active' | 'disabled'>,
): Promise<void> {
  if (!canManageAccounts(u)) throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');

  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { role: true, name: true },
  });
  // Locking oneself out of account management would need database access to undo.
  if (account.role === 'admin') {
    throw new Forbidden('Nie można wyłączyć konta administratora');
  }

  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id }, data: { status } });

    await tx.audit.create({
      data: {
        kind: 'account',
        description:
          status === 'disabled'
            ? `Wyłączono konto ${account.name}`
            : `Włączono konto ${account.name}`,
        accountId: u.id,
      },
    });
  });

  // Outside the transaction is fine: re-enabling creates no sessions, and
  // disabling must end them whether or not the audit row committed first.
  if (status === 'disabled') await deleteAccountSessions(id);
}

export class AccountNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountNameError';
  }
}

/**
 * The account name is what the regions overview shows as the couple
 * responsible for that region, so renaming happens here rather than on a
 * separate "couple responsible" record — there is only one name to keep.
 */
export async function renameAccount(u: User, id: bigint, name: string): Promise<void> {
  if (!canManageAccounts(u)) {
    throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');
  }

  const trimmed = name.trim();
  if (trimmed === '') throw new AccountNameError('Podaj nazwę pary');
  if (trimmed.length > MAX_ACCOUNT_NAME) {
    throw new AccountNameError(`Nazwa może mieć najwyżej ${MAX_ACCOUNT_NAME} znaków`);
  }

  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { name: true },
  });
  if (account.name === trimmed) return;

  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id }, data: { name: trimmed } });

    await tx.audit.create({
      data: {
        kind: 'account',
        // Both names: the history has to say what actually changed.
        description: `Zmieniono nazwę konta „${account.name}" na „${trimmed}"`,
        accountId: u.id,
      },
    });
  });
}

/**
 * Returns the raw token — the only moment it exists. The admin copies the link
 * and passes it on however they like; there is no SMTP in this project and
 * adding one for fifteen accounts created once would cost more than it saves.
 */
export async function createInvite(u: User, id: bigint): Promise<string> {
  if (!canManageAccounts(u)) throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');

  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { name: true, role: true },
  });
  if (account.role === 'admin') {
    throw new Forbidden('Konto administratora nie wymaga zaproszenia');
  }

  const token = randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id },
      data: {
        // Issuing a new invite invalidates the previous one.
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Wygenerowano zaproszenie dla ${account.name}`,
        accountId: u.id,
      },
    });
  });

  return token;
}

export class EmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailError';
  }
}

/** Same shape the login form accepts, so an address that saves here can sign in. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new EmailError('Podaj poprawny adres e-mail');
  return email;
}

async function assertEmailFree(email: string, exceptId: bigint): Promise<void> {
  const taken = await prisma.account.findFirst({
    where: { email, id: { not: exceptId } },
    select: { id: true },
  });
  if (taken) throw new EmailError('Ten adres jest już przypisany do innego konta');
}

/**
 * Corrects the address on an existing account — a typo, a changed domain. The
 * password and the sessions survive on purpose: it is the same people, reached
 * at a different address. Handing the region to a different couple is
 * handOverRegion, which revokes instead.
 */
export async function changeEmail(u: User, id: bigint, rawEmail: string): Promise<void> {
  if (!canManageAccounts(u)) {
    throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');
  }

  const email = normaliseEmail(rawEmail);
  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { email: true, name: true },
  });
  if (account.email === email) return;

  await assertEmailFree(email, id);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id }, data: { email } });
    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Zmieniono adres konta ${account.name}: „${account.email}" na „${email}"`,
        accountId: u.id,
      },
    });
  });
}

/**
 * A different couple takes over the region. Everything the outgoing couple
 * could use to get back in is revoked — password and sessions — and the
 * incoming one receives a fresh invite. Returns the raw token, the only
 * moment it exists.
 */
export async function handOverRegion(
  u: User,
  id: bigint,
  rawName: string,
  rawEmail: string,
): Promise<string> {
  if (!canManageAccounts(u)) {
    throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');
  }

  const name = rawName.trim();
  if (name === '') throw new AccountNameError('Podaj nazwę pary');
  if (name.length > MAX_ACCOUNT_NAME) {
    throw new AccountNameError(`Nazwa może mieć najwyżej ${MAX_ACCOUNT_NAME} znaków`);
  }

  const email = normaliseEmail(rawEmail);

  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { name: true, email: true, role: true },
  });
  if (account.role === 'admin') {
    throw new Forbidden('Konto administratora przekazuje się zmieniając nazwę i adres');
  }

  await assertEmailFree(email, id);

  const token = randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id },
      data: {
        name,
        email,
        // The outgoing couple knows the old password; leaving it would let
        // them sign in at the new address.
        passwordHash: null,
        status: 'pending',
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Przekazano rejon: „${account.name}" (${account.email}) → „${name}" (${email})`,
        accountId: u.id,
      },
    });
  });

  // Outside the transaction for the same reason as disabling an account: the
  // sessions must end whether or not the audit row committed first.
  await deleteAccountSessions(id);

  return token;
}

export async function redeemInvite(token: string, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new InviteError(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`);
  }

  const account = await prisma.account.findFirst({
    where: { inviteTokenHash: hashToken(token) },
    select: { id: true, inviteExpiresAt: true },
  });
  if (!account) throw new InviteError('Zaproszenie jest nieprawidłowe lub zostało już użyte');
  if (!account.inviteExpiresAt || account.inviteExpiresAt <= new Date()) {
    throw new InviteError('Zaproszenie wygasło — poproś o nowe');
  }

  const passwordHash = await hashPassword(password);

  await prisma.account.update({
    where: { id: account.id },
    data: {
      passwordHash,
      status: 'active',
      // One-time link: consumed on use.
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });
}
