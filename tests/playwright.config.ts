import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 15000,
  testDir: './e2e',
  outputDir: './test-results',
  workers: 4,
  reporter: [['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'cmd.exe /c "tsx ..\\start.ts"',
    url: 'http://localhost:3000/public/main.html',
    reuseExistingServer: true,
    timeout: 60000,
  },
});