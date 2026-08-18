/**
 * The community is divided into eleven regions, numbered with Roman numerals.
 * This array is the single source of truth for how many there are — the range
 * guard, the seed and the token test all derive from its length rather than
 * repeating a literal.
 */
export const ROMAN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI',
] as const;

export const LICZBA_REJONOW = ROMAN.length;

function sprawdzZakres(rejon: number): void {
  if (!Number.isInteger(rejon) || rejon < 1 || rejon > LICZBA_REJONOW) {
    throw new Error(`Numer rejonu poza zakresem 1-${LICZBA_REJONOW}: ${rejon}`);
  }
}

export function numerRzymski(rejon: number): string {
  sprawdzZakres(rejon);
  return ROMAN[rejon - 1]!;
}

/**
 * Returns the CSS custom property reference rather than a hex literal, so the
 * region palette stays defined in exactly one place (tokens.css).
 */
export function kolorRejonu(rejon: number): string {
  sprawdzZakres(rejon);
  return `var(--rejon-${rejon})`;
}
