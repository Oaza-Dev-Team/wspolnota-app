import { expect, test } from '@playwright/test';
import { inviteFor } from './support/invites';
import { addAuthenticator, enrol, signIn, signOut } from './support/signIn';

const EMAIL = 'rejon7@example.pl';

test('an invitation ends in a key, a session, and a nudge for the second one', async ({ page }) => {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));

  // Enrolling signs the person in: the signature was just verified, so making
  // them prove it again would prove nothing.
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText(/Klucz dostępu utworzony/)).toBeVisible();
});

test('signs back in with the key alone, with no address to type', async ({ page }) => {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));
  await page.goto('/couples');
  await signOut(page);

  // No e-mail field exists, which is also why the form cannot be used to ask
  // who has an account.
  await expect(page.getByLabel('Adres e-mail')).toHaveCount(0);
  await signIn(page);
});

test('the last key on an account cannot be removed through the interface', async ({ page }) => {
  await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));
  // Off the fresh-enrolment ?welcome=1 notice and onto the page's steady
  // state, so the single-key notice checked below is the one a person sees
  // returning later — not the one-time welcome message, which says something
  // different and would otherwise mask this assertion.
  await page.goto('/account');

  await expect(page.getByRole('listitem')).toHaveCount(1);
  // KeyList hides "Usuń" entirely rather than showing a control that would
  // always fail (see src/app/(app)/account/KeyList.tsx): nothing to click
  // means nothing to refuse. The account-page notice is the sensible message
  // a person actually sees about this state, in place of an error that could
  // only ever arrive after a doomed attempt.
  await expect(page.getByRole('button', { name: 'Usuń' })).toHaveCount(0);
  await expect(page.getByText(/Masz zapisany tylko jeden klucz dostępu/)).toBeVisible();

  // A second device — a different transport, since Chrome allows only one
  // 'internal' authenticator per browser context (see support/signIn.ts).
  await addAuthenticator(page, 'usb');
  await page.getByRole('button', { name: 'Dodaj urządzenie' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Usuń' })).toHaveCount(2);

  await page.getByRole('button', { name: 'Usuń' }).first().click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  // Back down to one key, the interface refuses removal the same way again —
  // proving this holds dynamically, not only right after enrolment.
  await expect(page.getByRole('button', { name: 'Usuń' })).toHaveCount(0);
});

test('a key that answers from off this device offers to add one here', async ({ page }) => {
  // Any authenticator whose transport is not 'internal' reports
  // authenticatorAttachment: 'cross-platform' to the page — confirmed by hand
  // against a bare WebAuthn ceremony outside this app — which is the same
  // signal a real phone-via-QR (hybrid) key sends. 'usb' is used only because
  // it is the simplest transport to add; login/actions.ts's redirect does not
  // distinguish it from an actual cross-device phone sign-in.
  await addAuthenticator(page, 'usb');
  await enrol(page, await inviteFor(EMAIL));
  await page.goto('/couples');
  await signOut(page);

  await page.goto('/login');
  await page.getByRole('button', { name: 'Zaloguj się kluczem' }).click();

  await expect(page).toHaveURL(/\/account\?crossDevice=1/);
  await expect(page.getByText(/Zalogowano kodem QR z telefonu/)).toBeVisible();
});

test('refuses an authenticator that does not verify its user', async ({ page }) => {
  // The load-bearing test of the whole design. A passkey counts as two
  // factors because the key is unlocked by a PIN or a fingerprint; an
  // authenticator that skips that step is possession alone, and must not get
  // in. Simulated as the realistic version of that threat: the exact same
  // physical key, present, but unable to unlock itself right now — a stolen
  // device without its PIN, or a legitimate owner who just failed a
  // fingerprint check — rather than a second, unrelated, credential-less
  // authenticator alongside the real one. Confirmed by hand that the latter
  // proves nothing: Chrome simply never offers a credential-less
  // authenticator to a discoverable sign-in, so the real one answers anyway
  // and the ceremony quietly succeeds.
  const authenticatorId = await addAuthenticator(page);
  await enrol(page, await inviteFor(EMAIL));
  await signOut(page);

  // Confirmed by hand outside this app: WebAuthn.setUserVerified toggles an
  // EXISTING authenticator's verification outcome without touching its
  // credential — flipping it back to true afterwards lets the identical key
  // sign in normally again, so this is a faithful "PIN attempt failed" on the
  // real device, not a substitute for one.
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Zaloguj się kluczem' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
