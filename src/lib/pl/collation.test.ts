import { describe, expect, it } from 'vitest';
import { comparePolish } from './collation';

describe('comparePolish', () => {
  it('places Ł between L and M, not after Z', () => {
    const surnames = ['Zawadzcy', 'Łabędzcy', 'Mazurowie', 'Lisowscy'];
    expect([...surnames].sort(comparePolish)).toEqual([
      'Lisowscy', 'Łabędzcy', 'Mazurowie', 'Zawadzcy',
    ]);
  });

  it('orders embedded numbers numerically, not as text', () => {
    const circles = ['Krąg 10', 'Krąg 2', 'Krąg 1'];
    expect([...circles].sort(comparePolish)).toEqual(['Krąg 1', 'Krąg 2', 'Krąg 10']);
  });

  it('ignores case', () => {
    expect(comparePolish('kowalscy', 'Kowalscy')).toBe(0);
  });
});
