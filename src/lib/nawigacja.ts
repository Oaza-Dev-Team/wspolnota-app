import type { Uzytkownik } from '@/lib/auth/permissions';
import { mozeCzytacAudyt, mozeZarzadzacKontami } from '@/lib/auth/permissions';
import { LICZBA_REJONOW, numerRzymski } from '@/lib/domena/rejony';
import { PARY, REJONY, odmiana } from '@/lib/pl';

export type KluczWidoku = 'pary' | 'rejony' | 'konta' | 'audyt';

export type PozycjaNawigacji = {
  href: string;
  etykieta: string;
  klucz: KluczWidoku;
};

export function pozycjeNawigacji(u: Uzytkownik): PozycjaNawigacji[] {
  // A region account manages one region, so "all couples" would be a lie —
  // it gets a single entry named after what it actually sees.
  if (u.rola === 'rejon') {
    return [{ href: '/pary', etykieta: 'Mój rejon', klucz: 'pary' }];
  }

  const pozycje: PozycjaNawigacji[] = [
    { href: '/pary', etykieta: 'Wszystkie pary', klucz: 'pary' },
    { href: '/rejony', etykieta: 'Rejony', klucz: 'rejony' },
  ];

  if (mozeZarzadzacKontami(u)) {
    pozycje.push({ href: '/konta', etykieta: 'Konta rejonów', klucz: 'konta' });
  }
  if (mozeCzytacAudyt(u)) {
    pozycje.push({ href: '/historia', etykieta: 'Historia zmian', klucz: 'audyt' });
  }
  return pozycje;
}

export function tytulListy(u: Uzytkownik, liczbaPar: number): { tytul: string; podtytul: string } {
  if (u.rola === 'rejon' && u.rejonId !== null) {
    return {
      tytul: `Rejon ${numerRzymski(u.rejonId)}`,
      podtytul: 'Twoje pary — możesz dodawać i edytować dane',
    };
  }
  return {
    tytul: 'Pary wspólnoty',
    podtytul: `Cała wspólnota — ${odmiana(liczbaPar, PARY)} w ${odmiana(LICZBA_REJONOW, REJONY)}`,
  };
}
