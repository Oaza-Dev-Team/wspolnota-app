import { type Page, expect, test } from '@playwright/test';
import { signInAs } from './support/signIn';

/**
 * Next injects its own role="alert" route announcer, so the drawer error has
 * to be looked up inside the dialog or Playwright strict mode sees two.
 */
function drawerAlert(page: Page) {
  return page.getByRole('dialog').getByRole('alert');
}

async function openFirstCard(page: Page) {
  await page.getByRole('link', { name: /^(Edytuj|Podgląd) →$/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('the drawer opens from the list and closes with Escape', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await openFirstCard(page);
  await expect(page).toHaveURL(/card=\d+/);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the drawer closes on the close button and returns to the list', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Zamknij' }).click();
  await expect(page).toHaveURL(/\/couples$/);
});

test('a card can be opened directly by link', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await openFirstCard(page);
  const url = page.url();

  await page.goto(url);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('saving a change updates the list and shows a toast', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await openFirstCard(page);

  const surname = `Testowi${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page.getByText('Zapisano zmiany')).toBeVisible();
  await page.goto(`/couples?q=${surname}`);
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('cancelling discards the change', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await openFirstCard(page);

  const before = await page.getByLabel('Nazwisko').inputValue();
  await page.getByLabel('Nazwisko').fill('PorzuconaZmiana');
  await page.getByRole('button', { name: 'Anuluj' }).click();

  await openFirstCard(page);
  await expect(page.getByLabel('Nazwisko')).toHaveValue(before);
});

test('an empty surname blocks the save', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await openFirstCard(page);
  await page.getByLabel('Nazwisko').fill('   ');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(drawerAlert(page)).toContainText('Podaj nazwisko');
});

test('adding a retreat suggests the first missing degree', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.goto('/couples?formation=none');
  await openFirstCard(page);

  await expect(page.getByText('Brak wpisów o rekolekcjach.')).toBeVisible();
  await page.getByRole('button', { name: '+ Dodaj rekolekcje' }).click();
  await expect(page.getByLabel('Rodzaj rekolekcji 1')).toHaveValue('ONZ_I');
});

test('the name field appears only for INNE and is then required', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.goto('/couples?formation=none');
  await openFirstCard(page);

  await page.getByRole('button', { name: '+ Dodaj rekolekcje' }).click();
  await expect(page.getByLabel('Nazwa rekolekcji 1')).toHaveCount(0);

  await page.getByLabel('Rodzaj rekolekcji 1').selectOption('INNE');
  await expect(page.getByLabel('Nazwa rekolekcji 1')).toBeVisible();

  await page.getByLabel('Rok 1').fill('2020');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(drawerAlert(page)).toContainText('Podaj nazwę rekolekcji');
});

test('a region account cannot move a couple to another region', async ({ page }) => {
  await signInAs(page, 'rejon7@example.pl');
  await openFirstCard(page);
  await expect(page.getByLabel('Rejon')).toBeDisabled();
});

test('the viewer gets no add button and no save', async ({ page }) => {
  await signInAs(page, 'moderator@example.pl');
  await expect(page.getByRole('link', { name: '+ Dodaj parę' })).toHaveCount(0);

  await openFirstCard(page);
  await expect(page.getByRole('button', { name: 'Zapisz' })).toHaveCount(0);
  await expect(page.getByText('Podgląd bez możliwości edycji.')).toBeVisible();
});

test('adding a couple works end to end', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  await expect(page.getByRole('heading', { name: 'Dodaj parę' })).toBeVisible();

  const surname = `Nowi${Date.now() % 100000}`;
  await page.getByLabel('Imię żony').fill('Zofia');
  await page.getByLabel('Imię męża').fill('Jan');
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();
  // Wait for the action to land before navigating away: clicking does not
  // wait for the server action, so a goto here can outrun the commit.
  await expect(page).toHaveURL(/saved=1/);

  await page.goto(`/couples?q=${surname}`);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  // Clean up: list.spec.ts asserts an exact 300, and Playwright runs spec
  // files in name order, so this one would leave it at 301.
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();
  await expect(page).toHaveURL(/deleted=1/);
});

test('deleting a couple removes it from the list', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  const surname = `DoUsuniecia${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page).toHaveURL(/saved=1/);

  await page.goto(`/couples?q=${surname}`);
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();
  // Same reason as the save above: the click does not wait for the action.
  await expect(page).toHaveURL(/deleted=1/);

  await page.goto(`/couples?q=${surname}`);
  await expect(page.getByText('Brak wyników dla podanych kryteriów.').first()).toBeVisible();
});

test('creating a couple can introduce a parish and a circle that do not exist yet', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  await expect(page.getByRole('heading', { name: 'Dodaj parę' })).toBeVisible();

  const stamp = Date.now() % 1000000;
  const surname = `Zakladajacy${stamp}`;
  const parish = `św. Testowa ${stamp}`;
  const city = `Miasteczko ${stamp}`;

  // Scoped to the dialog: the filter bar behind it has selects with the same
  // labels, and Playwright strict mode would see both.
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Nazwisko').fill(surname);

  // The combobox offers to create what nobody answers to yet, and the row
  // appears only once the name is long enough to be one.
  await drawer.getByLabel('Parafia').fill(parish);
  await drawer.getByRole('option', { name: new RegExp(`nowa parafia`) }).click();
  await expect(drawer.getByLabel('Nazwa parafii')).toHaveValue(parish);
  await drawer.getByLabel('Miasto').fill(city);

  await drawer.getByLabel('Krąg').selectOption('__new__');
  await drawer.getByLabel('Numer kręgu').fill('42');
  await drawer.getByLabel('Patron (opcjonalnie)').fill('św. Testowy');

  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Zapisano zmiany' })).toBeVisible();

  // The couple now carries the parish and circle the same save created.
  await page.goto(`/couples?q=${surname}`);
  await expect(page.getByRole('status')).toContainText('1 / ');
  await expect(page.locator('tbody').getByText(parish, { exact: false })).toBeVisible();
  await expect(page.locator('tbody').getByText('42 · św. Testowy')).toBeVisible();

  // Playwright runs the spec files in name order and list.spec asserts an exact
  // 300, so this couple has to go. The parish and circle stay: nothing counts
  // them, and leaving them proves they outlive the couple that introduced them.
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Para usunięta' })).toBeVisible();
});

test('a new circle without a parish is refused with a message, not a crash', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();

  const drawer = page.getByRole('dialog');
  await drawer.getByLabel('Nazwisko').fill(`BezParafii${Date.now() % 1000000}`);
  // Parish left inherited, so the new circle has no parish to take.
  await drawer.getByLabel('Krąg').selectOption('__new__');
  await drawer.getByLabel('Numer kręgu').fill('43');

  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(drawerAlert(page)).toContainText('Nowy krąg musi mieć parafię');
});

/** The hidden input is the contract with the server; the visible field is not. */
function parishValue(page: Page) {
  return page.getByRole('dialog').locator('input[name="parishId"]');
}

test('searching narrows the parish list without losing what is already chosen', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.goto('/couples');
  await openFirstCard(page);

  const drawer = page.getByRole('dialog');
  const field = drawer.getByLabel('Parafia');
  const before = await parishValue(page).inputValue();

  await field.click();
  const all = await drawer.getByRole('option').count();
  // Folded both ways: "gdansk" has to reach "Gdańsk".
  await field.fill('gdansk');
  await expect(drawer.getByRole('option')).not.toHaveCount(all);
  await expect(drawer.getByText(/ z \d+ parafii/)).toBeVisible();

  // Typing is not choosing: nothing is decided until a row is picked.
  expect(await parishValue(page).inputValue()).toBe(before);
});

test('a couple that takes its parish from the circle says so rather than looking empty', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.goto('/couples');
  await openFirstCard(page);

  // Most couples carry no parish of their own. The field has to name that
  // state, and name the parish behind it, instead of showing a blank.
  const drawer = page.getByRole('dialog');
  if ((await parishValue(page).inputValue()) === '') {
    await expect(drawer.getByLabel('Parafia')).toHaveAttribute(
      'placeholder', /jak w kręgu/,
    );
    await expect(drawer.getByText(/Dziedziczy z kręgu:/)).toBeVisible();
  }
});

test('keyboard alone can pick a parish', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.goto('/couples');
  await openFirstCard(page);

  const field = page.getByRole('dialog').getByLabel('Parafia');
  await field.focus();
  await field.press('ArrowDown');
  await field.press('ArrowDown');
  await field.press('Enter');

  // The second row is the first real parish; the first is "— jak w kręgu —".
  await expect(parishValue(page)).not.toHaveValue('');
  await expect(parishValue(page)).not.toHaveValue('__new__');
});

test('Escape closes the list without changing the choice', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.goto('/couples');
  await openFirstCard(page);

  const drawer = page.getByRole('dialog');
  const field = drawer.getByLabel('Parafia');
  const before = await parishValue(page).inputValue();

  await field.click();
  await field.fill('bryg');
  await field.press('ArrowDown');
  await field.press('Escape');

  await expect(drawer.getByRole('listbox')).toHaveCount(0);
  expect(await parishValue(page).inputValue()).toBe(before);
});

test('a deleted couple can be found again and put back', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  const surname = `DoPrzywrocenia${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page).toHaveURL(/saved=1/);

  await page.goto(`/couples?q=${surname}`);
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();
  await expect(page).toHaveURL(/deleted=1/);

  // Off the ordinary list, on the one behind the "Usunięte" toggle.
  await page.goto(`/couples?q=${surname}`);
  await expect(page.getByText('Brak wyników dla podanych kryteriów.').first()).toBeVisible();
  await page.goto(`/couples?q=${surname}&deleted=1`);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await openFirstCard(page);
  await page.getByRole('button', { name: 'Przywróć parę' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Para przywrócona' })).toBeVisible();

  await page.goto(`/couples?q=${surname}`);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  // Put back for good measure, then taken away for good: this file cleans up.
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();
  await expect(page).toHaveURL(/deleted=1/);
});

test('a region account undoes its own deletion without asking the admin', async ({ page }) => {
  await signInAs(page, 'rejon7@example.pl');
  await page.getByRole('link', { name: '+ Dodaj parę' }).click();
  const surname = `RejonowaPomylka${Date.now() % 100000}`;
  await page.getByLabel('Nazwisko').fill(surname);
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page).toHaveURL(/saved=1/);

  await page.goto(`/couples?q=${surname}`);
  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();
  await expect(page).toHaveURL(/deleted=1/);

  await page.goto(`/couples?q=${surname}&deleted=1`);
  await openFirstCard(page);
  // Readable, not correctable: a deleted record is put back before it is edited.
  await expect(page.getByRole('dialog').getByLabel('Nazwisko')).toBeDisabled();
  await page.getByRole('button', { name: 'Przywróć parę' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Para przywrócona' })).toBeVisible();

  await page.goto(`/couples?q=${surname}`);
  await expect(page.locator('tbody tr')).toHaveCount(1);

  await openFirstCard(page);
  await page.getByRole('button', { name: 'Usuń parę' }).click();
  await expect(page).toHaveURL(/deleted=1/);
});

test('the moderator is offered no deleted records at all', async ({ page }) => {
  await signInAs(page, 'moderator@example.pl');
  await expect(page.getByLabel('Usunięte')).toHaveCount(0);
  // A query string is not a permission: it gets its ordinary list, not an error.
  await page.goto('/couples?deleted=1');
  await expect(page.getByRole('status').filter({ hasText: '/ 300' })).toBeVisible();
});
