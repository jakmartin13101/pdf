import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
    // Tests run with a Pro license (signed with the test key); e2e/license.spec.ts starts without one.
    storageState: 'e2e/fixtures/pro-license.state.json',
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
