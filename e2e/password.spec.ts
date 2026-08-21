import { type Page, expect, test } from '@playwright/test';

const PASSWORD = 'kartoteka123';
const CHANGED = 'zmienioneHaslo-e2e';

// Region IX signs in nowhere else in the suite: a failure that leaves this
// account on the changed password cannot lock another spec out.
const ACCOUNT = 'rejon9@example.pl';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(password);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  // Without this the next goto() can race the cookie and land on /login.
  await expect(page).toHaveURL(/\/couples/);
}

/** Scoped to the form — Next renders its own route announcer with role=alert. */
function formAlert(page: Page) {
  return page.locator('form').getByRole('alert');
}

async function changePassword(page: Page, current: string, next: string) {
  await page.getByLabel('Obecne hasło').fill(current);
  await page.getByLabel(/^Nowy klucz/).fill(next);
  await page.getByLabel('Powtórz nowe hasło').fill(next);
  await page.getByRole('button', { name: 'Zmień hasło' }).click();
}

test('the account page is reachable from the sidebar', async ({ page }) => {
  await signIn(page, ACCOUNT, PASSWORD);
  await page.getByRole('link', { name: 'Moje konto' }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Moje konto' })).toBeVisible();
  await expect(page.getByText(ACCOUNT)).toBeVisible();
});

test('rejects a wrong current password', async ({ page }) => {
  await signIn(page, ACCOUNT, PASSWORD);
  await page.goto('/account');

  await changePassword(page, 'zupelnie-inne-haslo', 'noweHaslo-123456');

  await expect(formAlert(page)).toContainText(/Obecne hasło/);
});

test('rejects two new passwords that differ', async ({ page }) => {
  await signIn(page, ACCOUNT, PASSWORD);
  await page.goto('/account');

  await page.getByLabel('Obecne hasło').fill(PASSWORD);
  await page.getByLabel(/^Nowy klucz/).fill('noweHaslo-123456');
  await page.getByLabel('Powtórz nowe hasło').fill('inneHaslo-123456');
  await page.getByRole('button', { name: 'Zmień hasło' }).click();

  await expect(formAlert(page)).toContainText(/nie są takie same/);
});

test('a couple changes its own password and signs in with the new one', async ({ page }) => {
  await signIn(page, ACCOUNT, PASSWORD);
  await page.goto('/account');

  await changePassword(page, PASSWORD, CHANGED);

  await expect(page.getByRole('status')).toContainText(/Hasło zostało zmienione/);
  // The session survives its own rotation: no bounce to the login screen.
  await expect(page).toHaveURL(/\/account$/);

  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await signIn(page, ACCOUNT, CHANGED);
  await expect(page).toHaveURL(/\/couples/);

  // Hand the seeded password back, so a rerun starts where this one did.
  await page.goto('/account');
  await changePassword(page, CHANGED, PASSWORD);
  await expect(page.getByRole('status')).toContainText(/Hasło zostało zmienione/);
});
