/**
 * Mirrors the `search_text` generated columns: lower case, no diacritics. Must
 * stay in step with immutable_unaccent(lower(…)) in the migration, or a query
 * will never match the column it is compared against.
 */
export function withoutDiacritics(text: string): string {
  return text
    .toLowerCase()
    // ł has no Unicode decomposition, so it must be replaced before NFD.
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
