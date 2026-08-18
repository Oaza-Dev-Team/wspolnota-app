import type { Rola } from '@/generated/prisma/enums';

export type Uzytkownik = {
  id: bigint;
  rola: Rola;
  rejonId: number | null;
};

/** The minimum a caller must know about a couple to decide access. */
export type ParaZakres = { rejonId: number };

export class Zabronione extends Error {
  constructor(message = 'Brak uprawnień do tej operacji') {
    super(message);
    this.name = 'Zabronione';
  }
}

/**
 * The Prisma `where` fragment that every list, export and statistics query
 * must spread in. Scoping is structural rather than remembered: a query that
 * forgets this fragment fails review, not production.
 */
export function zakresListy(u: Uzytkownik): { usunieteAt: null; rejonId?: number } {
  if (u.rola === 'rejon') {
    // Fail closed. A CHECK constraint keeps rejonId set for this role, but if
    // that invariant ever broke, falling through would hand a region account
    // the whole community rather than denying it.
    if (u.rejonId === null) {
      throw new Zabronione('Konto rejonowe bez przypisanego rejonu');
    }
    return { usunieteAt: null, rejonId: u.rejonId };
  }
  return { usunieteAt: null };
}

export function mozeEdytowac(u: Uzytkownik, para: ParaZakres): boolean {
  if (u.rola === 'admin') return true;
  if (u.rola === 'rejon') return u.rejonId !== null && para.rejonId === u.rejonId;
  return false;
}

export function mozeUsuwac(u: Uzytkownik, para: ParaZakres): boolean {
  return mozeEdytowac(u, para);
}

export function mozeUsunacTrwale(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

export function mozeZarzadzacKontami(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

export function mozeCzytacAudyt(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

export function mozeImportowac(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

/** A region account may never move a couple out of its own region. */
export function mozeZmienicRejon(u: Uzytkownik): boolean {
  return u.rola === 'admin';
}

/** Every role may export; zakresListy decides how much they get. */
export function mozeEksportowac(_u: Uzytkownik): boolean {
  return true;
}

export function assertMozeEdytowac(u: Uzytkownik, para: ParaZakres): void {
  if (!mozeEdytowac(u, para)) throw new Zabronione();
}
