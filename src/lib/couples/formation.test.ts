import { describe, expect, it } from 'vitest';
import { formationBadge } from './formation';

describe('formationBadge', () => {
  it('shows an em dash when there are no entries', () => {
    expect(formationBadge([])).toEqual({ text: '—', hasRetreats: false });
  });

  it('shows the highest degree alone when it is the only one', () => {
    expect(formationBadge(['ONZ_I'])).toEqual({ text: 'ONŻ I', hasRetreats: true });
  });

  it('appends the count of the remaining degrees', () => {
    // ORAR II is the furthest along; four other degrees are present.
    expect(formationBadge(['ONZ_I', 'ONZ_II', 'ONZ_III', 'ORAR_I', 'ORAR_II']))
      .toEqual({ text: 'ORAR II +4', hasRetreats: true });
  });

  it('ignores gaps when counting', () => {
    expect(formationBadge(['ONZ_I', 'ORAR_I']).text).toBe('ORAR I +1');
  });

  it('counts INNE as having entries but never as the highest degree', () => {
    expect(formationBadge(['INNE'])).toEqual({ text: 'Inne', hasRetreats: true });
    expect(formationBadge(['ONZ_I', 'INNE']).text).toBe('ONŻ I');
  });

  it('ignores duplicate entries of the same degree', () => {
    expect(formationBadge(['ONZ_I', 'ONZ_I']).text).toBe('ONŻ I');
  });
});
