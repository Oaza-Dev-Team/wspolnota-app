import { type Page, expect, test } from '@playwright/test';
import { signInAs } from './support/signIn';

const PHONE = { width: 390, height: 844 };

/**
 * Every control on the page that a finger has to hit, with its height.
 * Links sitting inside a paragraph are prose, not controls — making them 44px
 * tall would wreck the line they are part of.
 */
async function controlHeights(page: Page): Promise<{ label: string; height: number }[]> {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, select, input:not([type="hidden"]), a',
    );
    const out: { label: string; height: number }[] = [];
    for (const el of nodes) {
      if (el.tagName === 'A' && el.closest('p')) continue;

      // A checkbox is tapped through its label — that is the area the browser
      // hit-tests — so the label is the control as far as a finger is concerned.
      const wrapper =
        el instanceof HTMLInputElement && el.type === 'checkbox' ? el.closest('label') : null;
      const box = (wrapper ?? el).getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      out.push({
        label: `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
        height: box.height,
      });
    }
    return out;
  });
}

test.describe('touch targets', () => {
  test('no control on the list is shorter than 44px on a phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAs(page, 'admin@example.pl');

    const small = (await controlHeights(page)).filter((c) => c.height < 44);
    expect(small, JSON.stringify(small)).toEqual([]);
  });

  test('no control on the couple card is shorter than 44px on a phone', async ({ page }) => {
    // Below 860px the table gives way to cards, and the row link lives in the
    // table — so the card is opened at desktop width and the window shrinks
    // around the open dialog.
    await signInAs(page, 'admin@example.pl');
    await page.getByRole('link', { name: /^(Edytuj|Podgląd) →$/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.setViewportSize(PHONE);

    const small = (await controlHeights(page)).filter((c) => c.height < 44);
    expect(small, JSON.stringify(small)).toEqual([]);
  });

  test('no control on the accounts view is shorter than 44px on a phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await signInAs(page, 'admin@example.pl');
    await page.goto('/accounts');

    const small = (await controlHeights(page)).filter((c) => c.height < 44);
    expect(small, JSON.stringify(small)).toEqual([]);
  });
});

test.describe('keyboard', () => {
  // The spec asks for an outline rather than a border-colour change: at a
  // glance the two look alike, and only one of them survives a dark row.
  test('a focused field draws an outline, not only a coloured border', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');

    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });

    expect(outline).not.toBeNull();
    expect(outline!.style).not.toBe('none');
    expect(Number.parseFloat(outline!.width)).toBeGreaterThanOrEqual(2);
  });

  test('the list is reachable and operable from the keyboard alone', async ({ page }) => {
    await signInAs(page, 'admin@example.pl');

    // Tab until the search field has focus, then type into it without a mouse.
    for (let i = 0; i < 30; i++) {
      const isSearch = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') === 'Szukaj',
      );
      if (isSearch) break;
      await page.keyboard.press('Tab');
    }
    await page.keyboard.type('Bagińscy');
    await expect(page).toHaveURL(/q=Bagi/);
  });
});

test.describe('console', () => {
  // "Brak błędów w konsoli" is an acceptance point, so it gets a test rather
  // than a glance at devtools.
  test('the main views load without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await signInAs(page, 'admin@example.pl');
    for (const path of ['/couples', '/regions', '/accounts', '/history', '/import']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test('the parish combobox tells assistive technology what it is doing', async ({ page }) => {
  await signInAs(page, 'admin@example.pl');
  await page.goto('/couples');
  await page.getByRole('link', { name: /^(Edytuj|Podgląd) →$/ }).first().click();

  const field = page.getByRole('dialog').getByLabel('Parafia');
  await expect(field).toHaveAttribute('aria-expanded', 'false');

  await field.click();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  // Which row the arrow keys are on has to be readable, not only visible.
  await field.press('ArrowDown');
  const active = await field.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');
});
