import { defineConfig } from '@playwright/test';

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
    command: 'cmd.exe /c "set PORT=3001&& npx tsx ..\\start.ts --no-open"',
    url: 'http://localhost:3001/public/main.html',
    reuseExistingServer: false,
    timeout: 60000,
    cwd: '..',
  },
});
