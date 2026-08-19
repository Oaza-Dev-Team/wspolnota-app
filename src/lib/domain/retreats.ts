import type { RetreatKind } from '@/generated/prisma/enums';

export type RetreatKindInfo = {
  kind: RetreatKind;
  code: string;
  name: string;
  /**
   * Genitive of the code, for phrases built with "bez …". Abbreviations do
   * not inflect, so for most kinds it equals the code; "Pilotowanie" is a
   * Polish noun and "bez Pilotowanie" is simply wrong.
   */
  genitive: string;
};

/**
 * Order is meaningful — it is the formation path, and both the "highest
 * degree" badge and the "next degree" suggestion depend on it.
 */
export const RETREAT_KINDS: readonly RetreatKindInfo[] = [
  { kind: 'ONZ_I', code: 'ONŻ I', genitive: 'ONŻ I', name: 'Oaza Nowego Życia I stopnia' },
  { kind: 'ONZ_II', code: 'ONŻ II', genitive: 'ONŻ II', name: 'Oaza Nowego Życia II stopnia' },
  { kind: 'ONZ_III', code: 'ONŻ III', genitive: 'ONŻ III', name: 'Oaza Nowego Życia III stopnia' },
  {
    kind: 'ORAR_I', code: 'ORAR I', genitive: 'ORAR I',
    name: 'Oaza Rekolekcyjna Animatorów Rodzin I stopnia',
  },
  {
    kind: 'ORAR_II', code: 'ORAR II', genitive: 'ORAR II',
    name: 'Oaza Rekolekcyjna Animatorów Rodzin II stopnia',
  },
  {
    kind: 'PILOTOWANIE', code: 'Pilotowanie', genitive: 'pilotowania',
    name: 'Sesja o pilotowaniu kręgów',
  },
  { kind: 'ORD', code: 'ORD', genitive: 'ORD', name: 'Oaza Rekolekcyjna Diakonii' },
  { kind: 'INNE', code: 'Inne', genitive: 'innych', name: 'Inne rekolekcje' },
] as const;

export const DEGREES: readonly RetreatKind[] = RETREAT_KINDS.filter(
  (r) => r.kind !== 'INNE',
).map((r) => r.kind);

export function retreatInfo(kind: RetreatKind): RetreatKindInfo {
  const info = RETREAT_KINDS.find((r) => r.kind === kind);
  if (!info) throw new Error(`Nieznany rodzaj rekolekcji: ${kind}`);
  return info;
}

export function highestDegree(kinds: RetreatKind[]): RetreatKind | null {
  return DEGREES.filter((d) => kinds.includes(d)).at(-1) ?? null;
}

/**
 * Couples commonly have gaps in their formation path, so the suggestion is
 * the earliest missing degree rather than the one after their highest.
 */
export function nextDegree(held: RetreatKind[]): RetreatKind {
  return DEGREES.find((d) => !held.includes(d)) ?? 'INNE';
}
