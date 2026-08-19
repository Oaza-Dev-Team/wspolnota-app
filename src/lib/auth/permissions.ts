import type { Role } from '@/generated/prisma/enums';

export type User = {
  id: bigint;
  role: Role;
  regionId: number | null;
};

/** The minimum a caller must know about a couple to decide access. */
export type CoupleScope = { regionId: number };

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
 * `deleted` asks for the soft-deleted records instead of the live ones, which
 * only the admin may see — erasure on request needs a way to reach a record
 * that has already been taken off the lists. Anyone else asking gets their
 * ordinary list rather than an error: the flag is a query string, and a query
 * string is not a permission.
 */
export function listScope(u: User, options: { deleted?: boolean } = {}): ListScope {
  const deletedAt = options.deleted && canPurge(u) ? { not: null } : null;

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
  if (u.role === 'admin') return true;
  if (u.role === 'region') return u.regionId !== null && couple.regionId === u.regionId;
  return false;
}

export function canDelete(u: User, couple: CoupleScope): boolean {
  return canEdit(u, couple);
}

export function canPurge(u: User): boolean {
  return u.role === 'admin';
}

export function canManageAccounts(u: User): boolean {
  return u.role === 'admin';
}

export function canReadAudit(u: User): boolean {
  return u.role === 'admin';
}

export function canImport(u: User): boolean {
  return u.role === 'admin';
}

/** A region account may never move a couple out of its own region. */
export function canChangeRegion(u: User): boolean {
  return u.role === 'admin';
}

/** Every role may export; listScope decides how much they get. */
export function canExport(_u: User): boolean {
  return true;
}

export function assertCanEdit(u: User, couple: CoupleScope): void {
  if (!canEdit(u, couple)) throw new Forbidden();
}
