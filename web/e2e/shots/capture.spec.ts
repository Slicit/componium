/* The screenshots in docs/, captured rather than drawn.
 *
 *     cd web && npm run shots
 *
 * It runs as a Playwright project rather than a script because everything a
 * capture needs was already built for the browser suite: a throwaway studio
 * over fixture films, a dev server pointed at it, and a pinned Chromium the
 * lockfile controls. A separate script would be a second copy of all three,
 * and the older one (hack/shoot-studio.sh) shows how that ages: it greps for
 * an asset the studio stopped serving.
 *
 * These are assertions as well as captures. A page that fails to render is a
 * failing test here rather than a plausible-looking PNG nobody examines, which
 * is the failure mode of every screenshot pipeline: shoot-studio.sh twice
 * photographed a stale process, and both images looked fine.
 *
 * What is deliberately not done: no visual regression comparison. These images
 * are for people reading the documentation. Tying a build to their pixels
 * would make every legitimate design change a red build, and the honest
 * version of that check is the hit test in picker.spec.ts.
 */

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), '..', 'docs', 'screenshots');

test.use({ viewport: { width: 1440, height: 900 } });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** Go somewhere, wait for it to actually be there, and shoot it. */
async function shoot(page: Page, hash: string, name: string, ready: () => Promise<void>) {
  await page.goto('/' + hash);
  await ready();
  /* The room is WebGL through SwiftShader here, which is software and slow.
   * Without this the first frames land in the picture. */
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, name + '.png') });
}

test('the studio', async ({ page }) => {
  await shoot(page, '#/', 'studio', async () => {
    await expect(page.locator('.tl-surface')).toBeVisible();
    await expect(page.locator('span.tc')).toBeVisible();
  });
});

test('the film picker, searching', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: /^Film:/ })).toBeVisible();
  await page.getByRole('button', { name: /^Film:/ }).click();
  await page.getByRole('combobox', { name: 'Search films' }).fill('20');
  await expect(page.getByRole('listbox', { name: 'Films' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'studio-film-picker.png') });
});

test('the right-click menu', async ({ page }) => {
  await page.goto('/#/');
  const surface = page.locator('.tl-surface');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (!box) throw new Error('the timeline is not laid out');
  await page.mouse.click(box.x + box.width * 0.4, box.y + 8, { button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'studio-menu.png') });
});

test('the library', async ({ page }) => {
  await shoot(page, '#/library', 'library', async () => {
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Filter films' })).toBeVisible();
  });
});

for (const [page_, label] of [
  ['rigs', 'Rigs'],
  ['devices', 'Devices'],
  ['boards', 'Boards'],
  ['firmware', 'Firmware'],
  ['room', 'Room preview'],
] as const) {
  test('admin: ' + label, async ({ page }) => {
    await shoot(page, '#/admin/' + page_, 'admin-' + page_, async () => {
      /* Every admin page starts at h2, which is a house rule with a test of
       * its own. Waiting on it here means a page that renders an error
       * instead of itself does not get photographed. */
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    });
  });
}
