import type { Prisma } from '@/generated/prisma/client';
import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { type Uzytkownik, zakresListy } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { type Filtry, ROZMIAR_STRONY } from './filtry';
import { bezOgonkow } from './szukanie';

export type WierszPary = {
  id: bigint;
  nazwisko: string;
  imieZony: string;
  imieMeza: string;
  email: string | null;
  telefon: string | null;
  rejonId: number;
  parafia: string | null;
  krag: string | null;
  rodzaje: RodzajRekolekcji[];
};

/**
 * A couple's parish is its own when set, otherwise its circle's (spec 4.2).
 * Filtering on para.parafia_id alone would drop every couple that simply
 * inherits its circle's parish — which is most of them.
 */
function warunekParafii(parafiaId: bigint): Prisma.ParaWhereInput {
  return {
    OR: [
      { parafiaId },
      { parafiaId: null, krag: { parafiaId } },
    ],
  };
}

function warunekFormacji(f: Filtry['formacja']): Prisma.ParaWhereInput {
  switch (f.rodzaj) {
    case 'dowolna': return {};
    case 'ma': return { rekolekcje: { some: { rodzaj: f.stopien } } };
    case 'bez': return { rekolekcje: { none: { rodzaj: f.stopien } } };
    case 'inne': return { rekolekcje: { some: { rodzaj: 'INNE' } } };
    case 'brak': return { rekolekcje: { none: {} } };
  }
}

function warunekSzukania(q: string): Prisma.ParaWhereInput {
  if (!q) return {};
  // Compared against the generated `szukajka` columns, which Postgres keeps
  // lower-cased and unaccented. Plain `contains` suffices: both sides of the
  // comparison have already been normalised the same way.
  const zawiera = { contains: bezOgonkow(q) };
  return {
    OR: [
      { szukajka: zawiera },
      { parafia: { szukajka: zawiera } },
      { krag: { szukajka: zawiera } },
      // A couple with no parish of its own is searchable through its circle's.
      { parafiaId: null, krag: { parafia: { szukajka: zawiera } } },
    ],
  };
}

function where(u: Uzytkownik, f: Filtry): Prisma.ParaWhereInput {
  const warunki: Prisma.ParaWhereInput[] = [
    // Always first and never optional: this is what keeps a region account
    // inside its region and soft-deleted couples out of every list.
    zakresListy(u),
    warunekSzukania(f.q),
    warunekFormacji(f.formacja),
  ];

  // A region account's own scope already pins the region; an explicit filter
  // may only narrow further, never widen — the AND guarantees that.
  if (f.rejon !== null) warunki.push({ rejonId: f.rejon });
  if (f.parafia !== null) warunki.push(warunekParafii(f.parafia));
  if (f.krag !== null) warunki.push({ kragId: f.krag });

  return { AND: warunki };
}

function orderBy(f: Filtry): Prisma.ParaOrderByWithRelationInput[] {
  const kierunek = f.dir;
  switch (f.sort) {
    case 'imiona': return [{ imieZony: kierunek }, { nazwisko: 'asc' }];
    case 'email': return [{ email: kierunek }, { nazwisko: 'asc' }];
    case 'telefon': return [{ telefon: kierunek }, { nazwisko: 'asc' }];
    case 'rejon': return [{ rejonId: kierunek }, { nazwisko: 'asc' }];
    case 'parafia': return [{ parafia: { nazwa: kierunek } }, { nazwisko: 'asc' }];
    case 'krag': return [{ krag: { numer: kierunek } }, { nazwisko: 'asc' }];
    case 'nazwisko':
    default: return [{ nazwisko: kierunek }, { imieZony: 'asc' }];
  }
}

function etykietaKregu(numer: number, patron: string | null): string {
  return patron ? `${numer} · ${patron}` : String(numer);
}

export async function queryPary(
  u: Uzytkownik,
  f: Filtry,
): Promise<{ wiersze: WierszPary[]; znalezione: number; wszystkie: number }> {
  const warunek = where(u, f);

  const [rekordy, znalezione, wszystkie] = await Promise.all([
    prisma.para.findMany({
      where: warunek,
      orderBy: orderBy(f),
      skip: (f.strona - 1) * ROZMIAR_STRONY,
      take: ROZMIAR_STRONY,
      select: {
        id: true, nazwisko: true, imieZony: true, imieMeza: true,
        email: true, telefon: true, rejonId: true,
        parafia: { select: { nazwa: true, miasto: true } },
        krag: {
          select: {
            numer: true, patron: true,
            parafia: { select: { nazwa: true, miasto: true } },
          },
        },
        rekolekcje: { select: { rodzaj: true } },
      },
    }),
    prisma.para.count({ where: warunek }),
    prisma.para.count({ where: zakresListy(u) }),
  ]);

  const wiersze: WierszPary[] = rekordy.map((r) => {
    const parafia = r.parafia ?? r.krag?.parafia ?? null;
    return {
      id: r.id,
      nazwisko: r.nazwisko,
      imieZony: r.imieZony,
      imieMeza: r.imieMeza,
      email: r.email,
      telefon: r.telefon,
      rejonId: r.rejonId,
      parafia: parafia ? `${parafia.nazwa}, ${parafia.miasto}` : null,
      krag: r.krag ? etykietaKregu(r.krag.numer, r.krag.patron) : null,
      rodzaje: r.rekolekcje.map((x) => x.rodzaj),
    };
  });

  return { wiersze, znalezione, wszystkie };
}

/**
 * Options for the cascading selects. Both lists are derived from the couples
 * the user may actually see, so a region account never learns which parishes
 * exist elsewhere.
 */
export async function opcjeFiltrow(
  u: Uzytkownik,
  f: Filtry,
): Promise<{
  parafie: { id: bigint; etykieta: string }[];
  kregi: { id: bigint; etykieta: string }[];
}> {
  const zakres: Prisma.ParaWhereInput = {
    AND: [zakresListy(u), f.rejon !== null ? { rejonId: f.rejon } : {}],
  };

  const pary = await prisma.para.findMany({
    where: zakres,
    select: {
      parafia: { select: { id: true, nazwa: true, miasto: true } },
      krag: {
        select: {
          id: true, numer: true, patron: true,
          parafia: { select: { id: true, nazwa: true, miasto: true } },
        },
      },
    },
  });

  const parafie = new Map<string, { id: bigint; etykieta: string }>();
  const kregi = new Map<string, { id: bigint; etykieta: string }>();

  for (const p of pary) {
    const parafia = p.parafia ?? p.krag?.parafia ?? null;
    if (parafia) {
      parafie.set(String(parafia.id), {
        id: parafia.id,
        etykieta: `${parafia.nazwa}, ${parafia.miasto}`,
      });
    }
    // Circles are narrowed by the chosen parish as well as the region.
    if (p.krag && (f.parafia === null || parafia?.id === f.parafia)) {
      kregi.set(String(p.krag.id), {
        id: p.krag.id,
        etykieta: `Krąg ${etykietaKregu(p.krag.numer, p.krag.patron)}`,
      });
    }
  }

  const wgEtykiety = (a: { etykieta: string }, b: { etykieta: string }) =>
    a.etykieta.localeCompare(b.etykieta, 'pl', { numeric: true });

  return {
    parafie: [...parafie.values()].sort(wgEtykiety),
    kregi: [...kregi.values()].sort(wgEtykiety),
  };
}
