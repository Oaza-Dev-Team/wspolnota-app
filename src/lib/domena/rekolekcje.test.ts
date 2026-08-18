import { describe, expect, it } from 'vitest';
import {
  RODZAJE_REKOLEKCJI, STOPNIE, najwyzszyStopien, nastepnyStopien, opisRodzaju,
} from './rekolekcje';

describe('RODZAJE_REKOLEKCJI', () => {
  it('lists all eight kinds in formation-path order', () => {
    expect(RODZAJE_REKOLEKCJI.map((r) => r.rodzaj)).toEqual([
      'ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II', 'PILOTOWANIE', 'ORD', 'INNE',
    ]);
  });

  it('excludes INNE from the degree list', () => {
    expect(STOPNIE).toHaveLength(7);
    expect(STOPNIE).not.toContain('INNE');
  });

  it('maps an enum value to its UI code and full name', () => {
    expect(opisRodzaju('ORAR_II')).toEqual({
      rodzaj: 'ORAR_II',
      kod: 'ORAR II',
      nazwa: 'Oaza Rekolekcyjna Animatorów Rodzin II stopnia',
    });
  });
});

describe('najwyzszyStopien', () => {
  it('returns the furthest degree along the formation path', () => {
    expect(najwyzszyStopien(['ONZ_I', 'ORAR_I', 'ONZ_II'])).toBe('ORAR_I');
  });

  it('ignores INNE, which is not a degree', () => {
    expect(najwyzszyStopien(['ONZ_I', 'INNE'])).toBe('ONZ_I');
  });

  it('returns null when there is no degree at all', () => {
    expect(najwyzszyStopien([])).toBeNull();
    expect(najwyzszyStopien(['INNE'])).toBeNull();
  });
});

describe('nastepnyStopien', () => {
  it('suggests the first degree the couple is missing', () => {
    expect(nastepnyStopien([])).toBe('ONZ_I');
    expect(nastepnyStopien(['ONZ_I'])).toBe('ONZ_II');
    // Gaps are legitimate: suggest the earliest missing one, not the next one up.
    expect(nastepnyStopien(['ONZ_I', 'ONZ_III'])).toBe('ONZ_II');
  });

  it('falls back to INNE once every degree is present', () => {
    expect(nastepnyStopien([...STOPNIE])).toBe('INNE');
  });
});
