import { describe, expect, it } from 'vitest';
import {
  Forbidden, type User, assertCanEdit, canChangeRegion, canDelete, canEdit,
  canExport, canImport, canManageAccounts, canManageRole, canPurge, canReadAudit,
  canRestore, canSeeDeleted, listScope,
} from './permissions';

const admin: User = { id: 1n, role: 'admin', regionId: null };
const caretaker: User = { id: 4n, role: 'superadmin', regionId: null };
const regionVII: User = { id: 2n, role: 'region', regionId: 7 };
const viewer: User = { id: 3n, role: 'viewer', regionId: null };

const coupleVII = { regionId: 7 };
const coupleIII = { regionId: 3 };

describe('listScope', () => {
  it('narrows a region account to its own region', () => {
    expect(listScope(regionVII)).toEqual({ deletedAt: null, regionId: 7 });
  });

  it('does not narrow admin or viewer by region', () => {
    expect(listScope(admin)).toEqual({ deletedAt: null });
    expect(listScope(viewer)).toEqual({ deletedAt: null });
  });

  it('always excludes soft-deleted records', () => {
    for (const u of [admin, regionVII, viewer]) {
      expect(listScope(u).deletedAt).toBeNull();
    }
  });

  it('refuses a region account with no region instead of widening the scope', () => {
    // A database CHECK makes this state impossible, but if it ever occurred the
    // scope must not silently fall through to "every couple in the community".
    const broken: User = { id: 9n, role: 'region', regionId: null };
    expect(() => listScope(broken)).toThrow(Forbidden);
  });
});

describe('canEdit', () => {
  it('lets admin edit couples in any region', () => {
    expect(canEdit(admin, coupleVII)).toBe(true);
    expect(canEdit(admin, coupleIII)).toBe(true);
  });

  it('lets a region account edit only its own region', () => {
    expect(canEdit(regionVII, coupleVII)).toBe(true);
    expect(canEdit(regionVII, coupleIII)).toBe(false);
  });

  it('never lets the viewer edit anything', () => {
    expect(canEdit(viewer, coupleVII)).toBe(false);
    expect(canEdit(viewer, coupleIII)).toBe(false);
  });
});

describe('canDelete', () => {
  it('follows the same rule as editing', () => {
    expect(canDelete(admin, coupleIII)).toBe(true);
    expect(canDelete(regionVII, coupleVII)).toBe(true);
    expect(canDelete(regionVII, coupleIII)).toBe(false);
    expect(canDelete(viewer, coupleVII)).toBe(false);
  });
});

describe('admin-only capabilities', () => {
  const adminOnly = { canPurge, canManageAccounts, canReadAudit, canImport, canChangeRegion };

  for (const [name, fn] of Object.entries(adminOnly)) {
    it(`grants ${name} to admin only`, () => {
      expect(fn(admin), 'admin').toBe(true);
      expect(fn(regionVII), 'region account').toBe(false);
      expect(fn(viewer), 'viewer').toBe(false);
    });
  }
});

describe('canExport', () => {
  it('allows every role to export — scope is narrowed by listScope', () => {
    expect(canExport(admin)).toBe(true);
    expect(canExport(regionVII)).toBe(true);
    expect(canExport(viewer)).toBe(true);
  });
});

describe('assertCanEdit', () => {
  it('passes silently when allowed', () => {
    expect(() => assertCanEdit(regionVII, coupleVII)).not.toThrow();
  });

  it('throws Forbidden when denied', () => {
    expect(() => assertCanEdit(regionVII, coupleIII)).toThrow(Forbidden);
    expect(() => assertCanEdit(viewer, coupleVII)).toThrow(Forbidden);
  });
});

describe('listScope with the deleted flag', () => {
  // Erasure on request has to reach a record that has already left the lists.
  it('gives the admin the soft-deleted records', () => {
    expect(listScope(admin, { deleted: true })).toEqual({ deletedAt: { not: null } });
  });

  // A query string is not a permission: asking without a reason to look
  // returns the ordinary list rather than an error, so nothing leaks and
  // nothing breaks.
  it('ignores the flag for a read-only account', () => {
    expect(listScope(viewer, { deleted: true })).toEqual({ deletedAt: null });
  });

  // Changed 19.08.2026: a region account used to be sent its ordinary list
  // here. Soft deletion exists so a misclick can be undone, and the account
  // that misclicks cannot undo what it cannot see. Its own region only.
  it('gives a region account the deleted records of its own region', () => {
    expect(listScope(regionVII, { deleted: true })).toEqual({
      deletedAt: { not: null }, regionId: 7,
    });
  });
});

describe('the technical account', () => {
  // Whatever the admin may do, the caretaker may do — a rule that forgot it
  // would lock the person maintaining the installation out of it.
  it.each([
    ['canPurge', canPurge],
    ['canManageAccounts', canManageAccounts],
    ['canReadAudit', canReadAudit],
    ['canImport', canImport],
    ['canChangeRegion', canChangeRegion],
    ['canExport', canExport],
  ])('holds every power the admin holds: %s', (_name, can) => {
    expect(can(caretaker)).toBe(can(admin));
    expect(can(caretaker)).toBe(true);
  });

  it('edits couples in every region, like the admin', () => {
    expect(canEdit(caretaker, coupleVII)).toBe(true);
    expect(canEdit(caretaker, coupleIII)).toBe(true);
    expect(canDelete(caretaker, coupleIII)).toBe(true);
  });

  it('is not narrowed by region', () => {
    expect(listScope(caretaker)).toEqual({ deletedAt: null });
  });
});

describe('canManageRole', () => {
  it('lets the technical account reach every role, itself included', () => {
    for (const role of ['superadmin', 'admin', 'region', 'viewer'] as const) {
      expect(canManageRole(caretaker, role)).toBe(true);
    }
  });

  it('stops the admin at the technical account', () => {
    // The whole boundary. Renaming it or moving its address would be a
    // takeover: the next invitation link would arrive at the new address.
    expect(canManageRole(admin, 'superadmin')).toBe(false);
  });

  it('lets the admin manage the community, admins included', () => {
    // Not a boundary worth drawing: both already hold every couple on file.
    for (const role of ['admin', 'region', 'viewer'] as const) {
      expect(canManageRole(admin, role)).toBe(true);
    }
  });

  it('gives a region account and a viewer no say over any account', () => {
    for (const role of ['superadmin', 'admin', 'region', 'viewer'] as const) {
      expect(canManageRole(regionVII, role)).toBe(false);
      expect(canManageRole(viewer, role)).toBe(false);
    }
  });
});

describe('reaching the soft-deleted records', () => {
  it('is open to whoever may put one back or erase it', () => {
    expect(canSeeDeleted(caretaker)).toBe(true);
    expect(canSeeDeleted(admin)).toBe(true);
    // The reason a region account needs it: soft deletion exists so a misclick
    // can be undone, and the misclick is usually theirs.
    expect(canSeeDeleted(regionVII)).toBe(true);
  });

  it('is closed to a read-only account, which neither deletes nor restores', () => {
    expect(canSeeDeleted(viewer)).toBe(false);
  });

  it('narrows a region account to its own region even when asking for deleted', () => {
    expect(listScope(regionVII, { deleted: true })).toEqual({
      deletedAt: { not: null }, regionId: 7,
    });
  });

  it('gives a viewer its ordinary list rather than an error', () => {
    // The flag is a query string, and a query string is not a permission.
    expect(listScope(viewer, { deleted: true })).toEqual({ deletedAt: null });
  });
});

describe('canRestore', () => {
  it('mirrors canDelete exactly: undoing is the same authority, reversed', () => {
    for (const [u, couple] of [
      [admin, coupleIII], [caretaker, coupleVII],
      [regionVII, coupleVII], [regionVII, coupleIII], [viewer, coupleVII],
    ] as const) {
      expect(canRestore(u, couple)).toBe(canDelete(u, couple));
    }
  });

  it('keeps a region account inside its own region', () => {
    expect(canRestore(regionVII, coupleVII)).toBe(true);
    expect(canRestore(regionVII, coupleIII)).toBe(false);
  });

  it('gives the moderator nothing to restore', () => {
    expect(canRestore(viewer, coupleVII)).toBe(false);
  });
});
