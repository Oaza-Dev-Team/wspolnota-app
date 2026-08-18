import { describe, expect, it } from 'vitest';
import { porownajPl } from './sortowanie';

describe('porownajPl', () => {
  it('places Ł between L and M, not after Z', () => {
    const nazwiska = ['Zawadzcy', 'Łabędzcy', 'Mazurowie', 'Lisowscy'];
    expect([...nazwiska].sort(porownajPl)).toEqual([
      'Lisowscy', 'Łabędzcy', 'Mazurowie', 'Zawadzcy',
    ]);
  });

  it('orders embedded numbers numerically, not as text', () => {
    const kregi = ['Krąg 10', 'Krąg 2', 'Krąg 1'];
    expect([...kregi].sort(porownajPl)).toEqual(['Krąg 1', 'Krąg 2', 'Krąg 10']);
  });

  it('ignores case', () => {
    expect(porownajPl('kowalscy', 'Kowalscy')).toBe(0);
  });
});
