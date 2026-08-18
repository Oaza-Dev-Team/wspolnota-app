import { describe, expect, it } from 'vitest';
import { LICZBA_REJONOW, ROMAN, kolorRejonu, numerRzymski } from './rejony';

describe('numerRzymski', () => {
  it('maps region numbers to Roman numerals', () => {
    expect(numerRzymski(1)).toBe('I');
    expect(numerRzymski(4)).toBe('IV');
    expect(numerRzymski(11)).toBe('XI');
  });

  it('rejects numbers outside the range', () => {
    expect(() => numerRzymski(0)).toThrow();
    expect(() => numerRzymski(LICZBA_REJONOW + 1)).toThrow();
  });

  // The community has eleven regions, not the twelve the design handoff
  // describes; see the spec for the discrepancy.
  it('covers exactly eleven regions', () => {
    expect(ROMAN).toHaveLength(11);
    expect(LICZBA_REJONOW).toBe(11);
  });
});

describe('kolorRejonu', () => {
  it('returns the palette colour for a region', () => {
    expect(kolorRejonu(1)).toBe('var(--rejon-1)');
    expect(kolorRejonu(LICZBA_REJONOW)).toBe('var(--rejon-11)');
  });

  it('rejects numbers outside the range', () => {
    expect(() => kolorRejonu(LICZBA_REJONOW + 1)).toThrow();
  });
});
