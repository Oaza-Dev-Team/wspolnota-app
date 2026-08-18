export type FormyOdmiany = readonly [string, string, string];

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
export function odmiana(n: number, formy: FormyOdmiany): string {
  const [pojedyncza, mnoga, dopelniacz] = formy;
  const abs = Math.abs(n);

  if (abs === 1) return `${n} ${pojedyncza}`;

  const jednosci = abs % 10;
  const dziesiatki = abs % 100;
  const wyjatek = dziesiatki >= 12 && dziesiatki <= 14;

  if (jednosci >= 2 && jednosci <= 4 && !wyjatek) return `${n} ${mnoga}`;
  return `${n} ${dopelniacz}`;
}

export const PARY: FormyOdmiany = ['para', 'pary', 'par'];
export const KREGI: FormyOdmiany = ['krąg', 'kręgi', 'kręgów'];
export const PARAFIE: FormyOdmiany = ['parafia', 'parafie', 'parafii'];
export const WPISY: FormyOdmiany = ['wpis', 'wpisy', 'wpisów'];
export const REKORDY: FormyOdmiany = ['rekord', 'rekordy', 'rekordów'];

// Locative case: used only in the list subtitle, "… w N rejonach".
export const REJONY: FormyOdmiany = ['rejonie', 'rejonach', 'rejonach'];
