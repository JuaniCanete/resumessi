import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

// Setup JSDOM with localStorage
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
	url: 'http://localhost',
	pretendToBeVisual: true,
});

global.window = dom.window as unknown as Window & typeof globalThis;
global.document = dom.window.document;
// global.navigator = dom.window.navigator; // read-only
global.localStorage = dom.window.localStorage;

// Import after DOM setup
import {
	getStorageItem,
	setStorageItem,
	removeStorageItem,
	clearJobDataStorage,
	getLocalScrapingResults,
	setLocalScrapingResults,
	getLocalSavedJobs,
	setLocalSavedJobs,
	getLocalJobDashboard,
	setLocalJobDashboard,
	saveLocalSidebarState,
	loadLocalSidebarState,
	scheduleLocalStorageSync,
	flushLocalStorageSync,
	saveAtsScanResults,
	loadAtsScanResults,
	clearAtsScanResults,
	LOCALSTORAGE_KEYS,
} from '../../public/utils/storage';

function setupDOM(): void {
	dom.window.localStorage.clear();
}

function teardownDOM(): void {
	dom.window.localStorage.clear();
}

beforeEach(setupDOM);
afterEach(teardownDOM);

test('getStorageItem - returns fallback when key not exists', () => {
	const result = getStorageItem('nonexistent', 'default');
	assert.equal(result, 'default');
});

test('getStorageItem - returns parsed value when key exists', () => {
	dom.window.localStorage.setItem('test', JSON.stringify({ a: 1 }));
	const result = getStorageItem('test', { a: 0 });
	assert.deepEqual(result, { a: 1 });
});

test('getStorageItem - returns fallback on parse error', () => {
	dom.window.localStorage.setItem('test', 'invalid json');
	const result = getStorageItem('test', 'fallback');
	assert.equal(result, 'fallback');
});

test('getStorageItem - returns fallback when window undefined', () => {
	const originalWindow = global.window;
	// @ts-expect-error - testing undefined window
	global.window = undefined;
	const result = getStorageItem('test', 'fallback');
	assert.equal(result, 'fallback');
	global.window = originalWindow;
});

test('setStorageItem - sets value in localStorage', () => {
	setStorageItem('test', { b: 2 });
	assert.equal(dom.window.localStorage.getItem('test'), JSON.stringify({ b: 2 }));
});

test('setStorageItem - no-op when window undefined', () => {
	const originalWindow = global.window;
	// @ts-expect-error - testing undefined window
	global.window = undefined;
	setStorageItem('test', { b: 2 });
	assert.ok(true);
	global.window = originalWindow;
});

test('removeStorageItem - removes key from localStorage', () => {
	dom.window.localStorage.setItem('test', 'value');
	removeStorageItem('test');
	assert.equal(dom.window.localStorage.getItem('test'), null);
});

test('removeStorageItem - no-op when window undefined', () => {
	const originalWindow = global.window;
	// @ts-expect-error - testing undefined window
	global.window = undefined;
	removeStorageItem('test');
	assert.ok(true);
	global.window = originalWindow;
});

test('clearJobDataStorage - clears all job data keys', () => {
	dom.window.localStorage.setItem(LOCALSTORAGE_KEYS.scrapingResults('linkedin'), '[]');
	dom.window.localStorage.setItem(LOCALSTORAGE_KEYS.savedJobs('linkedin'), '[]');
	dom.window.localStorage.setItem(LOCALSTORAGE_KEYS.jobDashboard, '[]');
	dom.window.localStorage.setItem(LOCALSTORAGE_KEYS.sidebarState, '{}');
	dom.window.localStorage.setItem(LOCALSTORAGE_KEYS.atsScanResults.resume, '{}');
	dom.window.localStorage.setItem(LOCALSTORAGE_KEYS.atsScanResults.jobfinder, '{}');

	clearJobDataStorage();

	assert.equal(dom.window.localStorage.getItem(LOCALSTORAGE_KEYS.scrapingResults('linkedin')), null);
	assert.equal(dom.window.localStorage.getItem(LOCALSTORAGE_KEYS.savedJobs('linkedin')), null);
	assert.equal(dom.window.localStorage.getItem(LOCALSTORAGE_KEYS.jobDashboard), null);
	assert.equal(dom.window.localStorage.getItem(LOCALSTORAGE_KEYS.sidebarState), null);
	assert.equal(dom.window.localStorage.getItem(LOCALSTORAGE_KEYS.atsScanResults.resume), null);
	assert.equal(dom.window.localStorage.getItem(LOCALSTORAGE_KEYS.atsScanResults.jobfinder), null);
});

test('getLocalScrapingResults - returns empty array when not set', () => {
	const result = getLocalScrapingResults('linkedin');
	assert.deepEqual(result, []);
});

test('setLocalScrapingResults - stores results', () => {
	const results: Array<{
		title: string;
		url: string;
		snippet: string;
		source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
	}> = [{ title: 'Job 1', url: 'https://example.com/1', snippet: '', source: 'linkedin' }];
	setLocalScrapingResults('linkedin', results);
	const stored = getLocalScrapingResults('linkedin');
	assert.deepEqual(stored, results);
});

test('getLocalSavedJobs - with source returns source jobs', () => {
	const jobs: Array<{
		title: string;
		url: string;
		snippet: string;
		source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
	}> = [{ title: 'Saved 1', url: 'https://example.com/1', snippet: '', source: 'linkedin' }];
	setLocalSavedJobs('linkedin', jobs);
	const result = getLocalSavedJobs('linkedin');
	assert.deepEqual(result, jobs);
});

test('getLocalSavedJobs - without source returns combined from both sources', () => {
	const linkedinJobs: Array<{
		title: string;
		url: string;
		snippet: string;
		source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
	}> = [{ title: 'LI Job', url: 'https://example.com/li', snippet: '', source: 'linkedin' }];
	const googleJobs: Array<{
		title: string;
		url: string;
		snippet: string;
		source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
	}> = [{ title: 'Google Job', url: 'https://example.com/google', snippet: '', source: 'google' }];
	setLocalSavedJobs('linkedin', linkedinJobs);
	setLocalSavedJobs('google', googleJobs);
	const result = getLocalSavedJobs();
	assert.equal(result.length, 2);
});

test('setLocalSavedJobs - stores jobs', () => {
	const jobs: Array<{
		title: string;
		url: string;
		snippet: string;
		source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
	}> = [{ title: 'Saved', url: 'https://example.com', snippet: '', source: 'google' }];
	setLocalSavedJobs('google', jobs);
	assert.deepEqual(getLocalSavedJobs('google'), jobs);
});

test('getLocalJobDashboard - returns empty array when not set', () => {
	const result = getLocalJobDashboard();
	assert.deepEqual(result, []);
});

test('setLocalJobDashboard - stores dashboard', () => {
	const jobs: Array<{
		title: string;
		url: string;
		snippet: string;
		source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
		status: 'No News' | 'Interviewing' | 'Offer' | 'Rejected' | 'Hired';
		company?: string;
		postedDate?: string;
	}> = [
		{ title: 'Dashboard Job', url: 'https://example.com', snippet: '', source: 'linkedin', status: 'Interviewing' },
	];
	setLocalJobDashboard(jobs);
	assert.deepEqual(getLocalJobDashboard(), jobs);
});

test('saveLocalSidebarState / loadLocalSidebarState - roundtrip', () => {
	const state = {
		open: true,
		activeTab: 'scraping' as 'scraping' | 'saved' | 'dashboard',
		sourceFilters: { linkedin: true, google: false },
	};
	saveLocalSidebarState(state);
	const loaded = loadLocalSidebarState();
	assert.deepEqual(loaded, state);
});

test('loadLocalSidebarState - returns null when not set', () => {
	const result = loadLocalSidebarState();
	assert.equal(result, null);
});

test('scheduleLocalStorageSync - debounces writes', async () => {
	scheduleLocalStorageSync({
		scrapingResults: {
			linkedin: [
				{
					title: 'Test',
					url: 'https://example.com',
					snippet: '',
					source: 'linkedin' as 'linkedin' | 'google' | 'remoterocketship' | 'user',
				},
			],
			google: [],
		},
	});
	await new Promise(r => setTimeout(r, 150));
	const result = getLocalScrapingResults('linkedin');
	assert.equal(result.length, 1);
	assert.equal(result[0].title, 'Test');
});

test('flushLocalStorageSync - forces immediate write', () => {
	scheduleLocalStorageSync({
		scrapingResults: {
			linkedin: [
				{
					title: 'Flush',
					url: 'https://example.com',
					snippet: '',
					source: 'linkedin' as 'linkedin' | 'google' | 'remoterocketship' | 'user',
				},
			],
			google: [],
		},
	});
	flushLocalStorageSync();
	const result = getLocalScrapingResults('linkedin');
	assert.equal(result.length, 1);
	assert.equal(result[0].title, 'Flush');
});

test('saveAtsScanResults / loadAtsScanResults - resume context', () => {
	const data = { score: 85, tier: 'Strong Match', keywords: ['TypeScript', 'Playwright'] };
	saveAtsScanResults(data, 'resume');
	const loaded = loadAtsScanResults('resume');
	assert.deepEqual(loaded, data);
});

test('saveAtsScanResults / loadAtsScanResults - jobfinder context', () => {
	const data = { score: 90, tier: 'Excellent Match' };
	saveAtsScanResults(data, 'jobfinder');
	const loaded = loadAtsScanResults('jobfinder');
	assert.deepEqual(loaded, data);
});

test('clearAtsScanResults - removes data', () => {
	saveAtsScanResults({ score: 80 }, 'resume');
	assert.ok(loadAtsScanResults('resume'));
	clearAtsScanResults('resume');
	assert.equal(loadAtsScanResults('resume'), null);
});

test('LOCALSTORAGE_KEYS - has expected keys', () => {
	assert.ok(LOCALSTORAGE_KEYS.scrapingResults('linkedin'));
	assert.ok(LOCALSTORAGE_KEYS.scrapingResults('google'));
	assert.ok(LOCALSTORAGE_KEYS.savedJobs('linkedin'));
	assert.ok(LOCALSTORAGE_KEYS.savedJobs('google'));
	assert.ok(LOCALSTORAGE_KEYS.jobDashboard);
	assert.ok(LOCALSTORAGE_KEYS.sidebarState);
	assert.ok(LOCALSTORAGE_KEYS.atsScanResults.resume);
	assert.ok(LOCALSTORAGE_KEYS.atsScanResults.jobfinder);
});
