import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs typescript tests', () => {
    const value: string = 'kartoteka';
    expect(value).toHaveLength(9);
  });
});
