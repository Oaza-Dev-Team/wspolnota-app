/**
 * The community is divided into eleven regions, numbered with Roman numerals.
 * This array is the single source of truth for how many there are — the range
 * guard, the seed and the token test all derive from its length rather than
 * repeating a literal.
 */
export const ROMAN = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI',
] as const;

export const REGION_COUNT = ROMAN.length;

function assertInRange(region: number): void {
  if (!Number.isInteger(region) || region < 1 || region > REGION_COUNT) {
    throw new Error(`Numer rejonu poza zakresem 1-${REGION_COUNT}: ${region}`);
  }
}

export function romanNumeral(region: number): string {
  assertInRange(region);
  return ROMAN[region - 1]!;
}

/**
 * Returns the CSS custom property reference rather than a hex literal, so the
 * region palette stays defined in exactly one place (tokens.css).
 */
export function regionColor(region: number): string {
  assertInRange(region);
  return `var(--region-${region})`;
}
