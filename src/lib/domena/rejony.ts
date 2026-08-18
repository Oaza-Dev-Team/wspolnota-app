export const ROMAN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
] as const;

function sprawdzZakres(rejon: number): void {
  if (!Number.isInteger(rejon) || rejon < 1 || rejon > 12) {
    throw new Error(`Numer rejonu poza zakresem 1-12: ${rejon}`);
  }
}

export function numerRzymski(rejon: number): string {
  sprawdzZakres(rejon);
  return ROMAN[rejon - 1]!;
}

/**
 * Returns the CSS custom property reference rather than a hex literal, so the
 * twelve-colour palette stays defined in exactly one place (tokens.css).
 */
export function kolorRejonu(rejon: number): string {
  sprawdzZakres(rejon);
  return `var(--rejon-${rejon})`;
}
