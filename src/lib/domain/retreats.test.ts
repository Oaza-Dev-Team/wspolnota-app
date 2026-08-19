import { describe, expect, it } from 'vitest';
import { DEGREES, RETREAT_KINDS, highestDegree, nextDegree, retreatInfo } from './retreats';

describe('RETREAT_KINDS', () => {
  it('lists all eight kinds in formation-path order', () => {
    expect(RETREAT_KINDS.map((r) => r.kind)).toEqual([
      'ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II', 'PILOTOWANIE', 'ORD', 'INNE',
    ]);
  });

  it('excludes INNE from the degree list', () => {
    expect(DEGREES).toHaveLength(7);
    expect(DEGREES).not.toContain('INNE');
  });

  it('maps an enum value to its UI code and full name', () => {
    expect(retreatInfo('ORAR_II')).toEqual({
      kind: 'ORAR_II',
      code: 'ORAR II',
      genitive: 'ORAR II',
      name: 'Oaza Rekolekcyjna Animatorów Rodzin II stopnia',
    });
  });
});

describe('highestDegree', () => {
  it('returns the furthest degree along the formation path', () => {
    expect(highestDegree(['ONZ_I', 'ORAR_I', 'ONZ_II'])).toBe('ORAR_I');
  });

  it('ignores INNE, which is not a degree', () => {
    expect(highestDegree(['ONZ_I', 'INNE'])).toBe('ONZ_I');
  });

  it('returns null when there is no degree at all', () => {
    expect(highestDegree([])).toBeNull();
    expect(highestDegree(['INNE'])).toBeNull();
  });
});

describe('nextDegree', () => {
  it('suggests the first degree the couple is missing', () => {
    expect(nextDegree([])).toBe('ONZ_I');
    expect(nextDegree(['ONZ_I'])).toBe('ONZ_II');
    // Gaps are legitimate: suggest the earliest missing one, not the next one up.
    expect(nextDegree(['ONZ_I', 'ONZ_III'])).toBe('ONZ_II');
  });

  it('falls back to INNE once every degree is present', () => {
    expect(nextDegree([...DEGREES])).toBe('INNE');
  });
});

describe('genitive forms', () => {
  // "Bez Pilotowanie" was shipping in the formation filter until this test.
  it('inflects the one code that is a Polish word', () => {
    expect(retreatInfo('PILOTOWANIE').genitive).toBe('pilotowania');
  });

  it('leaves abbreviations alone, because they do not inflect', () => {
    expect(retreatInfo('ONZ_I').genitive).toBe('ONŻ I');
    expect(retreatInfo('ORD').genitive).toBe('ORD');
  });
});
