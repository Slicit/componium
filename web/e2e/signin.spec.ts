/* The way in, from outside.
 *
 * Every other spec in here starts signed in, because global-setup.ts signs in
 * once for all of them. This file deliberately does not: a redirect, a form
 * post and a cookie are facts about a browser, and the guard is only worth
 * anything if the signed-out case is the one being checked.
 */

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A context with nothing in it, whatever the rest of the run is carrying.
test.use({ storageState: { cookies: [], origins: [] } });

function firstPassword(): string {
  const root = process.env.COMPONIUM_E2E_ROOT || '/tmp/componium-e2e';
  const note = readFileSync(join(root, 'state', 'initial-admin-password.txt'), 'utf8');
  const found = note.match(/^Password:\s*(.+)$/m);
  if (!found) throw new Error('no password in the first-run note');
  return found[1].trim();
}

test('the studio is not there until you sign in', async ({ page }) => {
  /* Asking for the page itself and being redirected is checked in Go, not
   * here. These specs run against the vite dev server, which serves `/`
   * itself and proxies only what the studio owns, so a redirect the real
   * binary performs never happens in front of this browser. Asserting it
   * here would be asserting a property of the dev server.
   *
   * What is true through the proxy, and is the thing that matters, is that
   * the data is refused. */
  await page.goto('/signin');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  // In a shape a fetch can read, rather than an HTML form for it to fail to
  // parse.
  const answered = await page.evaluate(async () => {
    const r = await fetch('/api/library');
    return { status: r.status, type: r.headers.get('content-type') };
  });
  expect(answered.status).toBe(401);
  expect(answered.type).toContain('json');
});

test('a wrong password does not say which half was wrong', async ({ page }) => {
  await page.goto('/signin');
  await page.fill('input[name=name]', 'admin');
  await page.fill('input[name=password]', 'definitely-not-it');
  await page.click('button[type=submit]');
  const forWrongPassword = await page.textContent('.bad');

  await page.fill('input[name=name]', 'nobody-by-that-name');
  await page.fill('input[name=password]', 'definitely-not-it');
  await page.click('button[type=submit]');
  const forNoSuchPerson = await page.textContent('.bad');

  /* The same words for both. Telling them apart turns a password guess into a
   * list of who works here. */
  expect(forWrongPassword).toBe(forNoSuchPerson);
  expect(forWrongPassword).toContain('do not match');
});

test('signing in gets you a studio, and signing out takes it away', async ({ page }) => {
  /* Where you land is always the front page. Which section you were
   * looking at lives in the hash, and a hash is never sent to a server, so
   * nothing on the other side of the form could know it. Worth stating
   * because it looks like something that was forgotten. */
  await page.goto('/signin');

  await page.fill('input[name=name]', 'admin');
  await page.fill('input[name=password]', firstPassword());
  await page.click('button[type=submit]');

  await expect(page.locator('.nav')).toContainText('admin');
  await expect(page.locator('.tl-surface')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/);

  // And the cookie is genuinely gone, not merely navigated away from.
  const after = await page.evaluate(async () => (await fetch('/api/library')).status);
  expect(after).toBe(401);
});

test('a board fetches its firmware without signing in', async ({ page }) => {
  /* The one thing that must work with no session, because the thing asking is
   * an ESP32 with no cookie jar and no way to be told a password. 404 for a
   * file that is not there is right; 401 would mean no board could ever
   * update itself again. */
  await page.goto('/signin');
  const status = await page.evaluate(async () => (await fetch('/firmware/nothing.bin')).status);
  expect(status).not.toBe(401);
});
