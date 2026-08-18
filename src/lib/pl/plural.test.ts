import { describe, expect, it } from 'vitest';
import { CIRCLES, COUPLES, PARISHES, REGIONS_IN, plural } from './plural';

describe('plural', () => {
  it('uses the singular form for exactly one', () => {
    expect(plural(1, COUPLES)).toBe('1 para');
  });

  it('uses the plural form for 2-4', () => {
    expect(plural(2, COUPLES)).toBe('2 pary');
    expect(plural(3, COUPLES)).toBe('3 pary');
    expect(plural(4, COUPLES)).toBe('4 pary');
  });

  it('uses the genitive form for 0 and 5-21', () => {
    expect(plural(0, COUPLES)).toBe('0 par');
    expect(plural(5, COUPLES)).toBe('5 par');
    expect(plural(11, COUPLES)).toBe('11 par');
    expect(plural(21, COUPLES)).toBe('21 par');
  });

  it('keeps the genitive form for the 12-14 exception', () => {
    expect(plural(12, COUPLES)).toBe('12 par');
    expect(plural(13, COUPLES)).toBe('13 par');
    expect(plural(14, COUPLES)).toBe('14 par');
    expect(plural(112, COUPLES)).toBe('112 par');
  });

  it('returns to the plural form above the exception', () => {
    expect(plural(22, COUPLES)).toBe('22 pary');
    expect(plural(102, COUPLES)).toBe('102 pary');
  });

  it('inflects regions in the locative used by the list subtitle', () => {
    expect(plural(1, REGIONS_IN)).toBe('1 rejonie');
    expect(plural(11, REGIONS_IN)).toBe('11 rejonach');
  });

  it('inflects circles and parishes', () => {
    expect(plural(1, CIRCLES)).toBe('1 krąg');
    expect(plural(2, CIRCLES)).toBe('2 kręgi');
    expect(plural(5, CIRCLES)).toBe('5 kręgów');
    expect(plural(1, PARISHES)).toBe('1 parafia');
    expect(plural(4, PARISHES)).toBe('4 parafie');
    expect(plural(6, PARISHES)).toBe('6 parafii');
  });
});
