import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/prepare.ts'],
  // The suite logs in and out against one shared database; parallel workers
  // would invalidate each other's sessions.
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:3000' },
  // The first render of a route pays for the cold cache: the list queries three
  // hundred couples. Five seconds is enough once warm and not on the first hit,
  // which showed up as a failure that moved between files rather than as the
  // slowness it is.
  expect: { timeout: 15_000 },
  webServer: {
    // A production build rather than `next dev`: on-demand compilation makes
    // the first hit on a route take seconds, which shows up as flaky timeouts
    // rather than as the slowness it is. This also tests what actually ships.
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000/login',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
