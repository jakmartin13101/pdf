import { defineConfig } from '@playwright/test';

// The README screenshots (docs/*.png): `npm run docs:screenshots`. Not part of the normal e2e run.
export default defineConfig({
  testDir: './docs-screens',
  timeout: 120_000,
  // Kept apart from the e2e run's results (each run clears its own folder).
  outputDir: 'test-results/docs',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
    // A Pro license (signed with the test key), as in the e2e tests.
    storageState: 'e2e/fixtures/pro-license.state.json',
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
