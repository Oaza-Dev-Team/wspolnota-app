import { describe, expect, it } from 'vitest';
import { formatDaty, formatTelefonu } from './formaty';

describe('formatDaty', () => {
  it('formats as dd.MM.yyyy HH:mm', () => {
    expect(formatDaty(new Date('2026-08-13T21:12:00'))).toBe('13.08.2026 21:12');
  });

  it('pads single-digit days and months', () => {
    expect(formatDaty(new Date('2026-01-05T09:07:00'))).toBe('05.01.2026 09:07');
  });
});

describe('formatTelefonu', () => {
  it('groups nine digits after the country code', () => {
    expect(formatTelefonu('+48746854282')).toBe('+48 746 854 282');
  });

  it('adds the country code when missing', () => {
    expect(formatTelefonu('746854282')).toBe('+48 746 854 282');
  });

  it('leaves unrecognised input untouched', () => {
    expect(formatTelefonu('wew. 12')).toBe('wew. 12');
  });
});
