export type PluralForms = readonly [string, string, string];

/**
 * Polish numeral inflection. Picks one of three forms:
 *
 *   1                 → singular         "1 para"
 *   2-4               → plural           "3 pary"
 *   0, 5+, and 12-14  → genitive plural  "5 par", "13 par"
 *
 * The 12-14 carve-out is why the last two digits must be checked and not
 * only the last one: 22 takes the plural form but 12 does not.
 */
export function plural(n: number, forms: PluralForms): string {
  const [one, few, many] = forms;
  const abs = Math.abs(n);

  if (abs === 1) return `${n} ${one}`;

  const units = abs % 10;
  const lastTwo = abs % 100;
  const teens = lastTwo >= 12 && lastTwo <= 14;

  if (units >= 2 && units <= 4 && !teens) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const COUPLES: PluralForms = ['para', 'pary', 'par'];
export const CIRCLES: PluralForms = ['krąg', 'kręgi', 'kręgów'];
export const PARISHES: PluralForms = ['parafia', 'parafie', 'parafii'];
export const ENTRIES: PluralForms = ['wpis', 'wpisy', 'wpisów'];
export const RECORDS: PluralForms = ['rekord', 'rekordy', 'rekordów'];
export const ROWS: PluralForms = ['wiersz', 'wiersze', 'wierszy'];

// Locative case: used only in the list subtitle, "… w N rejonach".
export const REGIONS_IN: PluralForms = ['rejonie', 'rejonach', 'rejonach'];
