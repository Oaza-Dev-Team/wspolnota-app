/**
 * A passkey is bound to a domain: a credential created for one relying party
 * id does not exist for any other. Both values therefore come from a single
 * environment variable — two variables could be set to disagree, and the only
 * symptom would be that signing in stops working, with nothing in the error to
 * say why.
 */

export const RP_NAME = 'Kartoteka Domowego Kościoła';

const DEV_FALLBACK = 'http://localhost:3000';

export function rpConfig(): { rpID: string; origin: string } {
  const raw = process.env.APP_URL?.trim();

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Brak zmiennej APP_URL — bez niej logowanie kluczem nie zadziała pod żadnym adresem',
      );
    }
    return { rpID: 'localhost', origin: DEV_FALLBACK };
  }

  const url = new URL(raw);
  // The browser sends the origin without a trailing slash; URL.origin already
  // normalises that, and also drops any path someone put in the variable.
  return { rpID: url.hostname, origin: url.origin };
}
