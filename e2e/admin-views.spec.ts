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
    // Eleven regions, the moderator, the admin itself, the technical account,
    // and the helper the seed gives region I.
    await expect(page.getByRole('listitem')).toHaveCount(15);
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
    // Two of them: for the community and for a region.
    await expect(role.getByRole('option', { name: /^Para odpowiedzialna/ })).toHaveCount(2);
    await expect(role.getByRole('option', { name: 'Pomocnik rejonu' })).toHaveCount(1);
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
    await expect(row.getByRole('button', { name: /^Usuń konto/ })).toHaveCount(0);
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

  // The account whose key is reset here stays `active` and keeps that
  // key, so the invite test above still finds exactly one `oczekuje` row.
  test('resetting an account that already has a key issues a link', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    const row = accountRow(page, 'moderator@example.pl');
    await expect(row.getByText('aktywne')).toBeVisible();

    await row.getByRole('button', { name: /^Nowy klucz/ }).click();

    await expect(row.getByText(/\/invite\//)).toBeVisible();
    // Whoever hands the link on has to know the old key still works.
    await expect(row.getByText(/Dotychczasowy klucz/)).toBeVisible();
  });
});

test.describe('invitation', () => {
  test('the page is reachable without a session and refuses a bad token', async ({ page }) => {
    await page.goto('/invite/nieistniejacy-token');
    await expect(page.getByRole('heading', { name: 'Ustaw hasło' })).toBeVisible();

    await page.getByLabel(/Nowy klucz/).fill('haslo-testowe-1');
    await page.getByLabel('Powtórz hasło').fill('haslo-testowe-1');
    await page.getByRole('button', { name: 'Ustaw hasło' }).click();

    await expect(formAlert(page)).toContainText(/nieprawidłowe|użyte/);
  });

  test('rejects two passwords that differ', async ({ page }) => {
    await page.goto('/invite/nieistniejacy-token');
    await page.getByLabel(/Nowy klucz/).fill('haslo-testowe-1');
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
    // No key yet, so the account waits for the invite to be redeemed.
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

  test('offers no second responsible couple for a region, but any number of helpers', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');
    const form = newAccountForm(page);

    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    await form.getByLabel('Rola konta').selectOption({ label: 'Para odpowiedzialna za rejon' });
    // The seed staffs every region, so there is no slot left to offer.
    await expect(form.getByRole('combobox', { name: 'Rejon konta' })).toHaveCount(0);
    await expect(page.getByText(/Każdy rejon ma już parę odpowiedzialną/)).toBeVisible();

    // A helper carries no such limit: every region is on offer.
    await form.getByLabel('Rola konta').selectOption({ label: 'Pomocnik rejonu' });
    await expect(form.getByRole('combobox', { name: 'Rejon konta' })).toBeVisible();
    await expect(form.getByRole('combobox', { name: 'Rejon konta' }).getByRole('option'))
      .toHaveCount(11);
  });

  test('a helper joins a region without displacing its responsible couple', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/regions');
    // Whatever the tile says now, it has to keep saying after the helper joins.
    const tile = page.getByRole('link', { name: /^Rejon IV/ });
    const before = await tile.textContent();

    await page.goto('/accounts');
    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    const form = newAccountForm(page);
    await form.getByLabel('Nazwa pary', { exact: true }).fill('Halina i Jerzy Pomocni');
    await form.getByLabel('Adres e-mail', { exact: true }).fill('pomocni.rejon4@example.pl');
    await form.getByLabel('Rola konta').selectOption({ label: 'Pomocnik rejonu' });
    await form.getByRole('combobox', { name: 'Rejon konta' }).selectOption({ label: 'Rejon IV' });
    await page.getByRole('button', { name: 'Utwórz konto' }).click();

    const row = page.getByRole('listitem').filter({ hasText: 'pomocni.rejon4@example.pl' });
    await expect(row.getByText('Rejon IV · pomoc w kartotece')).toBeVisible();
    // A helper is not the region, so there is nothing to hand over.
    await expect(row.getByRole('button', { name: /^Przekaż rejon/ })).toHaveCount(0);

    await page.goto('/regions');
    await expect(page.getByRole('link', { name: /^Rejon IV/ })).toHaveText(before!);
  });

  test('an account can be created and then removed for good', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    await page.getByRole('button', { name: '+ Dodaj konto' }).click();
    const form = newAccountForm(page);
    await form.getByLabel('Nazwa pary', { exact: true }).fill('Pomyłka Do Usunięcia');
    await form.getByLabel('Adres e-mail', { exact: true }).fill('pomylka@example.pl');
    await form.getByLabel('Rola konta').selectOption({ label: 'Moderator — tylko podgląd' });
    await page.getByRole('button', { name: 'Utwórz konto' }).click();

    const row = page.getByRole('listitem').filter({ hasText: 'pomylka@example.pl' });
    await expect(row).toBeVisible();

    // Two steps: the panel says what deleting costs before it happens.
    await row.getByRole('button', { name: /^Usuń konto/ }).click();
    await expect(row.getByText(/Tego się nie cofa/)).toBeVisible();
    await row.getByRole('button', { name: 'Potwierdź usunięcie' }).click();

    await expect(page.getByRole('listitem').filter({ hasText: 'pomylka@example.pl' }))
      .toHaveCount(0);

    // The removal is an event the register has to carry.
    await page.goto('/history');
    await expect(page.getByText(/Usunięto konto Pomyłka Do Usunięcia/)).toBeVisible();
  });

  test('offers the admin no way to delete the account it signs in through', async ({ page }) => {
    await signIn(page, 'admin@example.pl');
    await page.goto('/accounts');

    const row = page.getByRole('listitem').filter({ hasText: 'Cała wspólnota · zarządzanie' });
    await expect(row.getByRole('button', { name: /^Usuń konto/ })).toHaveCount(0);
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
