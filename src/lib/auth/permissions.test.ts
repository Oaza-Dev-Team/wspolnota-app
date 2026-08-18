import { describe, expect, it } from 'vitest';
import {
  type Uzytkownik, Zabronione, assertMozeEdytowac, mozeCzytacAudyt,
  mozeEksportowac, mozeEdytowac, mozeImportowac, mozeUsunacTrwale, mozeUsuwac,
  mozeZarzadzacKontami, mozeZmienicRejon, zakresListy,
} from './permissions';

const admin: Uzytkownik = { id: 1n, rola: 'admin', rejonId: null };
const rejonVII: Uzytkownik = { id: 2n, rola: 'rejon', rejonId: 7 };
const moderator: Uzytkownik = { id: 3n, rola: 'podglad', rejonId: null };

const paraVII = { rejonId: 7 };
const paraIII = { rejonId: 3 };

describe('zakresListy', () => {
  it('narrows a region account to its own region', () => {
    expect(zakresListy(rejonVII)).toEqual({ usunieteAt: null, rejonId: 7 });
  });

  it('does not narrow admin or viewer by region', () => {
    expect(zakresListy(admin)).toEqual({ usunieteAt: null });
    expect(zakresListy(moderator)).toEqual({ usunieteAt: null });
  });

  it('always excludes soft-deleted records', () => {
    for (const u of [admin, rejonVII, moderator]) {
      expect(zakresListy(u).usunieteAt).toBeNull();
    }
  });

  it('refuses a region account with no region instead of widening the scope', () => {
    // A database CHECK makes this state impossible, but if it ever occurred the
    // scope must not silently fall through to "every couple in the community".
    const zepsute: Uzytkownik = { id: 9n, rola: 'rejon', rejonId: null };
    expect(() => zakresListy(zepsute)).toThrow(Zabronione);
  });
});

describe('mozeEdytowac', () => {
  it('lets admin edit couples in any region', () => {
    expect(mozeEdytowac(admin, paraVII)).toBe(true);
    expect(mozeEdytowac(admin, paraIII)).toBe(true);
  });

  it('lets a region account edit only its own region', () => {
    expect(mozeEdytowac(rejonVII, paraVII)).toBe(true);
    expect(mozeEdytowac(rejonVII, paraIII)).toBe(false);
  });

  it('never lets the viewer edit anything', () => {
    expect(mozeEdytowac(moderator, paraVII)).toBe(false);
    expect(mozeEdytowac(moderator, paraIII)).toBe(false);
  });
});

describe('mozeUsuwac', () => {
  it('follows the same rule as editing', () => {
    expect(mozeUsuwac(admin, paraIII)).toBe(true);
    expect(mozeUsuwac(rejonVII, paraVII)).toBe(true);
    expect(mozeUsuwac(rejonVII, paraIII)).toBe(false);
    expect(mozeUsuwac(moderator, paraVII)).toBe(false);
  });
});

describe('admin-only capabilities', () => {
  const tylkoAdmin = {
    mozeUsunacTrwale, mozeZarzadzacKontami, mozeCzytacAudyt,
    mozeImportowac, mozeZmienicRejon,
  };

  for (const [nazwa, fn] of Object.entries(tylkoAdmin)) {
    it(`grants ${nazwa} to admin only`, () => {
      expect(fn(admin), 'admin').toBe(true);
      expect(fn(rejonVII), 'region account').toBe(false);
      expect(fn(moderator), 'viewer').toBe(false);
    });
  }
});

describe('mozeEksportowac', () => {
  it('allows every role to export — scope is narrowed by zakresListy', () => {
    expect(mozeEksportowac(admin)).toBe(true);
    expect(mozeEksportowac(rejonVII)).toBe(true);
    expect(mozeEksportowac(moderator)).toBe(true);
  });
});

describe('assertMozeEdytowac', () => {
  it('passes silently when allowed', () => {
    expect(() => assertMozeEdytowac(rejonVII, paraVII)).not.toThrow();
  });

  it('throws Zabronione when denied', () => {
    expect(() => assertMozeEdytowac(rejonVII, paraIII)).toThrow(Zabronione);
    expect(() => assertMozeEdytowac(moderator, paraVII)).toThrow(Zabronione);
  });
});
