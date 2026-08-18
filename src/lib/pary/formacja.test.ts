import { describe, expect, it } from 'vitest';
import { opisFormacji } from './formacja';

describe('opisFormacji', () => {
  it('shows an em dash when there are no entries', () => {
    expect(opisFormacji([])).toEqual({ tekst: '—', maRekolekcje: false });
  });

  it('shows the highest degree alone when it is the only one', () => {
    expect(opisFormacji(['ONZ_I'])).toEqual({ tekst: 'ONŻ I', maRekolekcje: true });
  });

  it('appends the count of the remaining degrees', () => {
    // ORAR II is the furthest along; four other degrees are present.
    expect(opisFormacji(['ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II']))
      .toEqual({ tekst: 'ORAR II +4', maRekolekcje: true });
  });

  it('ignores gaps when counting', () => {
    expect(opisFormacji(['ONZ_I', 'ORAR_I']).tekst).toBe('ORAR I +1');
  });

  it('counts INNE as having entries but never as the highest degree', () => {
    expect(opisFormacji(['INNE'])).toEqual({ tekst: 'Inne', maRekolekcje: true });
    expect(opisFormacji(['ONZ_I', 'INNE']).tekst).toBe('ONŻ I');
  });

  it('ignores duplicate entries of the same degree', () => {
    expect(opisFormacji(['ONZ_I', 'ONZ_I']).tekst).toBe('ONŻ I');
  });
});
