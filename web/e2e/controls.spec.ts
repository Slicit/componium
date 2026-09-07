/* The controls bar is one row, and should look like one.
 *
 * There were three heights on it and none of them was a decision: the timecode
 * came out 27px, the toggles 21px and Undo, Redo and Saved 25px, each being
 * whatever its own font size and padding happened to add up to. Nobody chose
 * that and everybody could see it.
 *
 * It can only be checked here. jsdom has no layout, so every element in it is
 * zero pixels tall and a test of this in vitest would be a test of nothing.
 * The measurement below is the browser's own, after real fonts have loaded,
 * which is also the thing that makes a padding-based agreement fragile: three
 * paddings that add up to the same number today stop agreeing the moment a
 * font does.
 */

import { expect, test } from '@playwright/test';

test('every control in the bar is the same height', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('.controls')).toBeVisible();

  /* The rig picker hides itself when there is only one rig, which is right and
   * meant it went unchecked for a long time. e2e/studio.sh puts two on the
   * shelf so that this sees the select. */
  await expect(page.locator('.controls select')).toBeVisible();

  const heights = await page.evaluate(() => {
    const bar = document.querySelector('.controls');
    if (!bar) return [];
    const out: { what: string; h: number }[] = [];
    for (const el of Array.from(bar.querySelectorAll('button, select, .tc'))) {
      /* The saved-viewports and colour-trim panels open inside the bar and are
       * not part of the row; their buttons are free to be their own size. */
      if (el.closest('.views-panel') || el.closest('.trim-panel')) continue;
      const box = el.getBoundingClientRect();
      if (box.height === 0) continue;
      out.push({
        what: (el.textContent || el.tagName).trim().slice(0, 16),
        h: Math.round(box.height * 10) / 10,
      });
    }
    return out;
  });

  expect(heights.length).toBeGreaterThan(8);
  const distinct = [...new Set(heights.map((h) => h.h))];
  expect({ distinct, heights }).toMatchObject({ distinct: [27] });
});

test('a text field is not a white box in a dark application', async ({ page }) => {
  /* `select` and `button` were styled and `input` was not, so every text and
   * number field rendered in the browser's own chrome. Asserting the computed
   * colour rather than the presence of a rule, because the rule that matters
   * is whichever one actually wins. */
  await page.goto('/#/admin/devices');
  const field = page.locator('input[type="text"]').first();
  await expect(field).toBeVisible();

  const seen = await field.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, background: cs.backgroundColor };
  });

  /* Both are read back as rgb(), so compare on luminance rather than on a
   * string: the text must be light and the ground behind it dark. Anything
   * else means the browser default is showing through. */
  const lum = (c: string) => {
    const [r, g, b] = (c.match(/\d+/g) || ['0', '0', '0']).map(Number);
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  expect({ ...seen, textLum: lum(seen.color), bgLum: lum(seen.background) }).toMatchObject({
    color: seen.color,
  });
  expect(lum(seen.color)).toBeGreaterThan(150);
  expect(lum(seen.background)).toBeLessThan(60);
});

test('no field is narrower than the value in it', async ({ page }) => {
  /* Caught by looking at a screenshot: the latency field held 0.02 and showed
   * 0.0. Its width was written as `7ch` against a field that had no padding,
   * and the base field rule added 8px each side, which `border-box` then took
   * out of the characters rather than adding to them.
   *
   * A value truncated inside a box that still looks like it fits is the worst
   * shape this can take, because there is nothing to notice. `scrollWidth`
   * against `clientWidth` is the browser answering directly, and it needs a
   * browser: jsdom lays nothing out and reports both as zero.
   */
  await page.goto('/#/admin/devices');
  await expect(page.locator('input[type="number"]').first()).toBeVisible();

  const clipped = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).flatMap((el) => {
      const input = el as HTMLInputElement;
      if (['range', 'checkbox', 'radio', 'color', 'file'].includes(input.type)) return [];
      if (!input.value || input.offsetParent === null) return [];
      /* One pixel of slack: a caret and sub-pixel text measurement can put
       * scrollWidth a hair over clientWidth on a field that is genuinely fine. */
      return input.scrollWidth > input.clientWidth + 1
        ? [{ value: input.value, shown: input.clientWidth, needs: input.scrollWidth }]
        : [];
    }),
  );

  expect(clipped).toEqual([]);
});
