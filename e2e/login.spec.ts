import { expect, test } from '@playwright/test';
import { addAuthenticator, signInAs, signOut } from './support/signIn';

test('redirects an anonymous visitor to the login screen', async ({ page }) => {
  await page.goto('/couples');
  await expect(page).toHaveURL(/\/login$/);
});

test('admin signs in and sees the whole community', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await expect(page).toHaveURL(/\/couples$/);
  await expect(page.getByRole('heading', { name: 'Pary wspólnoty' })).toBeVisible();
});

test('a region account is scoped to its own region', async ({ page }) => {
  await signInAs(page, 'rejon7@example.pl');
  await expect(page).toHaveURL(/\/couples$/);
  await expect(page.getByRole('heading', { name: 'Rejon VII' })).toBeVisible();
});

test('the moderator signs in with the view-only role', async ({ page }) => {
  await signInAs(page, 'moderator@example.pl');
  await expect(page).toHaveURL(/\/couples$/);
  await expect(page.getByText('Moderator — podgląd')).toBeVisible();
});

test('sign-in fails without a key registered on this device', async ({ page }) => {
  // Nothing to type any more — the sign-in page carries no e-mail field, so
  // there is no wrong password to reject and no address to say "unknown"
  // about. What replaces both of the old suite's checks is the one thing a
  // passwordless form can still get wrong: no discoverable credential at all.
  // A virtual authenticator is added anyway (empty, no stored credential) so
  // the ceremony fails deterministically and fast, rather than depending on
  // whatever real platform authenticator this machine happens to have.
  await addAuthenticator(page);

  await page.goto('/login');
  await page.getByRole('button', { name: 'Zaloguj się kluczem' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('signing out ends the session', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await expect(page).toHaveURL(/\/couples$/);

  await signOut(page);
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/couples');
  await expect(page).toHaveURL(/\/login$/);
});
