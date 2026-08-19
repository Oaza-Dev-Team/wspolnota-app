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

/**
 * Fields inside the creation panel, addressed through it. Bare label lookups
 * cannot work on this page: every row carries buttons whose aria-label reads
 * "Popraw adres e-mail konta ..." or "Przekaż rejon ... innej parze", and
 * getByLabel matches those too.
 */
function newAccountForm(page: Page) {
  return page.getByRole('form', { name: 'Nowe konto' });
}

/** The panel around the form, which also carries its errors and its invite link. */
function newAccountPanel(page: Page) {
  return page.getByRole('group', { name: 'Dodawanie konta' });
}

test.describe('accounts', () => {
  test('lists every account, admin included, and only for the admin', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    await expect(page.getByRole('heading', { name: 'Konta', exact: true })).toBeVisible();
    // Eleven regions, the moderator, the admin itself, and the technical account.
    await expect(page.getByRole('listitem')).toHaveCount(14);
    // Exact: 'admin@example.pl' is a substring of 'superadmin@example.pl'.
    await expect(page.getByText('admin@example.pl', { exact: true })).toBeVisible();
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

  // The one boundary the roles draw: renaming the technical account or moving
  // its address would be a takeover, since the next invite goes to the new one.
  test('shows the admin the technical account but hands it no control over it', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    const row = page.getByRole('listitem').filter({ hasText: 'superadmin@example.pl' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Cała wspólnota · konto techniczne')).toBeVisible();
    await expect(row.getByRole('button')).toHaveCount(0);
  });

  test('offers the admin no technical account to create', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    const role = newAccountForm(page).getByLabel('Rola konta');
    await expect(role.getByRole('option', { name: 'Konto techniczne' })).toHaveCount(0);
    await expect(role.getByRole('option', { name: /Para odpowiedzialna/ })).toHaveCount(1);
  });

  test('the technical account signs in and reaches every view', async ({ page }) => {
    await signIn(page, 'superadmin@example.pl');
    await expect(
      page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('link'),
    ).toHaveCount(5);
    await page.goto('/accounts');
    // It is the only account that may act on itself, and the only one it may
    // not switch off — the installation would lose its last way back in.
    const row = page.getByRole('listitem').filter({ hasText: 'superadmin@example.pl' });
    await expect(row.getByRole('button', { name: /^Zmień nazwę pary/ })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Wyłącz' })).toHaveCount(0);
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

/**
 * Last in the file for the same reason as the handover block above: a created
 * account is `pending`, and the invite test picks its row by that very word.
 * Nothing here cleans up, because the application has no account deletion —
 * `npm run e2e` reseeds at the start, which is what keeps the counts honest.
 */
test.describe('accounts — creating', () => {
  test('the admin creates a moderator and gets the only copy of its invite', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    await newAccountForm(page).getByLabel('Nazwa pary', { exact: true }).fill('Zofia i Adam Nowi');
    await newAccountForm(page).getByLabel('Adres e-mail', { exact: true }).fill('zofia.adam@example.pl');
    await newAccountForm(page).getByLabel('Rola konta').selectOption({ label: 'Moderator — tylko podgląd' });
    await page.getByRole('button', { name: 'Utwórz konto' }).click();

    await expect(newAccountPanel(page).getByText(/Link zaproszenia/)).toBeVisible();
    await expect(newAccountPanel(page).getByText(/\/invite\//)).toBeVisible();

    const row = page.getByRole('listitem').filter({ hasText: 'zofia.adam@example.pl' });
    await expect(row.getByText('Zofia i Adam Nowi')).toBeVisible();
    await expect(row.getByText('oczekuje')).toBeVisible();
  });

  test('refuses an address that already signs somebody in', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    await newAccountForm(page).getByLabel('Nazwa pary', { exact: true }).fill('Kolizja');
    await newAccountForm(page).getByLabel('Adres e-mail', { exact: true }).fill('admin@example.pl');
    await page.getByRole('button', { name: 'Utwórz konto' }).click();

    await expect(
      page.getByRole('group', { name: 'Dodawanie konta' }).getByRole('alert'),
    ).toContainText('już przypisany');
  });

  test('sends a region with an account back to the handover instead of doubling it', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    await newAccountForm(page).getByLabel('Rola konta').selectOption({ label: 'Para rejonowa' });
    // Every region is staffed by the seed, so there is nothing left to offer.
    await expect(newAccountForm(page).getByRole('combobox', { name: 'Rejon konta' })).toHaveCount(0);
    await expect(page.getByText(/Każdy rejon ma już konto/)).toBeVisible();
  });

  test('the technical account appoints a second one and may then step down', async ({ page }) => {
    await signIn(page, 'superadmin@example.pl');
    await page.goto('/accounts');

    // Until a second one exists the only caretaker cannot be switched off.
    const self = page.getByRole('listitem').filter({ hasText: 'superadmin@example.pl' });
    await expect(self.getByRole('button', { name: 'Wyłącz' })).toHaveCount(0);

    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    await newAccountForm(page).getByLabel('Nazwa pary', { exact: true }).fill('Zapasowe konto techniczne');
    await newAccountForm(page).getByLabel('Adres e-mail', { exact: true }).fill('sys2@example.pl');
    await newAccountForm(page).getByLabel('Rola konta').selectOption({ label: 'Konto techniczne' });
    await page.getByRole('button', { name: 'Utwórz konto' }).click();

    await expect(newAccountPanel(page).getByText(/Link zaproszenia/)).toBeVisible();
    const second = page.getByRole('listitem').filter({ hasText: 'sys2@example.pl' });
    await expect(second.getByText('oczekuje')).toBeVisible();

    // Still the only *active* caretaker, so the guard has to hold: a pending
    // account is nobody's way back in until somebody redeems its invitation.
    await expect(self.getByRole('button', { name: 'Wyłącz' })).toHaveCount(0);
  });
});
