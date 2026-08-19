import { type Page, expect, test } from '@playwright/test';

const PASSWORD = 'kartoteka123';

/**
 * Next.js injects its own role="alert" route announcer, so alerts must be
 * scoped to the form rather than matched globally.
 */
function komunikat(page: Page) {
  return page.locator('form').getByRole('alert');
}

async function signIn(page: Page, email: string, haslo = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(haslo);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
}

test('redirects an anonymous visitor to the login screen', async ({ page }) => {
  await page.goto('/couples');
  await expect(page).toHaveURL(/\/login$/);
});

test('admin signs in and sees the whole community', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await expect(page).toHaveURL(/\/couples$/);
  await expect(page.getByRole('heading', { name: 'Pary wspólnoty' })).toBeVisible();
});

test('a region account is scoped to its own region', async ({ page }) => {
  await signIn(page, 'rejon7@example.pl');
  await expect(page).toHaveURL(/\/couples$/);
  await expect(page.getByRole('heading', { name: 'Rejon VII' })).toBeVisible();
});

test('the moderator signs in with the view-only role', async ({ page }) => {
  await signIn(page, 'moderator@example.pl');
  await expect(page).toHaveURL(/\/couples$/);
  await expect(page.getByText('Moderator — podgląd')).toBeVisible();
});

test('rejects a wrong password without revealing whether the account exists', async ({ page }) => {
  await signIn(page, 'admin@example.pl', 'zle-haslo');
  await expect(komunikat(page)).toHaveText('Nieprawidłowy e-mail lub hasło.');

  await signIn(page, 'nieistniejacy@example.pl', 'cokolwiek');
  await expect(komunikat(page)).toHaveText('Nieprawidłowy e-mail lub hasło.');
});

test('an account awaiting invitation cannot sign in', async ({ page }) => {
  await signIn(page, 'rejon11@example.pl');
  await expect(komunikat(page)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('signing out ends the session', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await expect(page).toHaveURL(/\/couples$/);

  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/couples');
  await expect(page).toHaveURL(/\/login$/);
});
