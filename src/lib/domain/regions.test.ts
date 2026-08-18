import { describe, expect, it } from 'vitest';
import { REGION_COUNT, ROMAN, regionColor, romanNumeral } from './regions';

describe('romanNumeral', () => {
  it('maps region numbers to Roman numerals', () => {
    expect(romanNumeral(1)).toBe('I');
    expect(romanNumeral(4)).toBe('IV');
    expect(romanNumeral(11)).toBe('XI');
  });

  it('rejects numbers outside the range', () => {
    expect(() => romanNumeral(0)).toThrow();
    expect(() => romanNumeral(REGION_COUNT + 1)).toThrow();
  });

  // The community has eleven regions, not the twelve the design handoff
  // originally described; see the spec for the discrepancy.
  it('covers exactly eleven regions', () => {
    expect(ROMAN).toHaveLength(11);
    expect(REGION_COUNT).toBe(11);
  });
});

describe('regionColor', () => {
  it('returns the palette colour for a region', () => {
    expect(regionColor(1)).toBe('var(--region-1)');
    expect(regionColor(REGION_COUNT)).toBe('var(--region-11)');
  });

  it('rejects numbers outside the range', () => {
    expect(() => regionColor(REGION_COUNT + 1)).toThrow();
  });
});
