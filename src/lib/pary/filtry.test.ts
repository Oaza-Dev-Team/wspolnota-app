import { describe, expect, it } from 'vitest';
import {
  KLUCZE_SORTOWANIA, OPCJE_FORMACJI, czyAktywne, doSearchParams, parseFiltry,
} from './filtry';

describe('OPCJE_FORMACJI', () => {
  // The acceptance checklist counts these: 1 + 7 + 7 + 1 + 1.
  it('offers exactly seventeen options', () => {
    expect(OPCJE_FORMACJI).toHaveLength(17);
  });

  it('starts with the neutral option and ends with the two special ones', () => {
    expect(OPCJE_FORMACJI[0]).toEqual({ wartosc: 'all', etykieta: 'Formacja — dowolna' });
    expect(OPCJE_FORMACJI.at(-2)).toEqual({ wartosc: 'INNE', etykieta: 'Ma inne rekolekcje' });
    expect(OPCJE_FORMACJI.at(-1)).toEqual({ wartosc: 'brak', etykieta: 'Bez żadnych rekolekcji' });
  });

  it('has a value that parseFiltry accepts for every option', () => {
    for (const opcja of OPCJE_FORMACJI) {
      expect(() => parseFiltry({ formacja: opcja.wartosc })).not.toThrow();
    }
  });
});

describe('parseFiltry', () => {
  it('falls back to defaults on empty input', () => {
    expect(parseFiltry({})).toEqual({
      q: '', rejon: null, parafia: null, krag: null,
      formacja: { rodzaj: 'dowolna' },
      sort: 'nazwisko', dir: 'asc', strona: 1,
    });
  });

  it('reads every filter from the query string', () => {
    const f = parseFiltry({
      q: 'kowal', rejon: '7', parafia: '3', krag: '9',
      formacja: 'ONZ_II', sort: 'email', dir: 'desc', page: '4',
    });
    expect(f.q).toBe('kowal');
    expect(f.rejon).toBe(7);
    expect(f.parafia).toBe(3n);
    expect(f.krag).toBe(9n);
    expect(f.formacja).toEqual({ rodzaj: 'ma', stopien: 'ONZ_II' });
    expect(f.sort).toBe('email');
    expect(f.dir).toBe('desc');
    expect(f.strona).toBe(4);
  });

  it('parses the negated formation options', () => {
    expect(parseFiltry({ formacja: 'bez:ORAR_I' }).formacja)
      .toEqual({ rodzaj: 'bez', stopien: 'ORAR_I' });
    expect(parseFiltry({ formacja: 'brak' }).formacja).toEqual({ rodzaj: 'brak' });
    expect(parseFiltry({ formacja: 'INNE' }).formacja).toEqual({ rodzaj: 'inne' });
  });

  // Garbage in the URL must not 500 the page — a bookmarked or hand-edited
  // link is normal traffic.
  it('ignores values it does not recognise', () => {
    const f = parseFiltry({
      rejon: 'ala-ma-kota', parafia: '-1', formacja: 'ONZ_XVII',
      sort: 'formacja', dir: 'sideways', page: '0',
    });
    expect(f.rejon).toBeNull();
    expect(f.parafia).toBeNull();
    expect(f.formacja).toEqual({ rodzaj: 'dowolna' });
    expect(f.sort).toBe('nazwisko');
    expect(f.dir).toBe('asc');
    expect(f.strona).toBe(1);
  });

  it('rejects a region number outside the range', () => {
    expect(parseFiltry({ rejon: '99' }).rejon).toBeNull();
  });

  it('takes the first value when a parameter repeats', () => {
    expect(parseFiltry({ rejon: ['3', '7'] }).rejon).toBe(3);
  });
});

describe('doSearchParams', () => {
  it('round-trips through the query string', () => {
    const f = parseFiltry({ q: 'nowak', rejon: '2', formacja: 'bez:ORD', sort: 'krag', dir: 'desc' });
    expect(parseFiltry(Object.fromEntries(doSearchParams(f)))).toEqual(f);
  });

  it('omits defaults so a clean list has a clean URL', () => {
    expect(doSearchParams(parseFiltry({})).toString()).toBe('');
  });
});

describe('czyAktywne', () => {
  it('is false for defaults and true for any filter', () => {
    expect(czyAktywne(parseFiltry({}))).toBe(false);
    expect(czyAktywne(parseFiltry({ q: 'a' }))).toBe(true);
    expect(czyAktywne(parseFiltry({ rejon: '3' }))).toBe(true);
    expect(czyAktywne(parseFiltry({ formacja: 'brak' }))).toBe(true);
  });

  it('does not count sorting or paging as a filter', () => {
    expect(czyAktywne(parseFiltry({ sort: 'email', dir: 'desc', page: '3' }))).toBe(false);
  });
});

describe('KLUCZE_SORTOWANIA', () => {
  it('covers seven columns and excludes formation', () => {
    expect(KLUCZE_SORTOWANIA).toHaveLength(7);
    expect(KLUCZE_SORTOWANIA).not.toContain('formacja');
  });
});
