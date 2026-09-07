/* The right-click menu, and specifically its keyboard.
 *
 * The hand-built menu it replaced closed on a click away, on Escape, on a
 * scroll and on the window losing focus, and every bit of that was right. What
 * it had none of was a keyboard: no arrows, no Home or End, no typeahead, and
 * focus never entered it at all. Radix brought all of that, and none of it can
 * be proven in jsdom, where focus does not move on its own and `data-highlighted`
 * is never set. Menu.test.tsx says so in a comment. This is the file that
 * actually checks it.
 *
 * Everything below right-clicks the ruler rather than a lane, because the
 * ruler's menu is the same three items whatever the score contains: a disabled
 * timecode, "Move playhead here", and "Zoom to fit". A lane's menu depends on
 * what was hit, which makes it a worse thing to assert keyboard mechanics on.
 */

import { expect, test, type Page } from '@playwright/test';

const menu = (page: Page) => page.getByRole('menu');
const items = (page: Page) => page.getByRole('menuitem');
const clock = (page: Page) => page.locator('span.tc');

/** Right-click on the timeline ruler, a little way in from the left. */
async function openMenu(page: Page) {
  const surface = page.locator('.tl-surface');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  if (!box) throw new Error('the timeline is not laid out');

  await page.mouse.click(box.x + box.width * 0.4, box.y + 8, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-surface')).toBeVisible();
});

test('a right-click on the ruler opens a menu about that point', async ({ page }) => {
  await openMenu(page);
  await expect(items(page).filter({ hasText: 'Move playhead here' })).toBeVisible();
  await expect(items(page).filter({ hasText: 'Zoom to fit' })).toBeVisible();
});

test('the arrow keys walk it, and step over what cannot be chosen', async ({ page }) => {
  /* The first entry is the timecode of the point that was clicked. It is a
   * label rather than an action, so it is disabled, and a keyboard must skip
   * it rather than park on it. That skipping is the whole reason to use the
   * library instead of a hand-rolled list, and it is invisible to jsdom. */
  await openMenu(page);

  await page.keyboard.press('ArrowDown');
  await expect(items(page).filter({ hasText: 'Move playhead here' })).toHaveAttribute(
    'data-highlighted',
    '',
  );

  await page.keyboard.press('ArrowDown');
  await expect(items(page).filter({ hasText: 'Zoom to fit' })).toHaveAttribute(
    'data-highlighted',
    '',
  );

  /* It stops at the end rather than wrapping round to the top. That is the
   * library's default and it is left alone deliberately: a wrap is only ever
   * noticed as a surprise in a three-item menu, and the two keys that exist
   * for going straight to an end are checked below. */
  await page.keyboard.press('ArrowDown');
  await expect(items(page).filter({ hasText: 'Zoom to fit' })).toHaveAttribute(
    'data-highlighted',
    '',
  );
});

test('Home, End and typeahead all work, which is the rest of what it gained', async ({ page }) => {
  /* Menu.tsx says the menu it replaced had "no arrow keys, no Home or End, no
   * typeahead". The arrows are covered above; this is the remainder of that
   * sentence, and none of it was checked anywhere until there was a browser to
   * check it in. */
  await openMenu(page);

  await page.keyboard.press('End');
  await expect(items(page).filter({ hasText: 'Zoom to fit' })).toHaveAttribute(
    'data-highlighted',
    '',
  );

  await page.keyboard.press('Home');
  /* Home lands on the first item that can be chosen, not on the timecode
   * label above it, which is disabled. */
  await expect(items(page).filter({ hasText: 'Move playhead here' })).toHaveAttribute(
    'data-highlighted',
    '',
  );

  await page.keyboard.press('z');
  await expect(items(page).filter({ hasText: 'Zoom to fit' })).toHaveAttribute(
    'data-highlighted',
    '',
  );
});

test('Enter runs the highlighted item', async ({ page }) => {
  /* Reached entirely from the keyboard: right-click to open (there is no other
   * way to open it), then arrows and Enter. If focus never entered the menu,
   * the Enter goes to the page behind it and the clock does not move. */
  await expect(clock(page)).toHaveText('00:00:00:00');

  await openMenu(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(menu(page)).toBeHidden();
  await expect(clock(page)).not.toHaveText('00:00:00:00');
});

test('Escape closes it without running anything', async ({ page }) => {
  const before = await clock(page).textContent();

  await openMenu(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');

  await expect(menu(page)).toBeHidden();
  await expect(clock(page)).toHaveText(String(before));
});

test('a scroll closes it, because the point it describes has moved', async ({ page }) => {
  /* Radix deliberately keeps a menu open through a scroll, since a menu hanging
   * off a button should travel with it. This one hangs off a point in a
   * timeline, and that point means something else once the timeline has moved
   * under it, so Menu.tsx adds a wheel listener of its own. */
  const box = await openMenu(page);
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.mouse.wheel(0, 120);
  await expect(menu(page)).toBeHidden();
});
