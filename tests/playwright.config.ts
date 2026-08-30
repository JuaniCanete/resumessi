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
		//Port 3001 must NOT change: 3000 is the user-facing app port (see webServer below).
		baseURL: 'http://localhost:3001',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		video: 'retain-on-failure',
	},
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium' } },
	],
	webServer: {
		//cross-env sets env vars identically on cmd/PowerShell/sh (CI runs Linux).
		//Port 3001 must NOT change: 3000 is the user-facing app port.
		command: `npx cross-env PORT=3001 NODE_ENV=test JOB_DATA_DB_PATH="${TEST_DB_PATH}" npx tsx start.ts --no-open`,
		url: 'http://localhost:3001/public/main.html',
		reuseExistingServer: false,
		timeout: 60000,
		//Resolved relative to the config file location (tests/), NOT the process cwd —
		//'..' points to the repo root where start.ts lives.
		cwd: join(__dirname, '..'),
	},
	globalTeardown: './global-teardown.ts',
});
