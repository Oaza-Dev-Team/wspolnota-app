import type { Role } from '@/generated/prisma/enums';

export type User = {
  id: bigint;
  role: Role;
  regionId: number | null;
};

/** The minimum a caller must know about a couple to decide access. */
export type CoupleScope = { regionId: number };

/**
 * The technical account is the admin plus the accounts the admin may not
 * touch, so every rule written for the admin holds for it too. Roles are
 * compared through this rather than one by one: a rule that forgets the
 * superadmin would lock the caretaker out of the app they maintain.
 */
function hasAdminPowers(u: User): boolean {
  return u.role === 'admin' || u.role === 'superadmin';
}

export class Forbidden extends Error {
  constructor(message = 'Brak uprawnień do tej operacji') {
    super(message);
    this.name = 'Forbidden';
  }
}

export type ListScope = {
  deletedAt: null | { not: null };
  regionId?: number;
};

/**
 * The Prisma `where` fragment that every list, export and statistics query
 * must spread in. Scoping is structural rather than remembered: a query that
 * forgets this fragment fails review, not production.
 *
 * `deleted` asks for the soft-deleted records instead of the live ones. Two
 * separate needs reach for it: erasure on request has to find a record that
 * has already been taken off the lists, and whoever deleted one by mistake
 * has to find it to put it back — which is what soft deletion is for. The
 * region scoping below still applies, so a region account sees the ones it
 * could have deleted itself. A read-only account does neither and gets its
 * ordinary list rather than an error: the flag is a query string, and a query
 * string is not a permission.
 */
export function listScope(u: User, options: { deleted?: boolean } = {}): ListScope {
  const deletedAt = options.deleted && canSeeDeleted(u) ? { not: null } : null;

  if (u.role === 'region') {
    // Fail closed. A CHECK constraint keeps regionId set for this role, but if
    // that invariant ever broke, falling through would hand a region account
    // the whole community rather than denying it.
    if (u.regionId === null) {
      throw new Forbidden('Konto rejonowe bez przypisanego rejonu');
    }
    return { deletedAt, regionId: u.regionId };
  }
  return { deletedAt };
}

export function canEdit(u: User, couple: CoupleScope): boolean {
  if (hasAdminPowers(u)) return true;
  if (u.role === 'region') return u.regionId !== null && couple.regionId === u.regionId;
  return false;
}

export function canDelete(u: User, couple: CoupleScope): boolean {
  return canEdit(u, couple);
}

/**
 * Symmetric with canDelete on purpose: undoing a deletion is the same act of
 * authority as making it, pointed the other way.
 */
export function canRestore(u: User, couple: CoupleScope): boolean {
  return canDelete(u, couple);
}

/**
 * Whether the soft-deleted records are reachable at all. Not the same as
 * canPurge: putting a record back is the ordinary correction of a misclick,
 * while erasing it for good stays with the admin.
 */
export function canSeeDeleted(u: User): boolean {
  return hasAdminPowers(u) || u.role === 'region';
}

export function canPurge(u: User): boolean {
  return hasAdminPowers(u);
}

export function canManageAccounts(u: User): boolean {
  return hasAdminPowers(u);
}

/**
 * Whether the caller may act on — or bring into being — an account holding
 * this role. One boundary carries the whole design: an admin must not reach
 * the technical account. Renaming it or moving its address would be a
 * takeover, because the next invitation link would arrive at the new address.
 * Admin-on-admin is deliberately allowed: both already hold every couple in
 * the registry, so there is nothing between them left to protect.
 */
export function canManageRole(u: User, role: Role): boolean {
  if (u.role === 'superadmin') return true;
  if (u.role === 'admin') return role !== 'superadmin';
  return false;
}

export function canReadAudit(u: User): boolean {
  return hasAdminPowers(u);
}

export function canImport(u: User): boolean {
  return hasAdminPowers(u);
}

/** A region account may never move a couple out of its own region. */
export function canChangeRegion(u: User): boolean {
  return hasAdminPowers(u);
}

/** Every role may export; listScope decides how much they get. */
export function canExport(_u: User): boolean {
  return true;
}

export function assertCanEdit(u: User, couple: CoupleScope): void {
  if (!canEdit(u, couple)) throw new Forbidden();
}
