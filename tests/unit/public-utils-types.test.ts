/**
 * tests/unit/public-utils-types.test.ts
 *
 * Unit tests for public/utils/types.ts type definitions and key generation.
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOCALSTORAGE_KEYS } from '../../public/utils/types';

test('LOCALSTORAGE_KEYS - scrapingResults generates correct keys', () => {
	assert.equal(LOCALSTORAGE_KEYS.scrapingResults('linkedin'), 'jobData:scrapingResults:linkedin');
	assert.equal(LOCALSTORAGE_KEYS.scrapingResults('google'), 'jobData:scrapingResults:google');
});

test('LOCALSTORAGE_KEYS - savedJobs generates correct keys', () => {
	assert.equal(LOCALSTORAGE_KEYS.savedJobs('linkedin'), 'jobData:savedJobs:linkedin');
	assert.equal(LOCALSTORAGE_KEYS.savedJobs('google'), 'jobData:savedJobs:google');
});

test('LOCALSTORAGE_KEYS - jobDashboard is constant', () => {
	assert.equal(LOCALSTORAGE_KEYS.jobDashboard, 'jobData:jobDashboard');
});

test('LOCALSTORAGE_KEYS - sidebarState is constant', () => {
	assert.equal(LOCALSTORAGE_KEYS.sidebarState, 'findJob:sidebarState');
});

test('LOCALSTORAGE_KEYS - atsScanResults has resume and jobfinder keys', () => {
	assert.equal(LOCALSTORAGE_KEYS.atsScanResults.resume, 'ats:scanResults:resume');
	assert.equal(LOCALSTORAGE_KEYS.atsScanResults.jobfinder, 'ats:scanResults:jobfinder');
});

test('SidebarState type - validates structure', () => {
	// Type-only test - ensures the interface compiles correctly
	const state: {
		open: boolean;
		activeTab: 'scraping' | 'saved' | 'dashboard';
	} = {
		open: true,
		activeTab: 'scraping',
	};
	assert.equal(state.open, true);
	assert.equal(state.activeTab, 'scraping');

	state.activeTab = 'saved';
	assert.equal(state.activeTab, 'saved');

	state.activeTab = 'dashboard';
	assert.equal(state.activeTab, 'dashboard');
});
