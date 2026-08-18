import type { RodzajRekolekcji } from '@/generated/prisma/enums';

export type RodzajOpis = {
  rodzaj: RodzajRekolekcji;
  kod: string;
  nazwa: string;
};

/**
 * Order is meaningful — it is the formation path, and both the "highest
 * degree" badge and the "next degree" suggestion depend on it.
 */
export const RODZAJE_REKOLEKCJI: readonly RodzajOpis[] = [
  { rodzaj: 'ONZ_I', kod: 'ONŻ I', nazwa: 'Oaza Nowego Życia I stopnia' },
  { rodzaj: 'ONZ_II', kod: 'ONŻ II', nazwa: 'Oaza Nowego Życia II stopnia' },
  { rodzaj: 'ONZ_III', kod: 'ONŻ III', nazwa: 'Oaza Nowego Życia III stopnia' },
  { rodzaj: 'ORAR_I', kod: 'ORAR I', nazwa: 'Oaza Rekolekcyjna Animatorów Rodzin I stopnia' },
  { rodzaj: 'ORAR_II', kod: 'ORAR II', nazwa: 'Oaza Rekolekcyjna Animatorów Rodzin II stopnia' },
  { rodzaj: 'PILOTOWANIE', kod: 'Pilotowanie', nazwa: 'Sesja o pilotowaniu kręgów' },
  { rodzaj: 'ORD', kod: 'ORD', nazwa: 'Oaza Rekolekcyjna Diakonii' },
  { rodzaj: 'INNE', kod: 'Inne', nazwa: 'Inne rekolekcje' },
] as const;

export const STOPNIE: readonly RodzajRekolekcji[] = RODZAJE_REKOLEKCJI.filter(
  (r) => r.rodzaj !== 'INNE',
).map((r) => r.rodzaj);

export function opisRodzaju(rodzaj: RodzajRekolekcji): RodzajOpis {
  const opis = RODZAJE_REKOLEKCJI.find((r) => r.rodzaj === rodzaj);
  if (!opis) throw new Error(`Nieznany rodzaj rekolekcji: ${rodzaj}`);
  return opis;
}

export function najwyzszyStopien(rodzaje: RodzajRekolekcji[]): RodzajRekolekcji | null {
  const posiadane = STOPNIE.filter((s) => rodzaje.includes(s));
  return posiadane.at(-1) ?? null;
}

/**
 * Couples commonly have gaps in their formation path, so the suggestion is
 * the earliest missing degree rather than the one after their highest.
 */
export function nastepnyStopien(posiadane: RodzajRekolekcji[]): RodzajRekolekcji {
  return STOPNIE.find((s) => !posiadane.includes(s)) ?? 'INNE';
}
