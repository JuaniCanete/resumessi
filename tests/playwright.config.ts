import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const TEST_DB_PATH = join(__dirname, '..', 'data', 'test', 'jobdata-test.db');

export default defineConfig({
	timeout: 60000,
	testDir: './e2e',
	outputDir: './test-results',
	workers: 2,
	reporter: [['html', { open: 'on-failure' }], ['list']],
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
		command: `cmd.exe /c "set PORT=3000&& set NODE_ENV=test&& set JOB_DATA_DB_PATH=${TEST_DB_PATH}&& npx tsx start.ts --no-open"`,
		url: 'http://localhost:3000/public/main.html',
		reuseExistingServer: true,
		timeout: 60000,
		cwd: '..',
	},
	globalTeardown: './global-teardown.ts',
});
