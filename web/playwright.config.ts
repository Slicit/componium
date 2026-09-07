/* The browser suite: the things vitest cannot reach.
 *
 * There are 749 unit tests and they run in jsdom, which has no layout, no
 * compositing and no real pointer. That is fine for almost everything here,
 * and it is useless for exactly the failures that have actually shipped:
 *
 *   · A list that opened every time and was painted underneath the page,
 *     because an ancestor made a stacking context. jsdom computes no z-index
 *     and stacks nothing, so every assertion about it passed.
 *   · A right-click menu with no keyboard at all. Radix moves focus with real
 *     focus events; jsdom does not deliver them the way the library expects.
 *   · An outside press dismissing a popover. The library inspects a real
 *     PointerEvent's provenance, and a hand-made `new Event('pointerdown')`
 *     carries none of it, so the test proved only that something named
 *     pointerdown had been dispatched.
 *
 * Two servers, both started here and stopped again afterwards. The studio is a
 * throwaway one over fixture films (see e2e/studio.sh), never the real library
 * on this machine, and the front end is the vite dev server pointed at it, so
 * what is tested is the working tree rather than whatever bundle happens to be
 * deployed. That distinction has cost a day here before: a branch tested
 * through the running container was really testing CI's image of main.
 */

import { defineConfig, devices } from '@playwright/test';

const studioPort = Number(process.env.COMPONIUM_E2E_PORT || 8798);
const webPort = Number(process.env.COMPONIUM_E2E_WEB || 5273);

export default defineConfig({
  testDir: './e2e',

  /* One worker, and it is not about this machine being small.
   *
   * Both servers are shared: the specs drive one studio holding one score, so
   * two of them running at once are editing the same document. Stream Composer
   * learned this the expensive way, where nothing surfaced on a 1-CPU dev box
   * and GitHub's 2-CPU runner defaulted to 2 workers and broke immediately.
   * Isolating per spec would mean a studio per worker, which is a real option
   * if this suite ever gets big enough to be slow. It is not yet. */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://127.0.0.1:' + webPort,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/shots/**',
    },
    {
      /* The documentation screenshots. Not part of the suite: they take
       * longer, they write files into docs/, and a red build because a
       * picture moved is a build people stop reading.
       *
       *     npm run shots
       *
       * SwiftShader is what gets WebGL without a GPU or a display, so the
       * room renders in software rather than photographing as a black
       * rectangle. It is slow, and it is a real browser running real
       * three.js, which is the difference between believing the room works
       * and seeing that it does. */
      name: 'shots',
      testMatch: '**/shots/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--enable-unsafe-swiftshader'] },
      },
    },
  ],

  webServer: [
    {
      /* `go run` compiles on the first call, which on a cold cache is most of
       * this timeout. Every later run reuses the build cache and starts in
       * about a second. */
      command: './e2e/studio.sh',
      url: 'http://127.0.0.1:' + studioPort + '/api/media',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      /* --host, because vite 8 binds to [::1] alone by default and the
       * studio it proxies to is on 127.0.0.1. Two loopbacks that do not
       * meet is a confusing way to spend an afternoon. */
      command: 'npm run dev -- --host 127.0.0.1 --port ' + webPort + ' --strictPort',
      url: 'http://127.0.0.1:' + webPort + '/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { COMPONIUM_STUDIO: 'http://127.0.0.1:' + studioPort },
    },
  ],
});
