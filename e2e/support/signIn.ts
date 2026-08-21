import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { inviteFor } from './invites';

// Chrome allows only ONE 'internal' virtual authenticator per browser
// context — confirmed by hand: a second `addVirtualAuthenticator` call with
// the same transport throws "Chrome only supports one internal authenticator
// per environment". A test that switches which account it is signed in as
// within a single page (sign out, sign in as somebody else) would otherwise
// hit that error the second time addAuthenticator runs. Tracking the current
// one per page lets addAuthenticator remove it first, which matches reality
// well enough for a test double: one device, and its platform authenticator
// now unlocks a different account's key.
const currentInternal = new WeakMap<Page, string>();

/**
 * Chromium exposes a virtual authenticator over CDP that signs exactly like a
 * real one, so the whole ceremony runs without hardware. Resident keys and
 * user verification are both on, because that is what the application asks
 * for — an authenticator without them would be refused, which is the point of
 * the fourth test in passkey.spec.ts.
 *
 * `transport` defaults to `'internal'` (a platform authenticator — "this
 * device"), matching what a normal enrolment uses. A test that needs a SECOND
 * device present AT THE SAME TIME as the first — a real second key, from the
 * browser's point of view, rather than switching accounts — must pass a
 * different transport, e.g. `'usb'`; only 'internal' authenticators replace
 * each other.
 */
export async function addAuthenticator(
  page: Page,
  transport: 'internal' | 'usb' | 'nfc' | 'ble' | 'cable' = 'internal',
): Promise<string> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');

  if (transport === 'internal') {
    const previous = currentInternal.get(page);
    if (previous) await client.send('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: previous,
    });
  }

  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  if (transport === 'internal') currentInternal.set(page, authenticatorId);
  return authenticatorId;
}

/** Follows an invitation to its end: a key exists and the account is signed in. */
export async function enrol(page: Page, token: string): Promise<void> {
  await page.goto(`/invite/${token}`);
  await page.getByRole('button', { name: 'Utwórz klucz' }).click();
  await expect(page).toHaveURL(/\/account/);
}

export async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Zaloguj się kluczem' }).click();
  await expect(page).toHaveURL(/\/couples/);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Signs in as one particular account: adds a key, enrols it against a fresh
 * invitation for that address, and lands on /couples. Enrolling already
 * leaves the browser signed in, so nothing else is needed.
 *
 * This is what the rest of the suite uses everywhere the old password-based
 * `signIn(page, email)` stood. Which account a test reaches is now decided by
 * whose key is loaded into the virtual authenticator, not by a field on a
 * form — the sign-in page itself has no address to type into.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(email));
  await page.goto('/couples');
}
