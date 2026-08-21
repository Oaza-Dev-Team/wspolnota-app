/**
 * APP_URL is read here and nowhere else.
 *
 * Two things depend on it and must never disagree: the invitation links handed
 * to a person to open, and the domain a passkey is bound to
 * (src/lib/auth/webauthn/config.ts). A link built from one value while keys are
 * scoped to another is the failure this module exists to make impossible — the
 * base address was assembled by hand in four places before, and the one that
 * mattered most, the container the runbook bootstraps from, was the one that
 * never received the variable.
 *
 * Deliberately free of Prisma and of anything Next-specific, so the
 * command-line scripts (create-superadmin, key-reset), the seed and the server
 * actions can all import the same function.
 */

/** Local work only. Never reached in production: assertAppUrl stops the start. */
export const DEV_FALLBACK = 'http://localhost:3000';

export class AppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppUrlError';
  }
}

function malformed(raw: string): AppUrlError {
  // Names the variable and the offending value: `new URL()` alone throws a
  // bare "Invalid URL", and a missing scheme — `kartoteka.oazagdansk.pl` —
  // is the likeliest .env typo in this project.
  return new AppUrlError(
    `Nieprawidłowa wartość APP_URL: „${raw}". Podaj pełny adres wraz z protokołem, `
      + 'na przykład https://kartoteka.oazagdansk.pl',
  );
}

/**
 * The configured address, or null when the variable is not set at all.
 * A value that is set but is not an address throws — being unset is a
 * question for the caller (fatal in production, a convenience locally),
 * being wrong never is.
 */
export function parseAppUrl(): URL | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw malformed(raw);
  }
  // `kartoteka.oazagdansk.pl:3000` parses without complaint — as a URL whose
  // scheme is the hostname and whose path is the port. Checking the protocol
  // is what catches the scheme-less value that happens to have a colon in it.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw malformed(raw);
  if (url.hostname === '') throw malformed(raw);

  return url;
}

// Warned once per process: the seed prints fifteen links in a loop, and a
// warning repeated fifteen times is a warning nobody reads.
let warned = false;

/**
 * The base address every link is built on. Falls back to localhost for local
 * work — but says so on stderr, because a link that quietly says `localhost`
 * on a server is worse than no link: it looks plausible, and re-running the
 * bootstrap script to get a better one refuses, the account by then existing.
 */
export function appOrigin(): string {
  const url = parseAppUrl();
  if (url) return url.origin;

  if (!warned) {
    warned = true;
    console.warn(
      `UWAGA: nie ustawiono APP_URL — link poniżej wskazuje na ${DEV_FALLBACK} `
        + 'i zadziała wyłącznie na tym komputerze. Na serwerze ustaw APP_URL '
        + 'na prawdziwy adres kartoteki i uruchom polecenie ponownie.',
    );
  }
  return DEV_FALLBACK;
}

/**
 * The one-time invitation link. The raw token exists only in the moment it is
 * returned: the database keeps a digest, so the link is unrecoverable once the
 * screen or the console scrollback is gone.
 */
export function inviteUrl(token: string): string {
  return `${appOrigin()}/invite/${token}`;
}

/**
 * Called at server start (src/instrumentation.ts). A production instance
 * without a usable APP_URL cannot sign anybody in, and the symptom arrives
 * hours later as "logowanie nie działa", with nothing in it to diagnose — so
 * it fails here instead, by name, before the first request.
 */
export function assertAppUrl(): void {
  // Throws on its own for a value that is set but malformed, in every
  // environment: a typo is worth stopping for locally too.
  const url = parseAppUrl();
  if (url) return;

  if (process.env.NODE_ENV === 'production') {
    throw new AppUrlError(
      'Brak zmiennej APP_URL — bez niej nie da się ani zarejestrować klucza, '
        + 'ani się nim zalogować. Ustaw ją na adres, pod którym odpowiada '
        + 'kartoteka, na przykład https://kartoteka.oazagdansk.pl',
    );
  }
}
