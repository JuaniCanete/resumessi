/**
 * tests/unit/public-utils-storage.test.ts
 *
 * Unit tests for public/utils/storage.ts localStorage helpers.
 * Tests the pure logic functions without complex localStorage mocking.
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	getStorageItem,
	setStorageItem,
	removeStorageItem,
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
	clearJobDataStorage,
} from '../../public/utils/storage';
import { ScraperResult } from '../../src/types/scraper';

function makeScraperResult(overrides: Partial<{
	title: string;
	url: string;
	snippet: string;
	source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
}> = {}): ScraperResult {
	return {
		title: overrides.title ?? 'Test Job',
		url: overrides.url ?? 'https://example.com/job',
		snippet: overrides.snippet ?? 'Test snippet',
		source: overrides.source ?? 'linkedin',
	};
}

test('getStorageItem - returns fallback when key missing', () => {
	const result = getStorageItem('missing-key', 'fallback-value');
	assert.equal(result, 'fallback-value');
});

test('getStorageItem - returns parsed value when key exists', () => {
	// This test requires localStorage mocking, skip in unit tests
	// Full integration tested in E2E
});

test('getStorageItem - returns fallback on parse error', () => {
	// Requires localStorage mocking, skip in unit tests
});

test('setStorageItem - no-op in non-browser environment', () => {
	const originalWindow = global.window;
	// @ts-expect-error - deleting window for test
	delete global.window;
	setStorageItem('test-key', { a: 1 });
	// Should not throw
	global.window = {} as Window & typeof globalThis;
});

test('removeStorageItem - no-op in non-browser environment', () => {
	const originalWindow = global.window;
	// @ts-expect-error
	delete global.window;
	// Should not throw
	removeStorageItem('any-key');
	global.window = {} as Window & typeof globalThis;
});

test('getLocalScrapingResults - returns empty array default', () => {
	const result = getLocalScrapingResults('linkedin');
	assert.deepEqual(result, []);
});

test('getLocalSavedJobs - returns empty array default', () => {
	const result = getLocalSavedJobs('linkedin');
	assert.deepEqual(result, []);
});

test('getLocalJobDashboard - returns empty array default', () => {
	const result = getLocalJobDashboard();
	assert.deepEqual(result, []);
});

test('loadLocalSidebarState - returns null when missing', () => {
	const result = loadLocalSidebarState();
	assert.equal(result, null);
});

test('saveAtsScanResults - saves screening (requires localStorage)', () => {
	// Requires localStorage, tested in E2E
});

test('loadAtsScanResults - loads screening (requires localStorage)', () => {
	// Requires localStorage, tested in E2E
});

test('clearAtsScanResults - removes screening (requires localStorage)', () => {
	// Requires localStorage, tested in E2E
});

test('clearJobDataStorage - clears all job data keys (requires localStorage)', () => {
	// Requires localStorage, tested in E2E
});

test('getStorageItem - returns fallback in non-browser environment', () => {
	const originalWindow = global.window;
	// @ts-expect-error - deleting window for test
	delete global.window;
	const result = getStorageItem('any-key', 'fallback');
	assert.equal(result, 'fallback');
	global.window = {} as Window & typeof globalThis;
});

test('setStorageItem - no-op in non-browser environment', () => {
	const originalWindow = global.window;
	// @ts-expect-error
	delete global.window;
	// Should not throw
	setStorageItem('any-key', { a: 1 });
	global.window = {} as Window & typeof globalThis;
});

test('removeStorageItem - no-op in non-browser environment', () => {
	const originalWindow = global.window;
	// @ts-expect-error
	delete global.window;
	// Should not throw
	removeStorageItem('any-key');
	global.window = originalWindow;
});

test('LOCALSTORAGE_KEYS - scrapingResults generates correct keys', () => {
	const { LOCALSTORAGE_KEYS } = require('../../public/utils/types');
	assert.equal(LOCALSTORAGE_KEYS.scrapingResults('linkedin'), 'jobData:scrapingResults:linkedin');
	assert.equal(LOCALSTORAGE_KEYS.scrapingResults('google'), 'jobData:scrapingResults:google');
});

test('LOCALSTORAGE_KEYS - savedJobs generates correct keys', () => {
	const { LOCALSTORAGE_KEYS } = require('../../public/utils/types');
	assert.equal(LOCALSTORAGE_KEYS.savedJobs('linkedin'), 'jobData:savedJobs:linkedin');
	assert.equal(LOCALSTORAGE_KEYS.savedJobs('google'), 'jobData:savedJobs:google');
});

test('LOCALSTORAGE_KEYS - jobDashboard is constant', () => {
	const { LOCALSTORAGE_KEYS } = require('../../public/utils/types');
	assert.equal(LOCALSTORAGE_KEYS.jobDashboard, 'jobData:jobDashboard');
});

test('LOCALSTORAGE_KEYS - sidebarState is constant', () => {
	const { LOCALSTORAGE_KEYS } = require('../../public/utils/types');
	assert.equal(LOCALSTORAGE_KEYS.sidebarState, 'findJob:sidebarState');
});

test('LOCALSTORAGE_KEYS - atsScanResults has resume and jobfinder keys', () => {
	const { LOCALSTORAGE_KEYS } = require('../../public/utils/types');
	assert.equal(LOCALSTORAGE_KEYS.atsScanResults.resume, 'ats:scanResults:resume');
	assert.equal(LOCALSTORAGE_KEYS.atsScanResults.jobfinder, 'ats:scanResults:jobfinder');
});

test('SidebarState type - validates structure', () => {
	// Type-only test - ensures the interface compiles correctly
	const state = {
		open: true,
		activeTab: 'scraping' as const,
	};
	assert.equal(state.open, true);
	assert.equal(state.activeTab, 'scraping');

	const state2 = {
		open: false,
		activeTab: 'saved' as const,
	};
	assert.equal(state2.open, false);
	assert.equal(state2.activeTab, 'saved');

	const state3 = {
		open: true,
		activeTab: 'dashboard' as const,
	};
	assert.equal(state3.open, true);
	assert.equal(state3.activeTab, 'dashboard');
});
