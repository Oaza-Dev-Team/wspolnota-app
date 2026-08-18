import { type Page, expect, test } from '@playwright/test';

const HASLO = 'kartoteka123';

/**
 * Next.js injects its own role="alert" route announcer, so alerts must be
 * scoped to the form rather than matched globally.
 */
function komunikat(page: Page) {
  return page.locator('form').getByRole('alert');
}

async function zaloguj(page: Page, email: string, haslo = HASLO) {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(haslo);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

test('redirects an anonymous visitor to the login screen', async ({ page }) => {
  await page.goto('/pary');
  await expect(page).toHaveURL(/\/logowanie$/);
});

test('admin signs in and sees the whole community', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page).toHaveURL(/\/pary$/);
  await expect(page.getByText('cała wspólnota')).toBeVisible();
});

test('a region account is scoped to its own region', async ({ page }) => {
  await zaloguj(page, 'rejon7@example.pl');
  await expect(page).toHaveURL(/\/pary$/);
  await expect(page.getByText('rejon VII')).toBeVisible();
});

test('the moderator signs in with the view-only role', async ({ page }) => {
  await zaloguj(page, 'moderator@example.pl');
  await expect(page).toHaveURL(/\/pary$/);
  await expect(page.getByText('podglad')).toBeVisible();
});

test('rejects a wrong password without revealing whether the account exists', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl', 'zle-haslo');
  await expect(komunikat(page)).toHaveText('Nieprawidłowy e-mail lub hasło.');

  await zaloguj(page, 'nieistniejacy@example.pl', 'cokolwiek');
  await expect(komunikat(page)).toHaveText('Nieprawidłowy e-mail lub hasło.');
});

test('an account awaiting invitation cannot sign in', async ({ page }) => {
  await zaloguj(page, 'rejon11@example.pl');
  await expect(komunikat(page)).toBeVisible();
  await expect(page).toHaveURL(/\/logowanie$/);
});

test('signing out ends the session', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page).toHaveURL(/\/pary$/);

  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/logowanie$/);

  await page.goto('/pary');
  await expect(page).toHaveURL(/\/logowanie$/);
});
