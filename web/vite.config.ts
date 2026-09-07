import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Which studio `npm run dev` talks to. The default is the one a person
 * starts by hand next to it; the browser suite overrides it to point at
 * its own throwaway studio over fixture films (e2e/studio.sh). */
const studio = process.env.COMPONIUM_STUDIO || 'http://127.0.0.1:8799';

/* Built output lands where Go embeds it.
 *
 * `internal/studio/webdist` rather than beside the old assets, so the two
 * front ends stay separable while the new one is being built: the existing
 * studio keeps working and serving at /, and this one is reachable at /v2
 * until it is at parity. Swapping them at the end is a one line change in the
 * server rather than a migration.
 */
export default defineConfig({
  plugins: [react()],
  /* Served from the root now. The assets are content-hashed, so an absolute
   * base is safe and keeps a deep link working after a reload. */
  base: '/',
  build: {
    outDir: '../internal/studio/webdist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    /* `npm run dev` talks to a studio started separately, so the front end can
     * hot reload against real scores instead of fixtures. */
    proxy: {
      '/api': studio,
      '/media': studio,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
