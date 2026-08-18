import { describe, expect, it } from 'vitest';
import { ROMAN, kolorRejonu, numerRzymski } from './rejony';

describe('numerRzymski', () => {
  it('maps region numbers to Roman numerals', () => {
    expect(numerRzymski(1)).toBe('I');
    expect(numerRzymski(4)).toBe('IV');
    expect(numerRzymski(12)).toBe('XII');
  });

  it('rejects numbers outside 1-12', () => {
    expect(() => numerRzymski(0)).toThrow();
    expect(() => numerRzymski(13)).toThrow();
  });

  it('covers exactly twelve regions', () => {
    expect(ROMAN).toHaveLength(12);
  });
});

describe('kolorRejonu', () => {
  it('returns the palette colour for a region', () => {
    expect(kolorRejonu(1)).toBe('var(--rejon-1)');
    expect(kolorRejonu(12)).toBe('var(--rejon-12)');
  });

  it('rejects numbers outside 1-12', () => {
    expect(() => kolorRejonu(13)).toThrow();
  });
});
