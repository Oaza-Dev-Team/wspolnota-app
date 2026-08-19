import type { RetreatKind } from '@/generated/prisma/enums';
import { REGION_COUNT } from '@/lib/domain/regions';
import { DEGREES, retreatInfo } from '@/lib/domain/retreats';

export const PAGE_SIZE = 50;

export type FormationFilter =
  | { kind: 'any' }
  | { kind: 'has'; degree: RetreatKind }
  | { kind: 'without'; degree: RetreatKind }
  | { kind: 'other' }
  | { kind: 'none' };

export type SortKey =
  | 'surname' | 'names' | 'email' | 'phone' | 'region' | 'parish' | 'circle';

// Seven sortable columns. Formation is deliberately absent: it is a computed
// badge, not a column the database can order by meaningfully.
export const SORT_KEYS: readonly SortKey[] = [
  'surname', 'names', 'email', 'phone', 'region', 'parish', 'circle',
];

export type Filters = {
  q: string;
  region: number | null;
  parish: bigint | null;
  circle: bigint | null;
  formation: FormationFilter;
  sort: SortKey;
  dir: 'asc' | 'desc';
  page: number;
  /** Show the soft-deleted records instead of the live ones. Admin only —
      listScope decides, this is merely the request. */
  deleted: boolean;
};

/**
 * Ids arrive as bigint on the server and as string in the client component —
 * bigint does not cross the server/client boundary. Both are accepted by the
 * serialiser so there is one of it rather than two that can drift apart.
 */
export type FiltersForUrl = Omit<Filters, 'parish' | 'circle'> & {
  parish: bigint | string | null;
  circle: bigint | string | null;
};

export type ClientFilters = Omit<Filters, 'parish' | 'circle'> & {
  parish: string | null;
  circle: string | null;
};

// Labels are what the user reads, so they stay Polish; the values are query
// string plumbing and follow the rest of the code into English.
export const FORMATION_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'any', label: 'Formacja — dowolna' },
  ...DEGREES.map((d) => ({ value: d, label: `Ma ${retreatInfo(d).code}` })),
  ...DEGREES.map((d) => ({ value: `without:${d}`, label: `Bez ${retreatInfo(d).genitive}` })),
  { value: 'INNE', label: 'Ma inne rekolekcje' },
  { value: 'none', label: 'Bez żadnych rekolekcji' },
];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function integer(v: string | string[] | undefined, min: number, max: number): number | null {
  const s = first(v);
  if (s === undefined) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function positiveBigint(v: string | string[] | undefined): bigint | null {
  const s = first(v);
  if (s === undefined || !/^\d+$/.test(s)) return null;
  const n = BigInt(s);
  return n > 0n ? n : null;
}

function parseFormation(v: string | string[] | undefined): FormationFilter {
  const s = first(v);
  if (!s || s === 'any') return { kind: 'any' };
  if (s === 'none') return { kind: 'none' };
  if (s === 'INNE') return { kind: 'other' };

  const negated = s.startsWith('without:');
  const code = negated ? s.slice(8) : s;
  const degree = DEGREES.find((d) => d === code);
  if (!degree) return { kind: 'any' };
  return negated ? { kind: 'without', degree } : { kind: 'has', degree };
}

/**
 * Never throws. A hand-edited or stale bookmark is ordinary traffic, and an
 * unrecognised value must degrade to the default rather than 500 the page.
 */
export function parseFilters(params: Record<string, string | string[] | undefined>): Filters {
  const sortCandidate = first(params['sort']);
  const sort = SORT_KEYS.find((k) => k === sortCandidate) ?? 'surname';

  return {
    q: (first(params['q']) ?? '').trim(),
    region: integer(params['region'], 1, REGION_COUNT),
    parish: positiveBigint(params['parish']),
    circle: positiveBigint(params['circle']),
    formation: parseFormation(params['formation']),
    sort,
    dir: first(params['dir']) === 'desc' ? 'desc' : 'asc',
    page: integer(params['page'], 1, 10_000) ?? 1,
    deleted: first(params['deleted']) === '1',
  };
}

function formationToText(f: FormationFilter): string | null {
  switch (f.kind) {
    case 'any': return null;
    case 'has': return f.degree;
    case 'without': return `without:${f.degree}`;
    case 'other': return 'INNE';
    case 'none': return 'none';
  }
}

/** Emits only non-default values, so an unfiltered list has a bare URL. */
export function toSearchParams(f: FiltersForUrl): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.region !== null) p.set('region', String(f.region));
  if (f.parish !== null) p.set('parish', String(f.parish));
  if (f.circle !== null) p.set('circle', String(f.circle));

  const formation = formationToText(f.formation);
  if (formation) p.set('formation', formation);

  if (f.sort !== 'surname') p.set('sort', f.sort);
  if (f.dir !== 'asc') p.set('dir', f.dir);
  if (f.page !== 1) p.set('page', String(f.page));
  if (f.deleted) p.set('deleted', '1');
  return p;
}

/** Sorting and paging are not filters — the counter suffix must not react to them. */
export function hasActiveFilter(f: FiltersForUrl): boolean {
  return (
    f.q !== '' ||
    f.region !== null ||
    f.parish !== null ||
    f.circle !== null ||
    f.formation.kind !== 'any'
  );
}
