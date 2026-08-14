import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const TEST_DB_PATH = join(__dirname, '..', 'data', 'jobdata-test.db');

export default defineConfig({
  timeout: 15000,
  testDir: './e2e',
  outputDir: './test-results',
  workers: 2,
  reporter: [['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: `cmd.exe /c "set PORT=3001&& set JOB_DATA_DB_PATH=${TEST_DB_PATH}&& npx tsx ..\\start.ts --no-open"`,
    url: 'http://localhost:3001/public/main.html',
    reuseExistingServer: false,
    timeout: 60000,
  },
  globalTeardown: './global-teardown.ts',
});
