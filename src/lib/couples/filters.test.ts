import { describe, expect, it } from 'vitest';
import {
  FORMATION_OPTIONS, SORT_KEYS, hasActiveFilter, parseFilters, toSearchParams,
} from './filters';

describe('FORMATION_OPTIONS', () => {
  // The acceptance checklist counts these: 1 + 7 + 7 + 1 + 1.
  it('offers exactly seventeen options', () => {
    expect(FORMATION_OPTIONS).toHaveLength(17);
  });

  it('starts with the neutral option and ends with the two special ones', () => {
    expect(FORMATION_OPTIONS[0]).toEqual({ value: 'any', label: 'Formacja — dowolna' });
    expect(FORMATION_OPTIONS.at(-2)).toEqual({ value: 'INNE', label: 'Ma inne rekolekcje' });
    expect(FORMATION_OPTIONS.at(-1)).toEqual({ value: 'none', label: 'Bez żadnych rekolekcji' });
  });

  it('has a value that parseFilters accepts for every option', () => {
    for (const option of FORMATION_OPTIONS) {
      expect(() => parseFilters({ formation: option.value })).not.toThrow();
    }
  });
});

describe('parseFilters', () => {
  it('falls back to defaults on empty input', () => {
    expect(parseFilters({})).toEqual({
      q: '', region: null, parish: null, circle: null,
      formation: { kind: 'any' },
      sort: 'surname', dir: 'asc', page: 1, deleted: false,
    });
  });

  // The bin is admin-only, but parsing does not decide that; listScope does.
  it('reads the request to see deleted records', () => {
    expect(parseFilters({ deleted: '1' }).deleted).toBe(true);
    expect(parseFilters({ deleted: 'tak' }).deleted).toBe(false);
  });

  it('reads every filter from the query string', () => {
    const f = parseFilters({
      q: 'kowal', region: '7', parish: '3', circle: '9',
      formation: 'ONZ_II', sort: 'email', dir: 'desc', page: '4',
    });
    expect(f.q).toBe('kowal');
    expect(f.region).toBe(7);
    expect(f.parish).toBe(3n);
    expect(f.circle).toBe(9n);
    expect(f.formation).toEqual({ kind: 'has', degree: 'ONZ_II' });
    expect(f.sort).toBe('email');
    expect(f.dir).toBe('desc');
    expect(f.page).toBe(4);
  });

  it('parses the negated formation options', () => {
    expect(parseFilters({ formation: 'without:ORAR_I' }).formation)
      .toEqual({ kind: 'without', degree: 'ORAR_I' });
    expect(parseFilters({ formation: 'none' }).formation).toEqual({ kind: 'none' });
    expect(parseFilters({ formation: 'INNE' }).formation).toEqual({ kind: 'other' });
  });

  // Garbage in the URL must not 500 the page — a bookmarked or hand-edited
  // link is normal traffic.
  it('ignores values it does not recognise', () => {
    const f = parseFilters({
      region: 'ala-ma-kota', parish: '-1', formation: 'ONZ_XVII',
      sort: 'formation', dir: 'sideways', page: '0',
    });
    expect(f.region).toBeNull();
    expect(f.parish).toBeNull();
    expect(f.formation).toEqual({ kind: 'any' });
    expect(f.sort).toBe('surname');
    expect(f.dir).toBe('asc');
    expect(f.page).toBe(1);
  });

  it('rejects a region number outside the range', () => {
    expect(parseFilters({ region: '99' }).region).toBeNull();
  });

  it('takes the first value when a parameter repeats', () => {
    expect(parseFilters({ region: ['3', '7'] }).region).toBe(3);
  });
});

describe('toSearchParams', () => {
  it('round-trips through the query string', () => {
    const f = parseFilters({
      q: 'nowak', region: '2', formation: 'without:ORD', sort: 'circle', dir: 'desc',
    });
    expect(parseFilters(Object.fromEntries(toSearchParams(f)))).toEqual(f);
  });

  it('omits defaults so a clean list has a clean URL', () => {
    expect(toSearchParams(parseFilters({})).toString()).toBe('');
  });
});

describe('hasActiveFilter', () => {
  it('is false for defaults and true for any filter', () => {
    expect(hasActiveFilter(parseFilters({}))).toBe(false);
    expect(hasActiveFilter(parseFilters({ q: 'a' }))).toBe(true);
    expect(hasActiveFilter(parseFilters({ region: '3' }))).toBe(true);
    expect(hasActiveFilter(parseFilters({ formation: 'none' }))).toBe(true);
  });

  it('does not count sorting or paging as a filter', () => {
    expect(hasActiveFilter(parseFilters({ sort: 'email', dir: 'desc', page: '3' }))).toBe(false);
  });
});

describe('SORT_KEYS', () => {
  it('covers seven columns and excludes formation', () => {
    expect(SORT_KEYS).toHaveLength(7);
    expect(SORT_KEYS).not.toContain('formation');
  });
});
