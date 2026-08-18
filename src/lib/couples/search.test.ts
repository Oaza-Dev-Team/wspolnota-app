import { describe, expect, it } from 'vitest';
import { withoutDiacritics } from './search';

describe('withoutDiacritics', () => {
  it('strips Polish diacritics and lowercases', () => {
    expect(withoutDiacritics('Bagińscy')).toBe('baginscy');
    expect(withoutDiacritics('ŻÓŁĆ')).toBe('zolc');
  });

  it('handles every Polish diacritic', () => {
    expect(withoutDiacritics('ąćęłńóśźż')).toBe('acelnoszz');
  });

  it('leaves plain text alone', () => {
    expect(withoutDiacritics('Kowalscy')).toBe('kowalscy');
  });

  it('handles the empty string', () => {
    expect(withoutDiacritics('')).toBe('');
  });
});
