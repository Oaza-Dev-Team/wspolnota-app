import type { Prisma } from '@/generated/prisma/client';
import type { RetreatKind } from '@/generated/prisma/enums';
import { type User, listScope } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { type Filters, PAGE_SIZE } from './filters';
import { withoutDiacritics } from './search';

export type CoupleRow = {
  id: bigint;
  surname: string;
  wifeName: string;
  husbandName: string;
  email: string | null;
  phone: string | null;
  regionId: number;
  parish: string | null;
  circle: string | null;
  kinds: RetreatKind[];
};

/**
 * A couple's parish is its own when set, otherwise its circle's (spec 4.2).
 * Filtering on couple.parish_id alone would drop every couple that simply
 * inherits its circle's parish — which is most of them.
 */
function parishCondition(parishId: bigint): Prisma.CoupleWhereInput {
  return {
    OR: [
      { parishId },
      { parishId: null, circle: { parishId } },
    ],
  };
}

function formationCondition(f: Filters['formation']): Prisma.CoupleWhereInput {
  switch (f.kind) {
    case 'any': return {};
    case 'has': return { retreats: { some: { kind: f.degree } } };
    case 'without': return { retreats: { none: { kind: f.degree } } };
    case 'other': return { retreats: { some: { kind: 'INNE' } } };
    case 'none': return { retreats: { none: {} } };
  }
}

function searchCondition(q: string): Prisma.CoupleWhereInput {
  if (!q) return {};
  // Compared against the generated `search_text` columns, which Postgres keeps
  // lower-cased and unaccented. Plain `contains` suffices: both sides of the
  // comparison have already been normalised the same way.
  const contains = { contains: withoutDiacritics(q) };
  return {
    OR: [
      { searchText: contains },
      { parish: { searchText: contains } },
      { circle: { searchText: contains } },
      // A couple with no parish of its own is searchable through its circle's.
      { parishId: null, circle: { parish: { searchText: contains } } },
    ],
  };
}

/**
 * Shared with the export so the list and the file narrow identically. Two
 * definitions of scope is exactly the class of bug this project avoids.
 */
export function whereForExport(u: User, f: Filters): Prisma.CoupleWhereInput {
  const conditions: Prisma.CoupleWhereInput[] = [
    // Always first and never optional: this is what keeps a region account
    // inside its region and soft-deleted couples out of every list.
    listScope(u, { deleted: f.deleted }),
    searchCondition(f.q),
    formationCondition(f.formation),
  ];

  // A region account's own scope already pins the region; an explicit filter
  // may only narrow further, never widen — the AND guarantees that.
  if (f.region !== null) conditions.push({ regionId: f.region });
  if (f.parish !== null) conditions.push(parishCondition(f.parish));
  if (f.circle !== null) conditions.push({ circleId: f.circle });

  return { AND: conditions };
}

function orderBy(f: Filters): Prisma.CoupleOrderByWithRelationInput[] {
  const dir = f.dir;
  switch (f.sort) {
    case 'names': return [{ wifeName: dir }, { surname: 'asc' }];
    case 'email': return [{ email: dir }, { surname: 'asc' }];
    case 'phone': return [{ phone: dir }, { surname: 'asc' }];
    case 'region': return [{ regionId: dir }, { surname: 'asc' }];
    case 'parish': return [{ parish: { name: dir } }, { surname: 'asc' }];
    case 'circle': return [{ circle: { number: dir } }, { surname: 'asc' }];
    case 'surname':
    default: return [{ surname: dir }, { wifeName: 'asc' }];
  }
}

function circleLabel(number: number, patron: string | null): string {
  return patron ? `${number} · ${patron}` : String(number);
}

export async function queryCouples(
  u: User,
  f: Filters,
): Promise<{ rows: CoupleRow[]; found: number; total: number }> {
  const condition = whereForExport(u, f);

  const [records, found, total] = await Promise.all([
    prisma.couple.findMany({
      where: condition,
      orderBy: orderBy(f),
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, surname: true, wifeName: true, husbandName: true,
        email: true, phone: true, regionId: true,
        parish: { select: { name: true, city: true } },
        circle: {
          select: {
            number: true, patron: true,
            parish: { select: { name: true, city: true } },
          },
        },
        retreats: { select: { kind: true } },
      },
    }),
    prisma.couple.count({ where: condition }),
    prisma.couple.count({ where: listScope(u, { deleted: f.deleted }) }),
  ]);

  const rows: CoupleRow[] = records.map((r) => {
    const parish = r.parish ?? r.circle?.parish ?? null;
    return {
      id: r.id,
      surname: r.surname,
      wifeName: r.wifeName,
      husbandName: r.husbandName,
      email: r.email,
      phone: r.phone,
      regionId: r.regionId,
      parish: parish ? `${parish.name}, ${parish.city}` : null,
      circle: r.circle ? circleLabel(r.circle.number, r.circle.patron) : null,
      kinds: r.retreats.map((x) => x.kind),
    };
  });

  return { rows, found, total };
}

/**
 * Options for the cascading selects. Both lists are derived from the couples
 * the user may actually see, so a region account never learns which parishes
 * exist elsewhere.
 */
export async function filterOptions(
  u: User,
  f: Filters,
): Promise<{
  parishes: { id: bigint; label: string }[];
  circles: { id: bigint; label: string }[];
}> {
  const scope: Prisma.CoupleWhereInput = {
    AND: [listScope(u, { deleted: f.deleted }), f.region !== null ? { regionId: f.region } : {}],
  };

  const couples = await prisma.couple.findMany({
    where: scope,
    select: {
      parish: { select: { id: true, name: true, city: true } },
      circle: {
        select: {
          id: true, number: true, patron: true,
          parish: { select: { id: true, name: true, city: true } },
        },
      },
    },
  });

  const parishes = new Map<string, { id: bigint; label: string }>();
  const circles = new Map<string, { id: bigint; label: string }>();

  for (const c of couples) {
    const parish = c.parish ?? c.circle?.parish ?? null;
    if (parish) {
      parishes.set(String(parish.id), {
        id: parish.id,
        label: `${parish.name}, ${parish.city}`,
      });
    }
    // Circles are narrowed by the chosen parish as well as the region.
    if (c.circle && (f.parish === null || parish?.id === f.parish)) {
      circles.set(String(c.circle.id), {
        id: c.circle.id,
        label: `Krąg ${circleLabel(c.circle.number, c.circle.patron)}`,
      });
    }
  }

  const byLabel = (a: { label: string }, b: { label: string }) =>
    a.label.localeCompare(b.label, 'pl', { numeric: true });

  return {
    parishes: [...parishes.values()].sort(byLabel),
    circles: [...circles.values()].sort(byLabel),
  };
}
