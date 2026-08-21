import { createHash, randomBytes } from 'node:crypto';
import type { AccountStatus, Role } from '@/generated/prisma/enums';
import { Forbidden, type User, canManageAccounts, canManageRole } from '@/lib/auth/permissions';
import { deleteAccountSessions } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { REGION_COUNT, romanNumeral } from '@/lib/domain/regions';
import { INVITE_DAYS, MAX_ACCOUNT_NAME } from './policy';

export { INVITE_DAYS, MAX_ACCOUNT_NAME };

export class InviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteError';
  }
}

/**
 * An invite token is a bearer credential, so only its digest is stored — the
 * same reasoning as for session tokens. A fast hash rather than a slow,
 * salted one (the kind a password would need) because the token is 32 random
 * bytes, not a guessable secret — there is nothing here for a slow hash to
 * defend against.
 *
 * Exported so the command-line scripts that also issue invitations
 * (`create-superadmin.mts`, `key-reset.mts`) and the seed use this exact
 * function rather than a private copy — two digests that must agree tend to
 * drift apart, and when they do, an invitation just silently fails to
 * resolve, with nothing to say why.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Both halves of every guard below: the caller manages accounts at all, and
 * this particular account is not above them. Loading the row first is the
 * point — the answer depends on the role being acted on, not only the caller.
 */
async function assertMayManage(
  u: User,
  id: bigint,
): Promise<{ role: Role; name: string; email: string; status: AccountStatus; regionLead: boolean }> {
  if (!canManageAccounts(u)) {
    throw new Forbidden('Zarządzanie kontami wymaga uprawnień administratora');
  }
  const account = await prisma.account.findUniqueOrThrow({
    where: { id },
    select: { role: true, name: true, email: true, status: true, regionLead: true },
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
  // An invitation enrols a key, so it is a reset in everything but name:
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
 * key and the sessions survive on purpose: it is the same people, reached
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
 * could use to get back in is revoked — the key and every session — and the
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
  // A helper is not the region: replacing one is a deletion and a fresh
  // invitation, with nothing to revoke beyond that one account.
  if (!account.regionLead) {
    throw new Forbidden('Przekazać można wyłącznie konto pary odpowiedzialnej za rejon');
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
    // A different couple takes over this account. The outgoing couple's key
    // would otherwise keep working at the new address — the same reasoning
    // that used to clear the password hash, which no longer exists.
    await tx.credential.deleteMany({ where: { accountId: id } });

    await tx.account.update({
      where: { id },
      data: {
        name,
        email,
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
  /** Only meaningful for a region account: the responsible couple, or a helper. */
  regionLead: boolean;
};

/**
 * Brings an account into being in the state every account starts in: no
 * key, `pending`, holding a one-time invitation. Returns the raw token,
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
  const regionLead = input.role === 'region' && input.regionLead;
  const token = randomBytes(32).toString('base64url');

  await prisma.$transaction(async (tx) => {
    await tx.account.create({
      data: {
        name,
        email,
        role: input.role,
        regionId,
        regionLead,
        status: 'pending',
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await tx.audit.create({
      data: {
        kind: 'account',
        description:
          `Utworzono konto ${name} (${email}), rola: ${describeRole(input.role, regionLead)}`,
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
  region: 'para odpowiedzialna za rejon',
  viewer: 'moderator',
};

function describeRole(role: Role, regionLead: boolean): string {
  if (role === 'region' && !regionLead) return 'pomocnik rejonu';
  return ROLE_LABEL[role];
}

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

  // Helpers are neither counted nor limited: a region may ask as many couples
  // as it likes to keep the registry up to date.
  if (!input.regionLead) return regionId;

  // The responsible couple is one per region. A partial unique index says the
  // same thing to the database; this is the message a person can act on.
  // Status deliberately ignored: the partial unique index counts every lead,
  // disabled ones included, and a couple switched off for a while still holds
  // the office. Filtering by status here would let this pass and the database
  // refuse, turning a clear message into a raw constraint violation.
  const taken = await prisma.account.findFirst({
    where: { role: 'region', regionId, regionLead: true },
    select: { name: true },
  });
  if (taken) {
    throw new AccountRegionError(
      `Rejon ${romanNumeral(regionId)} ma już parę odpowiedzialną (${taken.name}) `
      + '— użyj „Przekaż rejon” albo załóż konto pomocnika',
    );
  }

  return regionId;
}

/**
 * Removes an account outright. Its sessions go with it through the foreign
 * key, and its audit entries stay: `audit.account_id` is ON DELETE SET NULL
 * and the history renders a headless entry as "konto usunięte". A register of
 * accountability that disappears with the account it accounts for is not a
 * register — but the name and the address, which are what identify a person,
 * do go.
 *
 * Disabling remains the reversible option. This one is for an account that
 * should never have existed, or for somebody who has left for good.
 */
export async function deleteAccount(u: User, id: bigint): Promise<void> {
  const account = await assertMayManage(u, id);

  // The two ways an installation loses its last way back in.
  if (id === u.id) throw new Forbidden('Nie można usunąć własnego konta');
  await assertNotLastCaretaker(account.role, id);

  await prisma.$transaction(async (tx) => {
    await tx.audit.create({
      data: {
        kind: 'account',
        // The name outlives the account here on purpose: the entry has to say
        // whose access was taken away. Retention prunes it in time.
        description: `Usunięto konto ${account.name} (${describeRole(account.role, account.regionLead)})`,
        accountId: u.id,
      },
    });

    await tx.account.delete({ where: { id } });
  });

  // Belt and braces: the cascade removes them, and this makes the intent
  // legible next to every other operation that ends somebody's access.
  await deleteAccountSessions(id);
}

/**
 * Checks the invitation and says whose it is. It no longer activates anything:
 * the account becomes usable at the moment a key is stored, and that has to be
 * one transaction with the key itself.
 */
export async function accountForInvite(token: string): Promise<bigint> {
  const account = await prisma.account.findFirst({
    where: { inviteTokenHash: hashToken(token) },
    select: { id: true, inviteExpiresAt: true },
  });
  if (!account) throw new InviteError('Zaproszenie jest nieprawidłowe lub zostało już użyte');
  if (!account.inviteExpiresAt || account.inviteExpiresAt <= new Date()) {
    throw new InviteError('Zaproszenie wygasło — poproś o nowe');
  }
  return account.id;
}
