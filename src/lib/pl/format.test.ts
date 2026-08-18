import { describe, expect, it } from 'vitest';
import { formatDate, formatPhone } from './format';

describe('formatDate', () => {
  it('formats as dd.MM.yyyy HH:mm', () => {
    expect(formatDate(new Date('2026-08-13T21:12:00'))).toBe('13.08.2026 21:12');
  });

  it('pads single-digit days and months', () => {
    expect(formatDate(new Date('2026-01-05T09:07:00'))).toBe('05.01.2026 09:07');
  });
});

describe('formatPhone', () => {
  it('groups nine digits after the country code', () => {
    expect(formatPhone('+48746854282')).toBe('+48 746 854 282');
  });

  it('adds the country code when missing', () => {
    expect(formatPhone('746854282')).toBe('+48 746 854 282');
  });

  it('leaves unrecognised input untouched', () => {
    expect(formatPhone('wew. 12')).toBe('wew. 12');
  });
});
