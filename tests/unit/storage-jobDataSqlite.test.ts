import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DB_BASE = join(__dirname, '..', '..', 'data', 'test', 'jobdata-unit-test');
const TEST_DB_DIR = join(__dirname, '..', '..', 'data', 'test');

function cleanupTestDb(dbPath: string): void {
	[dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach(f => {
		try {
			rmSync(f, { force: true });
		} catch {
			// ignore
		}
	});
}

function ensureTestDbDir(): void {
	if (!existsSync(TEST_DB_DIR)) {
		mkdirSync(TEST_DB_DIR, { recursive: true });
	}
}

before(() => {
	ensureTestDbDir();
});

after(() => {
	const fs = require('fs');
	if (fs.existsSync(TEST_DB_DIR)) {
		fs.readdirSync(TEST_DB_DIR).forEach((f: string) => {
			if (f.startsWith('jobdata-unit-test')) {
				try {
					rmSync(join(TEST_DB_DIR, f), { force: true });
				} catch {
					// ignore
				}
			}
		});
	}
});

function makeTestDb(): string {
	const testDbPath = `${TEST_DB_BASE}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`;
	return testDbPath;
}

import {
	setScrapingRun,
	updateDashboardJob,
	removeDashboardJob,
	getJobDashboard,
	getScrapingResults,
	updateJobDescription,
	applyToJob,
	initStorage,
	getDb,
	closeDb,
	setDbPathForTesting,
} from '../../src/storage/jobDataSqlite';

function uniqueId(label: string): string {
	return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeJob(
	overrides: Partial<{
		title: string;
		url: string;
		snippet: string;
		source: 'linkedin' | 'google' | 'remoterocketship';
		company: string;
		id: string;
	}> = {}
): {
	title: string;
	url: string;
	snippet: string;
	source: 'linkedin' | 'google' | 'remoterocketship';
	company: string;
	id: string;
} {
	const id = overrides.id || `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	return {
		title: overrides.title || `Test Job ${id}`,
		url: overrides.url || `https://example.com/${id}`,
		snippet: overrides.snippet || 'Test snippet',
		source: (overrides.source || 'linkedin') as 'linkedin' | 'google' | 'remoterocketship',
		company: overrides.company || 'Test Corp',
		id,
	};
}

function makeRun(
	source: 'linkedin' | 'google' | 'remoterocketship',
	jobs: ReturnType<typeof makeJob>[]
): {
	timestamp: string;
	query: Record<string, string>;
	runId: string;
	results: typeof jobs;
} {
	return {
		timestamp: new Date().toISOString(),
		query: { role: 'test', seniority: 'senior' },
		runId: uniqueId('run'),
		results: jobs,
	};
}

function getTestDb(): { dbPath: string; cleanup: () => void } {
	const dbPath = makeTestDb();
	setDbPathForTesting(dbPath);
	initStorage();
	return {
		dbPath,
		cleanup: () => {
			closeDb();
			cleanupTestDb(dbPath);
		},
	};
}

// ─── setScrapingRun tests ───

test('setScrapingRun - UPSERT preserves removed/saved/applied flags from existing row in scraping_results', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();

	await setScrapingRun(job.source, makeRun(job.source, [job]));

	let results = await getScrapingResults(job.source);
	let found = results.find(j => j.url === job.url);
	assert.ok(found);
	assert.equal(found.removed, false);
	assert.equal(found.saved, false);
	assert.equal(found.applied, false);

	// Update flags in scraping_results directly (simulate user action via dashboard)
	// Note: these flags are in scraping_results, not job_dashboard
	const db = getDb();
	assert.ok(db);
	db.prepare('UPDATE scraping_results SET saved = 1 WHERE url = ? AND source = ?').run(job.url, job.source);

	// Re-run scraping with same job
	await setScrapingRun(job.source, makeRun(job.source, [job]));

	// Verify flags preserved in scraping_results
	results = await getScrapingResults(job.source);
	found = results.find(j => j.url === job.url);
	assert.ok(found);
	assert.equal(found.removed, false, 'removed flag should be preserved');
	assert.equal(found.saved, true, 'saved flag should be preserved');
	assert.equal(found.applied, false, 'applied flag should be preserved');

	cleanup();
});

test('setScrapingRun - inserts new rows when no existing row', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();

	await setScrapingRun(job.source, makeRun(job.source, [job]));

	const results = await getScrapingResults(job.source);
	const found = results.find(j => j.url === job.url);
	assert.ok(found);
	assert.equal(found.title, job.title);
	assert.equal(found.url, job.url);
	assert.equal(found.snippet, job.snippet);
	assert.equal(found.source, job.source);

	cleanup();
});

// ─── updateDashboardJob tests (job_dashboard table) ───

test('updateDashboardJob - matches by url when only url is provided', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();
	await setScrapingRun(job.source, makeRun(job.source, [job]));
	await applyToJob(job, job.source);

	await updateDashboardJob(job.url, { status: 'Interviewing', column: 'screening' });

	const dashboard = await getJobDashboard();
	const found = dashboard.find(j => j.url === job.url);
	assert.ok(found);
	assert.equal(found.status, 'Interviewing');
	assert.equal(found.column, 'screening');

	cleanup();
});

test('updateDashboardJob - matches by id (jobId) when only id is provided', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();
	await setScrapingRun(job.source, makeRun(job.source, [job]));
	await applyToJob(job, job.source);

	const dashboard = await getJobDashboard();
	const found = dashboard.find(j => j.url === job.url);
	assert.ok(found?.id);

	await updateDashboardJob(undefined, { status: 'Interviewing', column: 'applied' }, found.id);

	const dashboard2 = await getJobDashboard();
	const found2 = dashboard2.find(j => j.url === job.url);
	assert.ok(found2);
	assert.equal(found2.status, 'Interviewing');
	assert.equal(found2.column, 'applied');

	cleanup();
});

test('updateDashboardJob - uses AND clause when both url and id provided - requires both to match', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();
	await setScrapingRun(job.source, makeRun(job.source, [job]));
	await applyToJob(job, job.source);

	const dashboard = await getJobDashboard();
	const found = dashboard.find(j => j.url === job.url);
	assert.ok(found?.id);

	await updateDashboardJob(job.url, { status: 'Rejected' }, '999999');

	const dashboard2 = await getJobDashboard();
	const found2 = dashboard2.find(j => j.url === job.url);
	assert.ok(found2);
	assert.notEqual(found2.status, 'Rejected');

	cleanup();
});

// ─── removeDashboardJob tests ───

test('removeDashboardJob - deletes by url', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();
	await setScrapingRun(job.source, makeRun(job.source, [job]));
	await applyToJob(job, job.source);

	await removeDashboardJob(job.url);

	const dashboard = await getJobDashboard();
	const found = dashboard.find(j => j.url === job.url);
	assert.ok(!found, 'Job should be deleted');

	cleanup();
});

test('removeDashboardJob - deletes by id (jobId)', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();
	await setScrapingRun(job.source, makeRun(job.source, [job]));
	await applyToJob(job, job.source);

	const dashboard = await getJobDashboard();
	const found = dashboard.find(j => j.url === job.url);
	assert.ok(found?.id);

	await removeDashboardJob(undefined, found.id);

	const dashboard2 = await getJobDashboard();
	const found2 = dashboard2.find(j => j.url === job.url);
	assert.ok(!found2, 'Job should be deleted by id');

	cleanup();
});

// ─── getJobDashboard tests ───

test('getJobDashboard - returns dashboard jobs', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob();
	await setScrapingRun(job.source, makeRun(job.source, [job]));
	await applyToJob(job, job.source);

	const dashboard = await getJobDashboard();
	const found = dashboard.find(j => j.url === job.url);
	assert.ok(found);
	assert.equal(found.title, job.title);

	cleanup();
});

// ─── getScrapingResults tests ───

test('getScrapingResults - returns results for specific source', async () => {
	const { cleanup } = getTestDb();
	const job1 = makeJob({ source: 'linkedin', url: 'https://example.com/linkedin1' });
	const job2 = makeJob({ source: 'google', url: 'https://example.com/google1' });

	await setScrapingRun('linkedin', makeRun('linkedin', [job1]));
	await setScrapingRun('google', makeRun('google', [job2]));

	const linkedinResults = await getScrapingResults('linkedin');
	const googleResults = await getScrapingResults('google');

	assert.equal(linkedinResults.length, 1);
	assert.equal(googleResults.length, 1);
	assert.equal(linkedinResults[0].source, 'linkedin');
	assert.equal(googleResults[0].source, 'google');

	cleanup();
});

// ─── updateJobDescription tests ───

test('updateJobDescription - updates jobDescription field', async () => {
	const { cleanup } = getTestDb();
	const job = makeJob({ url: 'https://example.com/jd-test' });

	await setScrapingRun('linkedin', makeRun('linkedin', [job]));
	await updateJobDescription(job.url, 'This is the full job description');

	const results = await getScrapingResults('linkedin');
	const found = results.find(j => j.url === job.url);
	assert.ok(found);
	assert.equal(found.jobDescription, 'This is the full job description');

	cleanup();
});
