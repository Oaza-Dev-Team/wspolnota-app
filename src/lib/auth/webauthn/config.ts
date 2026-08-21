/**
 * A passkey is bound to a domain: a credential created for one relying party
 * id does not exist for any other. Both values therefore come from a single
 * environment variable — two variables could be set to disagree, and the only
 * symptom would be that signing in stops working, with nothing in the error to
 * say why.
 *
 * The variable itself is parsed in src/lib/appUrl.ts, which is also where the
 * invitation links come from — the same address, read once.
 */
import { DEV_FALLBACK, parseAppUrl } from '@/lib/appUrl';

export const RP_NAME = 'Kartoteka Domowego Kościoła';

export function rpConfig(): { rpID: string; origin: string } {
  // A malformed value throws here, naming APP_URL and what it was set to.
  const url = parseAppUrl();

  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Brak zmiennej APP_URL — bez niej logowanie kluczem nie zadziała pod żadnym adresem',
      );
    }
    return { rpID: 'localhost', origin: DEV_FALLBACK };
  }

  // The browser sends the origin without a trailing slash; URL.origin already
  // normalises that, and also drops any path someone put in the variable.
  return { rpID: url.hostname, origin: url.origin };
}
