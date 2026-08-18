import type { RodzajRekolekcji } from '@/generated/prisma/enums';
import { STOPNIE, opisRodzaju } from '@/lib/domena/rekolekcje';
import { LICZBA_REJONOW } from '@/lib/domena/rejony';

export const ROZMIAR_STRONY = 50;

export type Formacja =
  | { rodzaj: 'dowolna' }
  | { rodzaj: 'ma'; stopien: RodzajRekolekcji }
  | { rodzaj: 'bez'; stopien: RodzajRekolekcji }
  | { rodzaj: 'inne' }
  | { rodzaj: 'brak' };

export type KluczSortowania =
  | 'nazwisko' | 'imiona' | 'email' | 'telefon' | 'rejon' | 'parafia' | 'krag';

// Seven sortable columns. "Formacja" is deliberately absent: it is a computed
// badge, not a column the database can order by meaningfully.
export const KLUCZE_SORTOWANIA: readonly KluczSortowania[] = [
  'nazwisko', 'imiona', 'email', 'telefon', 'rejon', 'parafia', 'krag',
];

export type Filtry = {
  q: string;
  rejon: number | null;
  parafia: bigint | null;
  krag: bigint | null;
  formacja: Formacja;
  sort: KluczSortowania;
  dir: 'asc' | 'desc';
  strona: number;
};

/**
 * Ids arrive as bigint on the server and as string in the client component —
 * bigint does not cross the server/client boundary. Both are accepted by the
 * serialiser so there is one of it rather than two that can drift apart.
 */
export type FiltryDoUrl = Omit<Filtry, 'parafia' | 'krag'> & {
  parafia: bigint | string | null;
  krag: bigint | string | null;
};

export type FiltryKlienta = Omit<Filtry, 'parafia' | 'krag'> & {
  parafia: string | null;
  krag: string | null;
};

export const OPCJE_FORMACJI: readonly { wartosc: string; etykieta: string }[] = [
  { wartosc: 'all', etykieta: 'Formacja — dowolna' },
  ...STOPNIE.map((s) => ({ wartosc: s, etykieta: `Ma ${opisRodzaju(s).kod}` })),
  ...STOPNIE.map((s) => ({ wartosc: `bez:${s}`, etykieta: `Bez ${opisRodzaju(s).kod}` })),
  { wartosc: 'INNE', etykieta: 'Ma inne rekolekcje' },
  { wartosc: 'brak', etykieta: 'Bez żadnych rekolekcji' },
];

function pierwsza(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function liczba(v: string | string[] | undefined, min: number, max: number): number | null {
  const s = pierwsza(v);
  if (s === undefined) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function bigintDodatni(v: string | string[] | undefined): bigint | null {
  const s = pierwsza(v);
  if (s === undefined || !/^\d+$/.test(s)) return null;
  const n = BigInt(s);
  return n > 0n ? n : null;
}

function parseFormacja(v: string | string[] | undefined): Formacja {
  const s = pierwsza(v);
  if (!s || s === 'all') return { rodzaj: 'dowolna' };
  if (s === 'brak') return { rodzaj: 'brak' };
  if (s === 'INNE') return { rodzaj: 'inne' };

  const zaprzeczony = s.startsWith('bez:');
  const kod = zaprzeczony ? s.slice(4) : s;
  const stopien = STOPNIE.find((x) => x === kod);
  if (!stopien) return { rodzaj: 'dowolna' };
  return zaprzeczony ? { rodzaj: 'bez', stopien } : { rodzaj: 'ma', stopien };
}

/**
 * Never throws. A hand-edited or stale bookmark is ordinary traffic, and an
 * unrecognised value must degrade to the default rather than 500 the page.
 */
export function parseFiltry(params: Record<string, string | string[] | undefined>): Filtry {
  const sortKandydat = pierwsza(params['sort']);
  const sort = KLUCZE_SORTOWANIA.find((k) => k === sortKandydat) ?? 'nazwisko';

  return {
    q: (pierwsza(params['q']) ?? '').trim(),
    rejon: liczba(params['rejon'], 1, LICZBA_REJONOW),
    parafia: bigintDodatni(params['parafia']),
    krag: bigintDodatni(params['krag']),
    formacja: parseFormacja(params['formacja']),
    sort,
    dir: pierwsza(params['dir']) === 'desc' ? 'desc' : 'asc',
    strona: liczba(params['page'], 1, 10_000) ?? 1,
  };
}

function formacjaDoTekstu(f: Formacja): string | null {
  switch (f.rodzaj) {
    case 'dowolna': return null;
    case 'ma': return f.stopien;
    case 'bez': return `bez:${f.stopien}`;
    case 'inne': return 'INNE';
    case 'brak': return 'brak';
  }
}

/** Emits only non-default values, so an unfiltered list has a bare URL. */
export function doSearchParams(f: FiltryDoUrl): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.rejon !== null) p.set('rejon', String(f.rejon));
  if (f.parafia !== null) p.set('parafia', String(f.parafia));
  if (f.krag !== null) p.set('krag', String(f.krag));

  const formacja = formacjaDoTekstu(f.formacja);
  if (formacja) p.set('formacja', formacja);

  if (f.sort !== 'nazwisko') p.set('sort', f.sort);
  if (f.dir !== 'asc') p.set('dir', f.dir);
  if (f.strona !== 1) p.set('page', String(f.strona));
  return p;
}

/** Sorting and paging are not filters — the counter suffix must not react to them. */
export function czyAktywne(f: FiltryDoUrl): boolean {
  return (
    f.q !== '' ||
    f.rejon !== null ||
    f.parafia !== null ||
    f.krag !== null ||
    f.formacja.rodzaj !== 'dowolna'
  );
}
