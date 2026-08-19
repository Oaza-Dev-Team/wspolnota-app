import { type Page, expect, test } from '@playwright/test';

const PASSWORD = 'kartoteka123';

// Region V is the account these tests switch off and on again. No other spec
// signs in as it, so a failure here cannot lock another suite out.
const TOGGLED = 'rejon5@example.pl';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(PASSWORD);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL(/\/couples/);
}

/** Scoped to the form — Next renders its own route announcer with role=alert. */
function formAlert(page: Page) {
  return page.locator('form').getByRole('alert');
}

function accountRow(page: Page, email: string) {
  return page.getByRole('listitem').filter({ hasText: email });
}

test.describe('regions', () => {
  test('shows one tile per region, with inflected statistics', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.getByRole('link', { name: 'Rejony' }).click();

    await expect(page).toHaveURL(/\/regions/);
    await expect(page.getByRole('heading', { name: 'Rejony I–XI' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Rejon [IVX]+/ })).toHaveCount(11);
  });

  test('marks the unstaffed region and names the others', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/regions');
    await expect(page.getByText('Do obsadzenia')).toHaveCount(1);
  });

  test('a tile leads to the list filtered to that region', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/regions');
    await page.getByRole('link', { name: /^Rejon III/ }).click();

    await expect(page).toHaveURL(/\/couples\?region=3/);
    await expect(page.getByLabel('Rejon')).toHaveValue('3');
  });

  test('the moderator may look, a region account is sent back to its list', async ({ page }) => {
    await signIn(page, 'moderator@example.pl');
    await page.goto('/regions');
    await expect(page.getByRole('heading', { name: 'Rejony I–XI' })).toBeVisible();

    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await signIn(page, 'rejon7@example.pl');
    await page.goto('/regions');
    await expect(page).toHaveURL(/\/couples/);
  });
});

test.describe('accounts', () => {
  test('lists every account, admin included, and only for the admin', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    await expect(page.getByRole('heading', { name: 'Konta rejonów' })).toBeVisible();
    // Eleven regions, the moderator, and the admin itself.
    await expect(page.getByRole('listitem')).toHaveCount(13);
    await expect(page.getByText('admin@example.pl')).toBeVisible();
  });

  // Disabling it would need database access to undo, so the row keeps its
  // identity editable and nothing else.
  test('offers the admin no way to disable or hand over its own account', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    const adminRow = page.getByRole('listitem').filter({ hasText: 'admin@example.pl' });
    await expect(adminRow.getByRole('button', { name: 'Wyłącz' })).toHaveCount(0);
    await expect(adminRow.getByRole('button', { name: /^Przekaż rejon/ })).toHaveCount(0);
    // The visible text is "Zmień"/"Popraw", but each button carries an
    // aria-label naming the account, so thirteen of them stay distinguishable.
    await expect(adminRow.getByRole('button', { name: /^Zmień nazwę pary/ })).toBeVisible();
    await expect(adminRow.getByRole('button', { name: /^Popraw adres/ })).toBeVisible();
  });

  test('correcting an address keeps the couple signed in', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    // Filtered on the scope, not the address: opening the editor turns the
    // address into an input value and the row would stop matching.
    const row = page.getByRole('listitem').filter({ hasText: 'Rejon III ·' });
    await row.getByRole('button', { name: /^Popraw adres/ }).click();
    await row.getByLabel(/^Adres e-mail konta/).fill('rejon3.nowy@example.pl');
    await row.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('rejon3.nowy@example.pl')).toBeVisible();
    // Status untouched: the same people, reached at a different address.
    const moved = page.getByRole('listitem').filter({ hasText: 'rejon3.nowy@example.pl' });
    await expect(moved.getByText('aktywne')).toBeVisible();
  });

  test('is closed to the moderator and to a region account', async ({ page }) => {
    await signIn(page, 'moderator@example.pl');
    await page.goto('/accounts');
    await expect(page).toHaveURL(/\/couples/);

    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await signIn(page, 'rejon7@example.pl');
    await page.goto('/accounts');
    await expect(page).toHaveURL(/\/couples/);
  });

  test('switching an account off and on again changes its status badge', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    const row = accountRow(page, TOGGLED);
    await expect(row.getByText('aktywne')).toBeVisible();

    await row.getByRole('button', { name: 'Wyłącz' }).click();
    await expect(row.getByText('wyłączone')).toBeVisible();

    await row.getByRole('button', { name: 'Włącz' }).click();
    await expect(row.getByText('aktywne')).toBeVisible();
  });

  test('inviting an unstaffed account shows a one-time link', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    const row = page.getByRole('listitem').filter({ hasText: 'oczekuje' });
    await row.getByRole('button', { name: 'Zaproś' }).click();

    await expect(row.getByText(/Link zaproszenia/)).toBeVisible();
    await expect(row.getByText(/\/invite\//)).toBeVisible();
  });
});

test.describe('invitation', () => {
  test('the page is reachable without a session and refuses a bad token', async ({ page }) => {
    await page.goto('/invite/nieistniejacy-token');
    await expect(page.getByRole('heading', { name: 'Ustaw hasło' })).toBeVisible();

    await page.getByLabel(/Nowe hasło/).fill('haslo-testowe-1');
    await page.getByLabel('Powtórz hasło').fill('haslo-testowe-1');
    await page.getByRole('button', { name: 'Ustaw hasło' }).click();

    await expect(formAlert(page)).toContainText(/nieprawidłowe|użyte/);
  });

  test('rejects two passwords that differ', async ({ page }) => {
    await page.goto('/invite/nieistniejacy-token');
    await page.getByLabel(/Nowe hasło/).fill('haslo-testowe-1');
    await page.getByLabel('Powtórz hasło').fill('haslo-testowe-2');
    await page.getByRole('button', { name: 'Ustaw hasło' }).click();

    await expect(formAlert(page)).toContainText('Hasła nie są takie same');
  });
});

test.describe('history', () => {
  test('lists entries with a kind badge and an author', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.getByRole('link', { name: 'Historia zmian' }).click();

    await expect(page).toHaveURL(/\/history/);
    await expect(page.getByRole('heading', { name: 'Historia zmian' })).toBeVisible();
    await expect(page.getByRole('listitem').first()).toBeVisible();
  });

  test('pages through the entries', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/history');

    const first = await page.getByRole('listitem').first().textContent();
    const next = page.getByRole('link', { name: 'Następna →' });

    // The seed plus the earlier suites leave well over one page behind, but
    // this stays honest if that ever stops being true.
    if (await next.count()) {
      await next.click();
      await expect(page).toHaveURL(/page=2/);
      expect(await page.getByRole('listitem').first().textContent()).not.toBe(first);
    }
  });

  test('is closed to everyone but the admin', async ({ page }) => {
    await signIn(page, 'moderator@example.pl');
    await page.goto('/history');
    await expect(page).toHaveURL(/\/couples/);

    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await signIn(page, 'rejon7@example.pl');
    await page.goto('/history');
    await expect(page).toHaveURL(/\/couples/);
  });

});

/**
 * Last on purpose. Handing over a region leaves the account waiting for its
 * invite, and the tests above count how many accounts are in that state.
 */
test.describe('accounts — handover', () => {
  test('handing over a region revokes the outgoing couple and offers an invite', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    const row = page.getByRole('listitem').filter({ hasText: 'Rejon IV ·' });
    await row.getByRole('button', { name: /^Przekaż rejon/ }).click();
    await row.getByLabel(/^Nowa para dla rejonu/).fill('Ewa i Jan Cichy');
    await row.getByLabel(/^Adres e-mail nowej pary/).fill('cichy.nowi@example.pl');
    await row.getByRole('button', { name: 'Potwierdź przekazanie' }).click();

    const handed = page.getByRole('listitem').filter({ hasText: 'cichy.nowi@example.pl' });
    await expect(handed.getByText('Ewa i Jan Cichy')).toBeVisible();
    // No password yet, so the account waits for the invite to be redeemed.
    await expect(handed.getByText('oczekuje')).toBeVisible();
    await expect(handed.getByText('/invite/')).toBeVisible();
  });
});
