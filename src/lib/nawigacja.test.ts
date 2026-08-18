import { describe, expect, it } from 'vitest';
import type { Uzytkownik } from '@/lib/auth/permissions';
import { pozycjeNawigacji, tytulListy } from './nawigacja';

const admin: Uzytkownik = { id: 1n, rola: 'admin', rejonId: null };
const rejonVII: Uzytkownik = { id: 2n, rola: 'rejon', rejonId: 7 };
const moderator: Uzytkownik = { id: 3n, rola: 'podglad', rejonId: null };

describe('pozycjeNawigacji', () => {
  // The acceptance checklist counts these exactly: admin 4, region 1, viewer 2.
  it('gives admin all four entries', () => {
    expect(pozycjeNawigacji(admin).map((p) => p.klucz)).toEqual([
      'pary', 'rejony', 'konta', 'audyt',
    ]);
  });

  it('gives a region account only its own list', () => {
    const pozycje = pozycjeNawigacji(rejonVII);
    expect(pozycje).toHaveLength(1);
    expect(pozycje[0]).toEqual({ href: '/pary', etykieta: 'Mój rejon', klucz: 'pary' });
  });

  it('gives the viewer the list and the regions, without administration', () => {
    expect(pozycjeNawigacji(moderator).map((p) => p.klucz)).toEqual(['pary', 'rejony']);
  });
});

describe('tytulListy', () => {
  it('names the region for a region account', () => {
    expect(tytulListy(rejonVII, 27)).toEqual({
      tytul: 'Rejon VII',
      podtytul: 'Twoje pary — możesz dodawać i edytować dane',
    });
  });

  it('describes the whole community for admin and viewer, with inflection', () => {
    expect(tytulListy(admin, 300)).toEqual({
      tytul: 'Pary wspólnoty',
      podtytul: 'Cała wspólnota — 300 par w 11 rejonach',
    });
    expect(tytulListy(moderator, 1).podtytul).toBe('Cała wspólnota — 1 para w 11 rejonach');
  });
});
