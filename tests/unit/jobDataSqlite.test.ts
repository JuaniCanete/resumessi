import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import type { ScraperResult, JobData } from '../../src/storage/jobDataSqlite';

const TEST_DATA_DIR = join(process.cwd(), 'data', 'test', 'sqlite-unit');
// The module computes DATA_DIR = join(process.cwd(), 'data'), so when we
// chdir into TEST_DATA_DIR, the DB path becomes TEST_DATA_DIR/jobdata.db

const originalCwd = process.cwd();

// We'll dynamically import the module after changing cwd so that
// process.cwd() captures the test data dir at import time.
let storage: typeof import('../../src/storage/jobDataSqlite');

before(async () => {
	// Clean up any previous test artifacts
	if (existsSync(TEST_DATA_DIR)) {
		rmSync(TEST_DATA_DIR, { recursive: true, force: true });
	}
	mkdirSync(TEST_DATA_DIR, { recursive: true });

	// Change cwd to TEST_DATA_DIR so the module uses our test DB
	process.chdir(TEST_DATA_DIR);
	storage = await import('../../src/storage/jobDataSqlite');
});

after(() => {
	process.chdir(originalCwd);
	// Clean up test database files after tests complete
	try {
		storage.closeStorage();
	} catch {
		// Ignore close errors
	}
	if (existsSync(TEST_DATA_DIR)) {
		try {
			rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
		} catch {
			// Ignore - file may be locked by OS on Windows after close
		}
	}
});

beforeEach(() => {
	storage.clearScrapingRunCache();
});

// ─── setScrapingRun UPSERT preserves flags ──────────────────────────────

test('setScrapingRun UPSERT preserves removed/saved/applied flags from existing row', async () => {
	await storage.setScrapingRun('linkedin', {
		timestamp: '2025-01-01T00:00:00Z',
		query: { role: 'Engineer' },
		runId: 'run-1',
		results: [
			{
				title: 'Test Job',
				url: 'https://example.com/job1',
				snippet: 'Snippet',
				source: 'linkedin',
				saved: true,
				savedAt: '2025-01-01T00:00:00Z',
				applied: true,
				appliedAt: '2025-01-01T00:00:00Z',
				removed: true,
				status: 'No News',
				column: 'applied',
			} as ScraperResult,
		],
	});

	await storage.saveJobFromScraping(
		{
			title: 'Test Job',
			url: 'https://example.com/job1',
			snippet: 'Snippet',
			source: 'linkedin',
		} as ScraperResult,
		'linkedin'
	);

	// Re-run with updated data but without the flags set (should be preserved)
	await storage.setScrapingRun('linkedin', {
		timestamp: '2025-02-01T00:00:00Z',
		query: { role: 'Engineer' },
		runId: 'run-2',
		results: [
			{
				title: 'Test Job Updated',
				url: 'https://example.com/job1',
				snippet: 'Updated snippet',
				source: 'linkedin',
				saved: false,
				applied: false,
				removed: false,
			} as ScraperResult,
		],
	});

	// Use loadJobData() to read directly from DB (bypasses cache)
	const data = (await storage.loadJobData()) as JobData;
	const job = data.scrapingResults.linkedin.find(j => j.url === 'https://example.com/job1');
	assert.ok(job, 'Job should exist in DB');
	assert.equal(job.saved, true, 'saved flag should be preserved from existing row');
	assert.equal(job.applied, true, 'applied flag should be preserved from existing row');
	assert.equal(job.removed, false, 'removed flag should be reset to false on new run');
	assert.equal(job.title, 'Test Job Updated', 'title should come from new run');
	assert.equal(job.snippet, 'Updated snippet', 'snippet should come from new run');
});

test('setScrapingRun inserts new rows when no existing row', async () => {
	await storage.setScrapingRun('google', {
		timestamp: '2025-01-01T00:00:00Z',
		query: { role: 'Designer' },
		runId: 'run-g-1',
		results: [
			{
				title: 'Design Job',
				url: 'https://example.com/design1',
				snippet: 'Design snippet',
				source: 'google',
			} as ScraperResult,
		],
	});

	const run = await storage.getScrapingRun('google');
	assert.ok(run, 'Scraping run should exist');
	assert.equal(run!.results.length, 1);
	assert.equal(run!.results[0].title, 'Design Job');
});

// ─── updateDashboardJob WHERE clause ─────────────────────────────────────

test('updateDashboardJob matches by url when only url is provided', async () => {
	const job: ScraperResult = {
		title: 'URL Match Job',
		url: 'https://example.com/url-match',
		snippet: '',
		source: 'linkedin',
		status: 'No News',
		column: 'applied',
		saved: true,
		applied: false,
		savedAt: '2025-01-01T00:00:00Z',
		appliedAt: '',
	};
	await storage.insertDashboardJob(job);

	await storage.updateDashboardJob('https://example.com/url-match', { title: 'Updated via URL' });

	const dashboard = await storage.getJobDashboard();
	const updated = dashboard.find((j: ScraperResult) => j.url === 'https://example.com/url-match');
	assert.ok(updated, 'Job should exist');
	assert.equal(updated.title, 'Updated via URL');
});

test('updateDashboardJob matches by id (jobId) when only id is provided', async () => {
	const job: ScraperResult = {
		title: 'ID Match Job',
		url: 'https://example.com/id-match',
		id: 'manual-123',
		snippet: '',
		source: 'linkedin',
		status: 'No News',
		column: 'applied',
		saved: true,
		applied: false,
		savedAt: '2025-01-01T00:00:00Z',
		appliedAt: '',
	};
	await storage.insertDashboardJob(job);

	await storage.updateDashboardJob(undefined, { title: 'Updated via ID' }, 'manual-123');

	const dashboard = await storage.getJobDashboard();
	const updated = dashboard.find((j: ScraperResult) => j.id === 'manual-123');
	assert.ok(updated, 'Job should exist');
	assert.equal(updated.title, 'Updated via ID');
});

test('updateDashboardJob uses AND clause when both url and id provided - requires both to match', async () => {
	const job: ScraperResult = {
		title: 'Dual Key Job',
		url: 'https://example.com/dual',
		id: 'dual-id-456',
		snippet: '',
		source: 'linkedin',
		status: 'No News',
		column: 'applied',
		saved: true,
		applied: false,
		savedAt: '2025-01-01T00:00:00Z',
		appliedAt: '',
	};
	await storage.insertDashboardJob(job);

	// Provide mismatched id - should NOT update because AND requires both to match
	await storage.updateDashboardJob('https://example.com/dual', { status: 'Interviewing' }, 'some-other-id');

	let dashboard = await storage.getJobDashboard();
	let updated = dashboard.find((j: ScraperResult) => j.url === 'https://example.com/dual');
	assert.ok(updated, 'Job should exist');
	assert.equal(updated.status, 'No News', 'Status should not change when id mismatches');

	// Now provide correct id - should update
	await storage.updateDashboardJob('https://example.com/dual', { status: 'Interviewing' }, 'dual-id-456');

	dashboard = await storage.getJobDashboard();
	updated = dashboard.find((j: ScraperResult) => j.url === 'https://example.com/dual');
	assert.ok(updated, 'Job should exist');
	assert.equal(updated.status, 'Interviewing', 'Status should update when both url and id match');
});

// ─── removeDashboardJob ──────────────────────────────────────────────────

test('removeDashboardJob deletes by url', async () => {
	const job: ScraperResult = {
		title: 'To Delete By URL',
		url: 'https://example.com/delete-url',
		snippet: '',
		source: 'linkedin',
		status: 'No News',
		column: 'applied',
		saved: true,
		applied: false,
		savedAt: '2025-01-01T00:00:00Z',
		appliedAt: '',
	};
	await storage.insertDashboardJob(job);

	let dashboard = await storage.getJobDashboard();
	assert.ok(dashboard.some((j: ScraperResult) => j.url === 'https://example.com/delete-url'));

	await storage.removeDashboardJob('https://example.com/delete-url');

	dashboard = await storage.getJobDashboard();
	assert.ok(!dashboard.some((j: ScraperResult) => j.url === 'https://example.com/delete-url'));
});

test('removeDashboardJob deletes by id (jobId)', async () => {
	const job: ScraperResult = {
		title: 'To Delete By ID',
		url: 'https://example.com/delete-id',
		id: 'manual-delete-789',
		snippet: '',
		source: 'linkedin',
		status: 'No News',
		column: 'applied',
		saved: true,
		applied: false,
		savedAt: '2025-01-01T00:00:00Z',
		appliedAt: '',
	};
	await storage.insertDashboardJob(job);

	let dashboard = await storage.getJobDashboard();
	assert.ok(dashboard.some((j: ScraperResult) => j.id === 'manual-delete-789'));

	await storage.removeDashboardJob(undefined, 'manual-delete-789');

	dashboard = await storage.getJobDashboard();
	assert.ok(!dashboard.some((j: ScraperResult) => j.id === 'manual-delete-789'));
});

// ─── getJobDashboard generates IDs for rows without them ──────────────────

test('getJobDashboard generates manual IDs for rows missing jobId and url', async () => {
	const job: ScraperResult = {
		title: 'No ID No URL Job',
		url: '',
		snippet: '',
		source: 'linkedin',
		status: 'No News',
		column: 'applied',
		saved: true,
		applied: false,
		savedAt: '2025-01-01T00:00:00Z',
		appliedAt: '',
	};
	await storage.insertDashboardJob(job);

	const dashboard = await storage.getJobDashboard();
	const found = dashboard.find((j: ScraperResult) => j.title === 'No ID No URL Job');
	assert.ok(found, 'Job should exist');
	assert.ok(found.id, 'Should have a generated ID');
	assert.ok(found.id.startsWith('manual-'), 'Generated ID should match pattern manual-<timestamp>-<random>');
});
