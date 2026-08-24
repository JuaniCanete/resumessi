import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALSTORAGE_KEYS } from '../../public/utils/types';

test('LOCALSTORAGE_KEYS.scrapingResults - generates correct key for linkedin', () => {
	const key = LOCALSTORAGE_KEYS.scrapingResults('linkedin');
	assert.equal(key, 'jobData:scrapingResults:linkedin');
});

test('LOCALSTORAGE_KEYS.scrapingResults - generates correct key for google', () => {
	const key = LOCALSTORAGE_KEYS.scrapingResults('google');
	assert.equal(key, 'jobData:scrapingResults:google');
});

test('LOCALSTORAGE_KEYS.savedJobs - generates correct key for linkedin', () => {
	const key = LOCALSTORAGE_KEYS.savedJobs('linkedin');
	assert.equal(key, 'jobData:savedJobs:linkedin');
});

test('LOCALSTORAGE_KEYS.savedJobs - generates correct key for google', () => {
	const key = LOCALSTORAGE_KEYS.savedJobs('google');
	assert.equal(key, 'jobData:savedJobs:google');
});

test('LOCALSTORAGE_KEYS.jobDashboard - returns correct static key', () => {
	assert.equal(LOCALSTORAGE_KEYS.jobDashboard, 'jobData:jobDashboard');
});

test('LOCALSTORAGE_KEYS.sidebarState - returns correct static key', () => {
	assert.equal(LOCALSTORAGE_KEYS.sidebarState, 'findJob:sidebarState');
});

test('LOCALSTORAGE_KEYS.atsScanResults - has resume key', () => {
	assert.equal(LOCALSTORAGE_KEYS.atsScanResults.resume, 'ats:scanResults:resume');
});

test('LOCALSTORAGE_KEYS.atsScanResults - has jobfinder key', () => {
	assert.equal(LOCALSTORAGE_KEYS.atsScanResults.jobfinder, 'ats:scanResults:jobfinder');
});

test('LOCALSTORAGE_KEYS - all keys have expected prefix patterns', () => {
	// scrapingResults keys
	assert.ok(LOCALSTORAGE_KEYS.scrapingResults('linkedin').startsWith('jobData:scrapingResults:'));
	assert.ok(LOCALSTORAGE_KEYS.scrapingResults('google').startsWith('jobData:scrapingResults:'));

	// savedJobs keys
	assert.ok(LOCALSTORAGE_KEYS.savedJobs('linkedin').startsWith('jobData:savedJobs:'));
	assert.ok(LOCALSTORAGE_KEYS.savedJobs('google').startsWith('jobData:savedJobs:'));

	// atsScanResults keys
	assert.ok(LOCALSTORAGE_KEYS.atsScanResults.resume.startsWith('ats:scanResults:'));
	assert.ok(LOCALSTORAGE_KEYS.atsScanResults.jobfinder.startsWith('ats:scanResults:'));

	// static keys
	assert.ok(LOCALSTORAGE_KEYS.jobDashboard.startsWith('jobData:'));
	assert.ok(LOCALSTORAGE_KEYS.sidebarState.startsWith('findJob:'));
});

test('LOCALSTORAGE_KEYS - keys are unique', () => {
	const keys = [
		LOCALSTORAGE_KEYS.scrapingResults('linkedin'),
		LOCALSTORAGE_KEYS.scrapingResults('google'),
		LOCALSTORAGE_KEYS.savedJobs('linkedin'),
		LOCALSTORAGE_KEYS.savedJobs('google'),
		LOCALSTORAGE_KEYS.jobDashboard,
		LOCALSTORAGE_KEYS.sidebarState,
		LOCALSTORAGE_KEYS.atsScanResults.resume,
		LOCALSTORAGE_KEYS.atsScanResults.jobfinder,
	];

	const uniqueKeys = new Set(keys);
	assert.equal(uniqueKeys.size, keys.length);
});

test('LOCALSTORAGE_KEYS - function keys produce different values for different sources', () => {
	assert.notEqual(LOCALSTORAGE_KEYS.scrapingResults('linkedin'), LOCALSTORAGE_KEYS.scrapingResults('google'));
	assert.notEqual(LOCALSTORAGE_KEYS.savedJobs('linkedin'), LOCALSTORAGE_KEYS.savedJobs('google'));
});

test('LOCALSTORAGE_KEYS - as const preserves readonly', () => {
	// This verifies TypeScript treats it as readonly at compile time
	// At runtime, we just verify the structure exists
	assert.ok(typeof LOCALSTORAGE_KEYS.scrapingResults === 'function');
	assert.ok(typeof LOCALSTORAGE_KEYS.savedJobs === 'function');
	assert.ok(typeof LOCALSTORAGE_KEYS.jobDashboard === 'string');
	assert.ok(typeof LOCALSTORAGE_KEYS.sidebarState === 'string');
	assert.ok(typeof LOCALSTORAGE_KEYS.atsScanResults === 'object');
});
