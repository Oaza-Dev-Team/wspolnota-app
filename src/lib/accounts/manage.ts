import { createHash, randomBytes } from 'node:crypto';
import type { AccountStatus, Role } from '@/generated/prisma/enums';
import { hashPassword } from '@/lib/auth/password';
import { Forbidden, type User, canManageAccounts, canManageRole } from '@/lib/auth/permissions';
import { deleteAccountSessions } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
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

/**
 * Both halves of every guard below: the caller manages accounts at all, and
 * this particular account is not above them. Loading the row first is the
 * point — the answer depends on the role being acted on, not only the caller.
 */
async function assertMayManage(u: User, id: bigint): Promise<{ role: Role; name: string; email: string; status: AccountStatus }> {
  if (!canManageAccounts(u)) {
    throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');
  }
  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { role: true, name: true, email: true, status: true },
  });
  if (!canManageRole(u, account.role)) {
    throw new Forbidden('Konta technicznego nie zmienia się z poziomu administratora');
  }
  return account;
}

/**
 * An installation with no active superadmin can only be repaired with database
 * access, so the last one cannot be switched off — not even by itself.
 */
async function assertNotLastCaretaker(role: Role, id: bigint): Promise<void> {
  if (role !== 'superadmin') return;
  const others = await prisma.account.count({
    where: { role: 'superadmin', status: 'active', id: { not: id } },
  });
  if (others === 0) {
    throw new Forbidden('To jedyne aktywne konto techniczne — najpierw utwórz drugie');
  }
}

export async function setAccountStatus(
  u: User,
  id: bigint,
  status: Extract<AccountStatus, 'active' | 'disabled'>,
): Promise<void> {
  const account = await assertMayManage(u, id);

  // Locking oneself out of account management would need database access to undo.
  if (id === u.id) throw new Forbidden('Nie można wyłączyć własnego konta');
  if (status === 'disabled') await assertNotLastCaretaker(account.role, id);

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
  const account = await assertMayManage(u, id);

  const trimmed = name.trim();
  if (trimmed === '') throw new AccountNameError('Podaj nazwę pary');
  if (trimmed.length > MAX_ACCOUNT_NAME) {
    throw new AccountNameError(`Nazwa może mieć najwyżej ${MAX_ACCOUNT_NAME} znaków`);
  }
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
  // An invitation sets a password, so it is a reset in everything but name:
  // whoever may issue one to an account may take it over. assertMayManage is
  // what keeps that inside the boundary.
  const account = await assertMayManage(u, id);

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

async function assertEmailFree(email: string, exceptId?: bigint): Promise<void> {
  const taken = await prisma.account.findFirst({
    where: { email, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
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
  const account = await assertMayManage(u, id);

  const email = normaliseEmail(rawEmail);
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
  const account = await assertMayManage(u, id);
  if (account.role !== 'region') {
    throw new Forbidden('Przekazać można wyłącznie konto rejonowe');
  }

  const name = rawName.trim();
  if (name === '') throw new AccountNameError('Podaj nazwę pary');
  if (name.length > MAX_ACCOUNT_NAME) {
    throw new AccountNameError(`Nazwa może mieć najwyżej ${MAX_ACCOUNT_NAME} znaków`);
  }

  const email = normaliseEmail(rawEmail);
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

export type NewAccount = {
  name: string;
  email: string;
  role: Role;
  /** Required for a region account, refused for every other role. */
  regionId: number | null;
};

/**
 * Brings an account into being in the state every account starts in: no
 * password, `pending`, holding a one-time invitation. Returns the raw token,
 * the only moment it exists — the same contract as createInvite, because this
 * is the first invitation rather than a different kind of thing.
 *
 * Until now accounts came only from the seed and from scripts/create-superadmin.
 */
export async function createAccount(u: User, input: NewAccount): Promise<string> {
  if (!canManageAccounts(u)) {
    throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');
  }
  if (!canManageRole(u, input.role)) {
    throw new Forbidden('Konto techniczne zakłada wyłącznie inne konto techniczne');
  }

  const name = input.name.trim();
  if (name === '') throw new AccountNameError('Podaj nazwę pary');
  if (name.length > MAX_ACCOUNT_NAME) {
    throw new AccountNameError(`Nazwa może mieć najwyżej ${MAX_ACCOUNT_NAME} znaków`);
  }

  const email = normaliseEmail(input.email);
  await assertEmailFree(email);

  const regionId = await resolveNewAccountRegion(input);
  const token = randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    await tx.account.create({
      data: {
        name,
        email,
        role: input.role,
        regionId,
        status: 'pending',
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description: `Utworzono konto ${name} (${email}), rola: ${ROLE_LABEL[input.role]}`,
        accountId: u.id,
      },
    });
  });

  return token;
}

/** Human-readable in the audit, which a person reads and a machine does not. */
const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'konto techniczne',
  admin: 'para odpowiedzialna za wspólnotę',
  region: 'para rejonowa',
  viewer: 'moderator',
};

export class AccountRegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountRegionError';
  }
}

/**
 * A region shows one responsible couple, and regionStats reaches it through a
 * map keyed by region — a second active account would silently displace the
 * first. Replacing a couple is handOverRegion, which revokes as it goes.
 */
async function resolveNewAccountRegion(input: NewAccount): Promise<number | null> {
  if (input.role !== 'region') return null;

  const { regionId } = input;
  if (regionId === null || !Number.isInteger(regionId) || regionId < 1 || regionId > REGION_COUNT) {
    throw new AccountRegionError(`Wybierz rejon z zakresu I–${romanNumeral(REGION_COUNT)}`);
  }

  const taken = await prisma.account.findFirst({
    where: { role: 'region', regionId, status: { not: 'disabled' } },
    select: { name: true },
  });
  if (taken) {
    throw new AccountRegionError(
      `Rejon ${romanNumeral(regionId)} ma już konto (${taken.name}) — użyj „Przekaż rejon”`,
    );
  }

  return regionId;
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
