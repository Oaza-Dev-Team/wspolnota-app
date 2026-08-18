import { describe, expect, it } from 'vitest';
import { KREGI, PARAFIE, PARY, REJONY, odmiana } from './odmiana';

describe('odmiana', () => {
  it('uses the singular form for exactly one', () => {
    expect(odmiana(1, PARY)).toBe('1 para');
  });

  it('uses the plural form for 2-4', () => {
    expect(odmiana(2, PARY)).toBe('2 pary');
    expect(odmiana(3, PARY)).toBe('3 pary');
    expect(odmiana(4, PARY)).toBe('4 pary');
  });

  it('uses the genitive form for 0 and 5-21', () => {
    expect(odmiana(0, PARY)).toBe('0 par');
    expect(odmiana(5, PARY)).toBe('5 par');
    expect(odmiana(11, PARY)).toBe('11 par');
    expect(odmiana(21, PARY)).toBe('21 par');
  });

  it('keeps the genitive form for the 12-14 exception', () => {
    expect(odmiana(12, PARY)).toBe('12 par');
    expect(odmiana(13, PARY)).toBe('13 par');
    expect(odmiana(14, PARY)).toBe('14 par');
    expect(odmiana(112, PARY)).toBe('112 par');
  });

  it('returns to the plural form above the exception', () => {
    expect(odmiana(22, PARY)).toBe('22 pary');
    expect(odmiana(102, PARY)).toBe('102 pary');
  });

  it('inflects regions in the locative used by the list subtitle', () => {
    expect(odmiana(1, REJONY)).toBe('1 rejonie');
    expect(odmiana(11, REJONY)).toBe('11 rejonach');
  });

  it('inflects circles and parishes', () => {
    expect(odmiana(1, KREGI)).toBe('1 krąg');
    expect(odmiana(2, KREGI)).toBe('2 kręgi');
    expect(odmiana(5, KREGI)).toBe('5 kręgów');
    expect(odmiana(1, PARAFIE)).toBe('1 parafia');
    expect(odmiana(4, PARAFIE)).toBe('4 parafie');
    expect(odmiana(6, PARAFIE)).toBe('6 parafii');
  });
});
