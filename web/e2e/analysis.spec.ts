/* The wind gate, from the slider to the file and back.
 *
 * The whole point of the setting is that it survives: a number that reverts on
 * reload is worse than no setting, because the person believes they changed
 * something. Nothing in vitest can check that, because the round trip is a
 * browser, an HTTP handler and a file on disk, and mocking any of the three
 * would be testing the mock.
 *
 * Safe to write here: the studio under test is the throwaway one over fixture
 * films, and its scores directory is built from scratch on every run.
 */

import { expect, test } from '@playwright/test';

const gate = (page: import('@playwright/test').Page) =>
  page.getByRole('slider', { name: 'Wind gate' });

test('the wind gate survives a reload', async ({ page }) => {
  await page.goto('/#/admin/analysis');
  await expect(gate(page)).toBeVisible();

  // It starts where the composer's own constant is, which is the thing the
  // Go test cross-checks against wind.py.
  await expect(page.getByText('0.25', { exact: true })).toBeVisible();

  await gate(page).fill('0.45');
  await expect(page.getByText(/applies to the next analysis/)).toBeVisible();

  await page.reload();
  await expect(gate(page)).toHaveValue('0.45');

  // And the studio agrees, which is what the composer will be told.
  const said = await page.evaluate(() => fetch('/api/analysis').then((r) => r.json()));
  expect(said).toMatchObject({ windGate: 0.45 });
});

test('putting it back to the default is offered, and only when it is not', async ({ page }) => {
  await page.goto('/#/admin/analysis');
  await expect(gate(page)).toBeVisible();

  await gate(page).fill('0.6');
  const reset = page.getByRole('button', { name: /reset to 0.25/ });
  await expect(reset).toBeEnabled();
  await reset.click();

  await expect(gate(page)).toHaveValue('0.25');
  await expect(page.getByRole('button', { name: 'default' })).toBeDisabled();
});
