import { describe, expect, it } from 'vitest';
import {
  Forbidden, type User, assertCanEdit, canChangeRegion, canDelete, canEdit,
  canExport, canImport, canManageAccounts, canPurge, canReadAudit, listScope,
} from './permissions';

const admin: User = { id: 1n, role: 'admin', regionId: null };
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
