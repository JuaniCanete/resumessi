import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import type { ScraperResult, JobData } from '../../src/storage/jobDataSqlite';

const TEST_DATA_DIR = join(process.cwd(), 'data-test-sqlite');
// The module computes DATA_DIR = join(process.cwd(), 'data'), so when we
// chdir into TEST_DATA_DIR, the DB path becomes TEST_DATA_DIR/data/jobdata.db
const TEST_DB_PATH = join(TEST_DATA_DIR, 'data', 'jobdata.db');
const LEGACY_JSON = join(TEST_DATA_DIR, 'data', 'job-data.json');

const originalCwd = process.cwd();

// We'll dynamically import the module after changing cwd so that
// process.cwd() captures the test data dir at import time.
let storage: typeof import('../../src/storage/jobDataSqlite');

before(async () => {
	if (existsSync(TEST_DATA_DIR)) {
		rmSync(TEST_DATA_DIR, { recursive: true, force: true });
	}
	// Create the data/ subdirectory inside TEST_DATA_DIR — the module's
	// getDb() will call ensureDataDir() which creates DATA_DIR = cwd/data
	const internalDataDir = join(TEST_DATA_DIR, 'data');
	mkdirSync(internalDataDir, { recursive: true });

	// Write legacy JSON BEFORE importing the module, so initStorage() will migrate it
	const legacyData = {
		scrapingResults: {
			linkedin: [
				{
					title: 'Legacy LinkedIn Job 1',
					url: 'https://example.com/legacy1',
					snippet: 'Legacy snippet 1',
					source: 'linkedin',
					company: 'Legacy Corp 1',
					saved: true,
					savedAt: '2025-01-01T00:00:00Z',
					applied: false,
					appliedAt: null,
					removed: false,
					status: 'No News',
					column: 'applied',
				},
				{
					title: 'Legacy LinkedIn Job 2',
					url: 'https://example.com/legacy2',
					snippet: 'Legacy snippet 2',
					source: 'linkedin',
					company: 'Legacy Corp 2',
					saved: false,
					applied: false,
					removed: false,
					status: 'No News',
					column: 'applied',
				},
			],
			google: [],
		},
		savedJobs: {
			linkedin: [
				{
					title: 'Legacy Saved Job',
					url: 'https://example.com/saved-legacy',
					snippet: 'Saved snippet',
					source: 'linkedin',
					company: 'Saved Corp',
					saved: true,
					savedAt: '2025-01-01T00:00:00Z',
					applied: false,
					status: 'No News',
					column: 'applied',
				},
			],
			google: [],
		},
		jobDashboard: [
			{
				title: 'Legacy Dashboard Job 1',
				url: 'https://example.com/dash1',
				snippet: 'Dashboard snippet',
				source: 'linkedin',
				company: 'Dash Corp',
				status: 'No News',
				column: 'applied',
				saved: true,
				savedAt: '2025-01-01T00:00:00Z',
				applied: false,
			},
			{
				title: 'Legacy Dashboard Job 2',
				url: '',
				id: 'manual-legacy-1',
				snippet: '',
				source: 'linkedin',
				status: 'No News',
				column: 'screening',
				saved: true,
				savedAt: '2025-01-01T00:00:00Z',
				applied: false,
			},
			{
				title: 'Legacy Dashboard Job 3',
				url: '',
				id: 'manual-legacy-2',
				snippet: '',
				source: 'linkedin',
				status: 'Interviewing',
				column: 'screening',
				saved: true,
				savedAt: '2025-01-01T00:00:00Z',
				applied: true,
				appliedAt: '2025-01-02T00:00:00Z',
			},
		],
	};
	writeFileSync(LEGACY_JSON, JSON.stringify(legacyData));

	// Change to test dir BEFORE importing module so DB_PATH and LEGACY_JSON_FILE
	// resolve relative to the test data dir
	process.chdir(TEST_DATA_DIR);

	// Dynamic import so process.cwd() is captured in the test dir
	storage = await import('../../src/storage/jobDataSqlite');
	storage.initStorage();
});

after(() => {
	storage.closeStorage();
	process.chdir(originalCwd);
	if (existsSync(TEST_DATA_DIR)) {
		try {
			rmSync(TEST_DATA_DIR, { recursive: true, force: true });
		} catch {
			// Directory may still be in use by SQLite WAL — ignore cleanup error
		}
	}
});

beforeEach(() => {
	storage.clearScrapingRunCache();
});

// ─── Migration ────────────────────────────────────────────────────────────
// Must run BEFORE tests that modify the scraping_results table

test('initStorage migrates legacy job-data.json into SQLite tables', async () => {
	assert.ok(existsSync(TEST_DB_PATH), 'SQLite database should be created');

	const data = await storage.loadJobData() as JobData;

	// Verify specific legacy records were migrated (more robust than count checks)
	assert.ok(data.scrapingResults.linkedin.some(j => j.url === 'https://example.com/legacy1'), 'Legacy LinkedIn job 1 should be migrated');
	assert.ok(data.scrapingResults.linkedin.some(j => j.url === 'https://example.com/legacy2'), 'Legacy LinkedIn job 2 should be migrated');
	assert.equal(data.scrapingResults.google.length, 0, 'Should have 0 google scraping results');

	assert.ok(data.savedJobs.linkedin.some(j => j.url === 'https://example.com/saved-legacy'), 'Legacy saved job should be migrated');
	assert.equal(data.savedJobs.google.length, 0, 'Should have 0 google saved jobs');

	assert.equal(data.jobDashboard.length, 3, 'Should have 3 dashboard jobs');
	assert.ok(data.jobDashboard.some(j => j.url === 'https://example.com/dash1'), 'Dashboard job with URL should be migrated');
	assert.ok(data.jobDashboard.some(j => j.id === 'manual-legacy-1'), 'Dashboard job with manual ID should be migrated');
	assert.ok(data.jobDashboard.some(j => j.id === 'manual-legacy-2'), 'Second dashboard job with manual ID should be migrated');
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
	const data = await storage.loadJobData() as JobData;
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
	const updated = dashboard.find(j => j.url === 'https://example.com/url-match');
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
	const updated = dashboard.find(j => j.id === 'manual-123');
	assert.ok(updated, 'Job should exist');
	assert.equal(updated.title, 'Updated via ID');
});

test('updateDashboardJob uses OR clause when both url and id provided', async () => {
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

	await storage.updateDashboardJob('https://example.com/dual', { status: 'Interviewing' }, 'some-other-id');

	const dashboard = await storage.getJobDashboard();
	const updated = dashboard.find(j => j.url === 'https://example.com/dual');
	assert.ok(updated, 'Job should exist');
	assert.equal(updated.status, 'Interviewing');
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
	assert.ok(dashboard.some(j => j.url === 'https://example.com/delete-url'));

	await storage.removeDashboardJob('https://example.com/delete-url');

	dashboard = await storage.getJobDashboard();
	assert.ok(!dashboard.some(j => j.url === 'https://example.com/delete-url'));
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
	assert.ok(dashboard.some(j => j.id === 'manual-delete-789'));

	await storage.removeDashboardJob(undefined, 'manual-delete-789');

	dashboard = await storage.getJobDashboard();
	assert.ok(!dashboard.some(j => j.id === 'manual-delete-789'));
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
	const found = dashboard.find(j => j.title === 'No ID No URL Job');
	assert.ok(found, 'Job should exist');
	assert.ok(found.id, 'Should have a generated ID');
	assert.ok(found.id.startsWith('manual-'), 'Generated ID should match pattern manual-<timestamp>-<random>');
});