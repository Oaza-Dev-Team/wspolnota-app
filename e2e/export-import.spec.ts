import ExcelJS from 'exceljs';
import { type Page, expect, test } from '@playwright/test';
import { COLUMNS } from '../src/lib/couples/columns';

const PASSWORD = 'kartoteka123';

async function signIn(page: Page, email: string) {
  await page.goto('/logowanie');
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByLabel('Hasło').fill(PASSWORD);
  await page.getByRole('button', { name: 'Zaloguj się' }).click();
  await expect(page).toHaveURL(/\/pary/);
}

/** A workbook in memory, handed straight to the file input as bytes. */
async function sheetWith(rows: string[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Kartoteka');
  sheet.addRow(COLUMNS.map((c) => c.header));
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function row(surname: string): string[] {
  const cells: string[] = new Array(COLUMNS.length).fill('');
  cells[1] = surname;
  cells[2] = 'Zofia';
  cells[3] = 'Jan';
  cells[6] = 'VII';
  return cells;
}

async function upload(page: Page, buffer: Buffer) {
  await page.getByLabel('Plik XLSX').setInputFiles({
    name: 'kartoteka.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await page.getByRole('button', { name: 'Sprawdź plik' }).click();
  await expect(page.getByRole('heading', { name: 'Podgląd' })).toBeVisible();
}

test('the export downloads an xlsx carrying the current filters', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/pary?region=3');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Eksport XLSX' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^kartoteka-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('the export link keeps the filters in its address', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/pary?region=3&formation=ONZ_I');
  const href = await page.getByRole('link', { name: 'Eksport XLSX' }).getAttribute('href');
  expect(href).toContain('region=3');
  expect(href).toContain('formation=ONZ_I');
});

test('a region account may export', async ({ page }) => {
  await signIn(page, 'rejon7@example.pl');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Eksport XLSX' }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('.xlsx');
});

test('import is admin-only', async ({ page }) => {
  await signIn(page, 'rejon7@example.pl');
  await expect(page.getByRole('link', { name: 'Import' })).toHaveCount(0);
  await page.goto('/import');
  await expect(page).toHaveURL(/\/pary/);
});

test('the template downloads for admin', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/import');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Pobierz pusty szablon' }).click(),
  ]);

  expect(download.suggestedFilename()).toBe('kartoteka-szablon.xlsx');
});

// The preview is the safety net the checklist asks for: nothing is written
// until it has been read, so these tests stop short of confirming and leave
// the seeded 300 couples untouched. Applying is covered in import.int.test.ts.
test('a valid file previews as ready to import', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/import');
  await upload(page, await sheetWith([row('Podgladowi1'), row('Podgladowi2')]));

  await expect(page.getByText('Do dodania: 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zatwierdź import' })).toBeVisible();
});

test('a broken row is reported with its number and blocks the import', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/import');
  await upload(page, await sheetWith([row('Podgladowi3'), row('')]));

  // Row 1 is the header, so the offending second data row is sheet row 3.
  await expect(page.getByText('wiersz 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zatwierdź import' })).toHaveCount(0);
});

// The export register is a GDPR obligation, so it gets a test rather than a
// line in a document claiming it works.
test('an export leaves an entry in the change history', async ({ page }) => {
  await signIn(page, 'admin@example.pl');
  await page.goto('/pary?region=3');

  await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Eksport XLSX' }).click(),
  ]);

  await page.goto('/historia');
  const newest = page.getByRole('listitem').first();
  await expect(newest).toContainText('eksport');
  await expect(newest).toContainText('Wyeksportowano');
});
