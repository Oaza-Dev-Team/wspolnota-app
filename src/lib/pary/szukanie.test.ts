import { describe, expect, it } from 'vitest';
import { bezOgonkow } from './szukanie';

describe('bezOgonkow', () => {
  it('strips Polish diacritics and lowercases', () => {
    expect(bezOgonkow('Bagińscy')).toBe('baginscy');
    expect(bezOgonkow('ŻÓŁĆ')).toBe('zolc');
  });

  it('handles every Polish diacritic', () => {
    expect(bezOgonkow('ąćęłńóśźż')).toBe('acelnoszz');
  });

  it('leaves plain text alone', () => {
    expect(bezOgonkow('Kowalscy')).toBe('kowalscy');
  });

  it('handles the empty string', () => {
    expect(bezOgonkow('')).toBe('');
  });
});
