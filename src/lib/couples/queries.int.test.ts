import { afterAll, describe, expect, it } from 'vitest';
import type { User } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { FORMATION_OPTIONS, parseFilters } from './filters';
import { filterOptions, queryCouples } from './queries';

const admin: User = { id: 1n, role: 'admin', regionId: null };
const regionIII: User = { id: 2n, role: 'region', regionId: 3 };
const viewer: User = { id: 3n, role: 'viewer', regionId: null };

afterAll(async () => {
  await prisma.$disconnect();
});

describe('queryCouples — scope', () => {
  it('gives admin the whole community', async () => {
    expect((await queryCouples(admin, parseFilters({}))).total).toBe(300);
  });

  it('narrows a region account to its own region', async () => {
    const { rows, total } = await queryCouples(regionIII, parseFilters({}));
    expect(total).toBeLessThan(300);
    expect(total).toBeGreaterThan(0);
    expect(rows.every((r) => r.regionId === 3)).toBe(true);
  });

  // Scope must not be overridable through the query string.
  it('ignores a region filter pointing outside the account scope', async () => {
    const { rows } = await queryCouples(regionIII, parseFilters({ region: '7' }));
    expect(rows.every((r) => r.regionId === 3)).toBe(true);
  });

  it('lets the viewer read the whole community', async () => {
    expect((await queryCouples(viewer, parseFilters({}))).total).toBe(300);
  });
});

describe('queryCouples — search', () => {
  it('matches on surname regardless of case', async () => {
    const { rows } = await queryCouples(admin, parseFilters({ q: 'KOWALSCY' }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.surname.toLowerCase().includes('kowalscy'))).toBe(true);
  });

  it('matches without Polish diacritics', async () => {
    const withMarks = await queryCouples(admin, parseFilters({ q: 'Bagińscy' }));
    const withoutMarks = await queryCouples(admin, parseFilters({ q: 'baginscy' }));
    expect(withoutMarks.found).toBe(withMarks.found);
    expect(withoutMarks.found).toBeGreaterThan(0);
  });

  it('searches first names, e-mail and phone too', async () => {
    for (const q of ['anna', '@example.pl', '+48']) {
      const { found } = await queryCouples(admin, parseFilters({ q }));
      expect(found, `nothing found for ${q}`).toBeGreaterThan(0);
    }
  });

  it('searches the parish and the circle patron', async () => {
    for (const q of ['Gdańsk', 'św.']) {
      const { found } = await queryCouples(admin, parseFilters({ q }));
      expect(found, `nothing found for ${q}`).toBeGreaterThan(0);
    }
  });
});

describe('queryCouples — formation filter', () => {
  it('returns a non-empty result for every one of the seventeen options', async () => {
    for (const option of FORMATION_OPTIONS) {
      const { found } = await queryCouples(admin, parseFilters({ formation: option.value }));
      expect(found, `empty for ${option.value}`).toBeGreaterThan(0);
    }
  });

  it('has and without partition the community', async () => {
    const has = await queryCouples(admin, parseFilters({ formation: 'ORAR_I' }));
    const without = await queryCouples(admin, parseFilters({ formation: 'without:ORAR_I' }));
    expect(has.found + without.found).toBe(300);
  });
});

describe('queryCouples — effective parish', () => {
  // A couple with its own parish_id must be found by that parish, and a couple
  // without one must be found by its circle's parish. Filtering on
  // couple.parish_id alone would silently drop the majority.
  it('finds couples through both their own and their circle parish', async () => {
    const own = await prisma.couple.findFirstOrThrow({
      where: { parishId: { not: null } },
      select: { parishId: true },
    });
    const viaOwn = await queryCouples(admin, parseFilters({ parish: String(own.parishId) }));
    expect(viaOwn.found).toBeGreaterThan(0);

    const inherited = await prisma.couple.findFirstOrThrow({
      where: { parishId: null, circleId: { not: null } },
      select: { circle: { select: { parishId: true } } },
    });
    const viaCircle = await queryCouples(
      admin,
      parseFilters({ parish: String(inherited.circle!.parishId) }),
    );
    expect(viaCircle.found).toBeGreaterThan(0);
  });
});

describe('queryCouples — sorting and paging', () => {
  it('sorts by surname using Polish collation by default', async () => {
    const { rows } = await queryCouples(admin, parseFilters({}));
    const surnames = rows.map((r) => r.surname);
    expect([...surnames].sort((a, b) => a.localeCompare(b, 'pl'))).toEqual(surnames);
  });

  it('reverses on dir=desc', async () => {
    const asc = await queryCouples(admin, parseFilters({}));
    const desc = await queryCouples(admin, parseFilters({ dir: 'desc' }));
    expect(desc.rows[0]!.surname).not.toBe(asc.rows[0]!.surname);
  });

  it('pages fifty at a time without overlapping', async () => {
    const firstPage = await queryCouples(admin, parseFilters({}));
    const secondPage = await queryCouples(admin, parseFilters({ page: '2' }));
    expect(firstPage.rows).toHaveLength(50);
    const seen = new Set(firstPage.rows.map((r) => String(r.id)));
    expect(secondPage.rows.some((r) => seen.has(String(r.id)))).toBe(false);
  });

  it('returns an empty page rather than failing past the end', async () => {
    const { rows, found } = await queryCouples(admin, parseFilters({ page: '999' }));
    expect(rows).toHaveLength(0);
    expect(found).toBe(300);
  });
});

describe('filterOptions', () => {
  it('narrows parishes to the chosen region', async () => {
    const all = await filterOptions(admin, parseFilters({}));
    const inRegion = await filterOptions(admin, parseFilters({ region: '3' }));
    expect(inRegion.parishes.length).toBeGreaterThan(0);
    expect(inRegion.parishes.length).toBeLessThan(all.parishes.length);
  });

  it('narrows circles to the chosen region', async () => {
    const inRegion = await filterOptions(admin, parseFilters({ region: '3' }));
    expect(inRegion.circles.length).toBeGreaterThan(0);
    expect(inRegion.circles.every((c) => c.label.startsWith('Krąg '))).toBe(true);
  });

  it('offers a region account only its own region options', async () => {
    const { parishes } = await filterOptions(regionIII, parseFilters({}));
    const adminInRegion = await filterOptions(admin, parseFilters({ region: '3' }));
    expect(parishes.length).toBe(adminInRegion.parishes.length);
  });
});
