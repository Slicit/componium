/* Sign in once, and let every spec start already inside.
 *
 * The studio is private now: nothing is reachable without a session, so every
 * spec in here would otherwise begin by being redirected to a form. Doing that
 * eighteen times would be eighteen copies of a detail none of them are about.
 *
 * The password is not written down anywhere in this repository, which is the
 * point of how it works: the studio generates one on its first start and
 * leaves it in a file only its owner can read. This reads that file, the same
 * way a person would.
 */

import { chromium, type FullConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_FILE = join(process.cwd(), 'e2e', '.signed-in.json');

export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0]?.use?.baseURL || 'http://127.0.0.1:5273';
  const root = process.env.COMPONIUM_E2E_ROOT || '/tmp/componium-e2e';
  const note = readFileSync(join(root, 'state', 'initial-admin-password.txt'), 'utf8');
  const found = note.match(/^Password:\s*(.+)$/m);
  if (!found) {
    throw new Error("no password line in the studio's first-run note");
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: base });
  await page.goto('/signin');
  await page.fill('input[name=name]', 'admin');
  await page.fill('input[name=password]', found[1].trim());
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 15_000 });
  await page.context().storageState({ path: STATE_FILE });
  await browser.close();
}
