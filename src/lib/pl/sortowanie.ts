// Mirrors the "pl-PL-x-icu" collation applied to para.nazwisko, so
// server-side ORDER BY and any client-side sort agree.
const collator = new Intl.Collator('pl', { numeric: true, sensitivity: 'base' });

export function porownajPl(a: string, b: string): number {
  return collator.compare(a, b);
}
