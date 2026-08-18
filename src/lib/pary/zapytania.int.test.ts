import { afterAll, describe, expect, it } from 'vitest';
import type { Uzytkownik } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { OPCJE_FORMACJI, parseFiltry } from './filtry';
import { opcjeFiltrow, queryPary } from './zapytania';

const admin: Uzytkownik = { id: 1n, rola: 'admin', rejonId: null };
const rejonIII: Uzytkownik = { id: 2n, rola: 'rejon', rejonId: 3 };
const moderator: Uzytkownik = { id: 3n, rola: 'podglad', rejonId: null };

afterAll(async () => {
  await prisma.$disconnect();
});

describe('queryPary — zakres', () => {
  it('gives admin the whole community', async () => {
    expect((await queryPary(admin, parseFiltry({}))).wszystkie).toBe(300);
  });

  it('narrows a region account to its own region', async () => {
    const { wiersze, wszystkie } = await queryPary(rejonIII, parseFiltry({}));
    expect(wszystkie).toBeLessThan(300);
    expect(wszystkie).toBeGreaterThan(0);
    expect(wiersze.every((w) => w.rejonId === 3)).toBe(true);
  });

  // Scope must not be overridable through the query string.
  it('ignores a region filter pointing outside the account scope', async () => {
    const { wiersze } = await queryPary(rejonIII, parseFiltry({ rejon: '7' }));
    expect(wiersze.every((w) => w.rejonId === 3)).toBe(true);
  });

  it('lets the viewer read the whole community', async () => {
    expect((await queryPary(moderator, parseFiltry({}))).wszystkie).toBe(300);
  });
});

describe('queryPary — szukanie', () => {
  it('matches on surname regardless of case', async () => {
    const { wiersze } = await queryPary(admin, parseFiltry({ q: 'KOWALSCY' }));
    expect(wiersze.length).toBeGreaterThan(0);
    expect(wiersze.every((w) => w.nazwisko.toLowerCase().includes('kowalscy'))).toBe(true);
  });

  it('matches without Polish diacritics', async () => {
    const zOgonkami = await queryPary(admin, parseFiltry({ q: 'Bagińscy' }));
    const bezOgonkow = await queryPary(admin, parseFiltry({ q: 'baginscy' }));
    expect(bezOgonkow.znalezione).toBe(zOgonkami.znalezione);
    expect(bezOgonkow.znalezione).toBeGreaterThan(0);
  });

  it('searches first names, e-mail and phone too', async () => {
    for (const q of ['anna', '@example.pl', '+48']) {
      const { znalezione } = await queryPary(admin, parseFiltry({ q }));
      expect(znalezione, `nothing found for ${q}`).toBeGreaterThan(0);
    }
  });

  it('searches the parish and the circle patron', async () => {
    for (const q of ['Gdańsk', 'św.']) {
      const { znalezione } = await queryPary(admin, parseFiltry({ q }));
      expect(znalezione, `nothing found for ${q}`).toBeGreaterThan(0);
    }
  });
});

describe('queryPary — filtr formacji', () => {
  it('returns a non-empty result for every one of the seventeen options', async () => {
    for (const opcja of OPCJE_FORMACJI) {
      const { znalezione } = await queryPary(admin, parseFiltry({ formacja: opcja.wartosc }));
      expect(znalezione, `empty for ${opcja.wartosc}`).toBeGreaterThan(0);
    }
  });

  it('"ma" and "bez" partition the community', async () => {
    const ma = await queryPary(admin, parseFiltry({ formacja: 'ORAR_I' }));
    const bez = await queryPary(admin, parseFiltry({ formacja: 'bez:ORAR_I' }));
    expect(ma.znalezione + bez.znalezione).toBe(300);
  });
});

describe('queryPary — parafia efektywna', () => {
  // A couple with its own parafia_id must be found by that parish, and a couple
  // without one must be found by its circle's parish. Filtering on
  // para.parafia_id alone would silently drop the majority.
  it('finds couples through both their own and their circle parish', async () => {
    const wlasna = await prisma.para.findFirstOrThrow({
      where: { parafiaId: { not: null } },
      select: { parafiaId: true },
    });
    const przezWlasna = await queryPary(admin, parseFiltry({ parafia: String(wlasna.parafiaId) }));
    expect(przezWlasna.znalezione).toBeGreaterThan(0);

    const zKregu = await prisma.para.findFirstOrThrow({
      where: { parafiaId: null, kragId: { not: null } },
      select: { krag: { select: { parafiaId: true } } },
    });
    const przezKrag = await queryPary(
      admin,
      parseFiltry({ parafia: String(zKregu.krag!.parafiaId) }),
    );
    expect(przezKrag.znalezione).toBeGreaterThan(0);
  });
});

describe('queryPary — sortowanie i paginacja', () => {
  it('sorts by surname using Polish collation by default', async () => {
    const { wiersze } = await queryPary(admin, parseFiltry({}));
    const nazwiska = wiersze.map((w) => w.nazwisko);
    expect([...nazwiska].sort((a, b) => a.localeCompare(b, 'pl'))).toEqual(nazwiska);
  });

  it('reverses on dir=desc', async () => {
    const rosnaco = await queryPary(admin, parseFiltry({}));
    const malejaco = await queryPary(admin, parseFiltry({ dir: 'desc' }));
    expect(malejaco.wiersze[0]!.nazwisko).not.toBe(rosnaco.wiersze[0]!.nazwisko);
  });

  it('pages fifty at a time without overlapping', async () => {
    const pierwsza = await queryPary(admin, parseFiltry({}));
    const druga = await queryPary(admin, parseFiltry({ page: '2' }));
    expect(pierwsza.wiersze).toHaveLength(50);
    const idPierwszej = new Set(pierwsza.wiersze.map((w) => String(w.id)));
    expect(druga.wiersze.some((w) => idPierwszej.has(String(w.id)))).toBe(false);
  });

  it('returns an empty page rather than failing past the end', async () => {
    const { wiersze, znalezione } = await queryPary(admin, parseFiltry({ page: '999' }));
    expect(wiersze).toHaveLength(0);
    expect(znalezione).toBe(300);
  });
});

describe('opcjeFiltrow', () => {
  it('narrows parishes to the chosen region', async () => {
    const wszystkie = await opcjeFiltrow(admin, parseFiltry({}));
    const wRejonie = await opcjeFiltrow(admin, parseFiltry({ rejon: '3' }));
    expect(wRejonie.parafie.length).toBeGreaterThan(0);
    expect(wRejonie.parafie.length).toBeLessThan(wszystkie.parafie.length);
  });

  it('narrows circles to the chosen region', async () => {
    const wRejonie = await opcjeFiltrow(admin, parseFiltry({ rejon: '3' }));
    expect(wRejonie.kregi.length).toBeGreaterThan(0);
    expect(wRejonie.kregi.every((k) => k.etykieta.startsWith('Krąg '))).toBe(true);
  });

  it('offers a region account only its own region options', async () => {
    const { parafie } = await opcjeFiltrow(rejonIII, parseFiltry({}));
    const adminaWRejonie = await opcjeFiltrow(admin, parseFiltry({ rejon: '3' }));
    expect(parafie.length).toBe(adminaWRejonie.parafie.length);
  });
});
