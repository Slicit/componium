/* The film picker, driven by a browser that has pixels and pointers.
 *
 * FilmPicker.test.tsx covers what it filters and what it announces, and it can
 * do that in jsdom because none of it depends on layout. What is here is the
 * remainder: whether the list is actually reachable once it is open, and
 * whether the ways out of it work. Both had a test that passed while the
 * feature was broken.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const trigger = (page: Page) => page.getByRole('button', { name: /^Film:/ });
const search = (page: Page) => page.getByRole('combobox', { name: 'Search films' });
const list = (page: Page) => page.getByRole('listbox', { name: 'Films' });

/* Scoped to the picker's own list, and that is not fussiness. A native
 * `<select>` gives every `<option>` inside it the option role, and the version
 * picker sitting next to this one in the same bar has several. An unscoped
 * getByRole('option') counts those too, and the failure it produces is a
 * number two out rather than anything that names the cause. */
const options = (page: Page) => list(page).getByRole('option');

async function openPicker(page: Page) {
  await trigger(page).click();
  await expect(search(page)).toBeFocused();
  return list(page);
}

/** What the browser says is painted at an element's own centre. */
async function topmostAt(where: Locator): Promise<string> {
  const box = await where.boundingBox();
  if (!box) throw new Error('no box: the element is not laid out');
  return where.page().evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x as number, y as number);
      return el ? el.tagName.toLowerCase() + ':' + (el.textContent || '') : 'nothing';
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(trigger(page)).toBeVisible();
});

test('the list is on top of the page, not underneath it', async ({ page }) => {
  /* The regression this suite was built for. `.nav` is position:sticky with a
   * z-index, which makes a stacking context, so the list's own z-index of 50
   * was capped at the bar's 5 while the stage, the room and the timeline sit
   * at 20 through 60 in the root context. It opened every time. It was never
   * visible.
   *
   * Nothing about that is observable without compositing, which is why the
   * check is the browser's own hit test rather than a style assertion: ask
   * what is painted at the option's centre and insist it is the option. A
   * z-index assertion would have passed on the broken version, since the
   * value was right and the context it applied in was not. */
  await openPicker(page);

  const option = options(page).first();
  await expect(option).toBeVisible();

  const label = String(await option.textContent());
  expect(await topmostAt(option)).toContain(label.slice(0, 20));

  /* And again through actionability, which is what a person does: a hover
   * that lands on something else times out here. */
  await option.hover();
});

test('filters as you type, and says how many are left', async ({ page }) => {
  await openPicker(page);
  await expect(options(page)).toHaveCount(5);

  /* Mid-name, because film files are named for releases and the part a person
   * remembers is rarely at the front. */
  await search(page).fill('scargiver');
  await expect(options(page)).toHaveCount(1);
  await expect(options(page).first()).toContainText('Scargiver');
  await expect(page.getByText('1 of 5')).toBeVisible();

  await search(page).fill('nothing named this');
  await expect(options(page)).toHaveCount(0);
  await expect(page.getByText(/nothing matches/)).toBeVisible();
});

test('the arrow keys move the highlight while the cursor stays in the search box', async ({
  page,
}) => {
  /* The combobox pattern, and the reason this component keeps its own key
   * handling instead of the library's roving focus: the caret must never leave
   * the input, or the next character typed goes nowhere. */
  await openPicker(page);

  const first = options(page).nth(0);
  const second = options(page).nth(1);
  await expect(first).toHaveClass(/is-at/);

  await page.keyboard.press('ArrowDown');
  await expect(second).toHaveClass(/is-at/);
  await expect(search(page)).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(first).toHaveClass(/is-at/);
  await expect(search(page)).toBeFocused();
});

test('closes when the press starts somewhere else', async ({ page }) => {
  /* The gap FilmPicker.test.tsx wrote down and could not close. Radix watches
   * a real pointer sequence and inspects where it came from; jsdom produces
   * nothing that satisfies it, so the unit test that claimed this was really
   * only checking that an event named pointerdown had been dispatched. */
  await openPicker(page);
  await expect(list(page)).toBeVisible();

  await page.mouse.click(4, 400);
  await expect(list(page)).toBeHidden();
});

test('closes on Escape, and hands focus back to the control that opened it', async ({ page }) => {
  await openPicker(page);
  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
});

test('Tab leaves rather than trapping the keyboard', async ({ page }) => {
  /* jsdom moves focus for nobody, so a Tab keydown there proves only that a
   * handler ran. The popover is deliberately non-modal, because it sits in the
   * toolbar and the studio behind it stays usable while it is open. */
  await openPicker(page);
  await page.keyboard.press('Tab');
  await expect(search(page)).not.toBeFocused();
});

test('forgets the query, so it opens ready for a fresh search', async ({ page }) => {
  await openPicker(page);
  await search(page).fill('wanted');
  await expect(options(page)).toHaveCount(1);

  await page.keyboard.press('Escape');
  /* Wait for it to be gone before opening it again. Not ceremony: closing
   * returns focus to the trigger, and that restoration is asynchronous, so
   * reopening inside the same few milliseconds gets the search box focused
   * and then unfocused again by the previous close finishing. A person
   * cannot click that fast, and this is the one place a test can. */
  await expect(list(page)).toBeHidden();
  await openPicker(page);

  await expect(search(page)).toHaveValue('');
  await expect(options(page)).toHaveCount(5);
});
