import { type Page, expect, test } from '@playwright/test';

const HASLO = 'kartoteka123';

async function zaloguj(page: Page, email: string) {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(HASLO);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL(/\/pary/);
}

async function wyloguj(page: Page) {
  await page.getByRole('button', { name: 'Wyloguj' }).click();
  await expect(page).toHaveURL(/\/logowanie/);
}

test('admin sees the whole community with the shell', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page.getByRole('heading', { name: 'Pary wspólnoty' })).toBeVisible();
  await expect(page.getByText('Cała wspólnota — 300 par w 11 rejonach')).toBeVisible();
});

test('navigation has four entries for admin, one for a region account', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  const nawigacja = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await expect(nawigacja.getByRole('link')).toHaveCount(4);

  await wyloguj(page);
  await zaloguj(page, 'rejon7@example.pl');
  await expect(nawigacja.getByRole('link')).toHaveCount(1);
  await expect(nawigacja.getByRole('link', { name: 'Mój rejon' })).toBeVisible();
});

test('a region account sees only its own region', async ({ page }) => {
  await zaloguj(page, 'rejon7@example.pl');
  await expect(page.getByRole('heading', { name: 'Rejon VII' })).toBeVisible();
  // The region selector is pointless when the account has exactly one region.
  await expect(page.getByLabel('Rejon')).toHaveCount(0);
});

test('a region account cannot widen its scope through the URL', async ({ page }) => {
  await zaloguj(page, 'rejon7@example.pl');
  await page.goto('/pary?region=3');
  // Scope is enforced server-side, so the region filter cannot reach region III.
  const inneRejony = page.locator('tbody tr td:nth-child(5)').getByText(/^III$/);
  await expect(inneRejony).toHaveCount(0);
});

test('the viewer can only view', async ({ page }) => {
  await zaloguj(page, 'moderator@example.pl');
  await expect(page.getByRole('link', { name: 'Podgląd →' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edytuj →' })).toHaveCount(0);
});

test('sorting is reflected in the URL and survives a reload', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByRole('link', { name: /^E-mail/ }).click();
  await expect(page).toHaveURL(/sort=email/);
  await page.reload();
  await expect(page).toHaveURL(/sort=email/);

  await page.getByRole('link', { name: /^E-mail/ }).click();
  await expect(page).toHaveURL(/dir=desc/);
});

test('the sorted column is announced to assistive technology', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1);
  await page.getByRole('link', { name: /^Telefon/ }).click();
  await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1);
});

test('the region filter cascades and clears the narrower choices', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByLabel('Parafia').selectOption({ index: 1 });
  await expect(page).toHaveURL(/parish=/);

  await page.getByLabel('Rejon').selectOption('3');
  await expect(page).toHaveURL(/region=3/);
  // Changing the region invalidates the parish.
  await expect(page).not.toHaveURL(/parish=/);
});

test('the counter shows the filter suffix only when a filter is active', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await expect(page.getByRole('status')).toHaveText('300 / 300');

  await page.getByLabel('Formacja').selectOption('none');
  await expect(page.getByRole('status')).toContainText('(filtr)');
});

test('every formation option returns a non-empty result', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  const opcje = await page.getByLabel('Formacja').locator('option').evaluateAll(
    (os) => os.map((o) => (o as HTMLOptionElement).value),
  );
  expect(opcje).toHaveLength(17);

  for (const wartosc of opcje) {
    await page.getByLabel('Formacja').selectOption(wartosc);
    await expect(
      page.getByText('Brak wyników dla podanych kryteriów.'),
      `empty result for ${wartosc}`,
    ).toHaveCount(0);
  }
});

test('search matches without Polish diacritics', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.getByLabel('Szukaj').fill('baginscy');
  await expect(page).toHaveURL(/q=baginscy/);
  await expect(page.locator('tbody').getByText('Bagińscy').first()).toBeVisible();
});

test('an impossible filter shows the empty-state message', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.goto('/pary?q=nieistniejacenazwisko123');
  await expect(page.getByText('Brak wyników dla podanych kryteriów.').first()).toBeVisible();
});

test('a hand-edited query string degrades instead of failing', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.goto('/pary?region=999&sort=cokolwiek&page=0&formation=ONZ_XVII');
  await expect(page.getByRole('heading', { name: 'Pary wspólnoty' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('300 / 300');
});

test('below 860px the table gives way to cards', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  await page.setViewportSize({ width: 412, height: 900 });
  await expect(page.locator('table')).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('table')).toBeVisible();
});

test('paging moves through the results without repeating them', async ({ page }) => {
  await zaloguj(page, 'admin@example.pl');
  const pierwsze = await page.locator('tbody tr td:first-child').first().textContent();
  await page.getByRole('link', { name: 'Następna →' }).click();
  await expect(page).toHaveURL(/page=2/);
  const drugie = await page.locator('tbody tr td:first-child').first().textContent();
  expect(drugie).not.toBe(pierwsze);
});
