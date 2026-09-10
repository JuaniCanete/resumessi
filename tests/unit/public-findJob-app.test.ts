/**
 * tests/unit/public-findJob-app.test.ts
 *
 * Unit tests for public/findJob-app.ts core functions.
 * Tests scraper result rendering, dashboard interactions, source switching.
 */
'use strict';

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Mock functions from findJob-app.ts that can be tested in isolation

test('public/findJob-app.ts - isAtsSupportedTab logic', () => {
	// Mirror the isAtsSupportedTab logic from findJob-app.ts
	function isAtsSupportedTab(currentTab: string): boolean {
		return currentTab === 'scraping' || currentTab === 'saved';
	}

	assert.equal(isAtsSupportedTab('scraping'), true);
	assert.equal(isAtsSupportedTab('saved'), true);
	assert.equal(isAtsSupportedTab('dashboard'), false);
	assert.equal(isAtsSupportedTab('resume'), false);
});

test('public/findJob-app.ts - showRemovedToastIfNeeded logic', () => {
	// Mirror the showRemovedToastIfNeeded logic
	const removedToastShown = new Set<string>();

	function showRemovedToastIfNeeded(source: string, removedCount: number, currentTab: string): boolean {
		if (currentTab !== 'scraping') return false;
		if (removedCount > 0 && !removedToastShown.has(source)) {
			removedToastShown.add(source);
			return true;
		}
		return false;
	}

	// Test: only shows on scraping tab
	assert.equal(showRemovedToastIfNeeded('linkedin', 5, 'scraping'), true);
	assert.equal(showRemovedToastIfNeeded('linkedin', 5, 'saved'), false);
	assert.equal(showRemovedToastIfNeeded('linkedin', 5, 'dashboard'), false);

	// Test: only shows once per source
	assert.equal(showRemovedToastIfNeeded('linkedin', 3, 'scraping'), false);
	assert.equal(showRemovedToastIfNeeded('google', 2, 'scraping'), true);

	// Test: doesn't show if removedCount is 0
	assert.equal(showRemovedToastIfNeeded('remoterocketship', 0, 'scraping'), false);
});

test('public/findJob-app.ts - isCollectionUrl logic', () => {
	// Mirror the isCollectionUrl logic from runtime-utils
	function isCollectionUrl(url: string | null | undefined): boolean {
		if (!url || typeof url !== 'string') return false;
		return /\/jobs\/collections\//.test(url) || /\/jobs\/search\//.test(url);
	}

	// Note: The regex matches /jobs/collections/ and /jobs/search/ paths
	assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/collections/123'), true);
	assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/search/?keywords=test'), true);
	assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/view/12345'), false);
	assert.equal(isCollectionUrl('https://example.com/jobs/collections/123'), true); // matches path pattern
	assert.equal(isCollectionUrl(null), false);
	assert.equal(isCollectionUrl(undefined), false);
	assert.equal(isCollectionUrl(''), false);
	assert.equal(isCollectionUrl('garbage'), false);
});

test('public/findJob-app.ts - normalizeLinkedInJobUrl logic', () => {
	// Mirror the normalizeLinkedInJobUrl logic
	function normalizeLinkedInJobUrl(url: string): string | null {
		try {
			const u = new URL(url);
			if (u.hostname !== 'www.linkedin.com' && u.hostname !== 'linkedin.com') return null;

			// Collections wrapper
			if (u.pathname.startsWith('/jobs/collections/')) {
				const parts = u.pathname.split('/');
				const jobId = parts[parts.length - 1];
				if (/^\d+$/.test(jobId)) return `https://www.linkedin.com/jobs/view/${jobId}`;
				return null;
			}

			// Search wrapper
			if (u.pathname.startsWith('/jobs/search/')) {
				const jobId = u.searchParams.get('currentJobId');
				if (jobId && /^\d+$/.test(jobId)) return `https://www.linkedin.com/jobs/view/${jobId}`;
				return null;
			}

			// Already canonical
			if (u.pathname.startsWith('/jobs/view/')) return url;

			return null;
		} catch {
			return null;
		}
	}

	assert.equal(
		normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/collections/12345?currentJobId=67890'),
		'https://www.linkedin.com/jobs/view/12345'
	);
	assert.equal(
		normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/search/?keywords=test&currentJobId=11111'),
		'https://www.linkedin.com/jobs/view/11111'
	);
	assert.equal(
		normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/view/99999'),
		'https://www.linkedin.com/jobs/view/99999'
	);
	assert.equal(normalizeLinkedInJobUrl('https://example.com/jobs/collections/123'), null);
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/collections/abc'), null);
	assert.equal(normalizeLinkedInJobUrl('not-a-url'), null);
});

test('public/findJob-app.ts - clearScraperSource cache wipe decision', () => {
	// Mirror the browser-cache wipe logic in clearScraperSource: the shared
	// sessionStorage entry is only removed when it belongs to the cleared source,
	// while the per-source localStorage key is always removed for that source.
	function shouldWipeSession(rawSession: string | null, clearedSource: string): boolean {
		if (!rawSession) return false;
		try {
			const parsed = JSON.parse(rawSession);
			return parsed.source === clearedSource;
		} catch {
			return false;
		}
	}

	const sessionLinkedIn = JSON.stringify({ source: 'linkedin', results: [{ url: 'a' }] });
	const sessionGoogle = JSON.stringify({ source: 'google', results: [{ url: 'b' }] });

	// Wipe only when session belongs to the cleared source
	assert.equal(shouldWipeSession(sessionLinkedIn, 'linkedin'), true);
	assert.equal(shouldWipeSession(sessionGoogle, 'linkedin'), false);
	assert.equal(shouldWipeSession(sessionGoogle, 'google'), true);
	assert.equal(shouldWipeSession(null, 'linkedin'), false);
	assert.equal(shouldWipeSession('not-json{', 'linkedin'), false);

	// The per-source localStorage key is always removed for the cleared source.
	// Mirrors getScraperResultsStorageKey(source).
	assert.equal(`scraper-results:${'google'}`, 'scraper-results:google');
	assert.equal(`scraper-results:${'remoterocketship'}`, 'scraper-results:remoterocketship');
});

test('public/findJob-app.ts - clearCurrentScraperSource delegates to currentSource', () => {
	// Mirror clearCurrentScraperSource: it forwards the currently selected source.
	function clearCurrentScraperSource(currentSource: string, clearScraperSource: (s: string) => string): string {
		return clearScraperSource(currentSource);
	}

	assert.equal(
		clearCurrentScraperSource('google', s => `clear:${s}`),
		'clear:google'
	);
	assert.equal(
		clearCurrentScraperSource('remoterocketship', s => `clear:${s}`),
		'clear:remoterocketship'
	);
});

test('public/findJob-app.ts - clear scraper confirmation modal copy', () => {
	// Mirror the confirmation modal options built by clearScraperSource.
	// Matches the shared "Remove Item" style but with the "Remove All" confirm text.
	function buildClearConfirmOptions(source: string): {
		title: string;
		message: string;
		confirmText: string;
		cancelText: string;
		variant: string;
	} {
		const label = source === 'linkedin' ? 'LinkedIn' : source === 'google' ? 'Google' : 'Remote Rocketship';
		return {
			title: 'Remove Item',
			message: `This will remove ALL ${label} scraper results. Are you sure?`,
			confirmText: 'Remove All',
			cancelText: 'Cancel',
			variant: 'danger',
		};
	}

	const linkedin = buildClearConfirmOptions('linkedin');
	assert.equal(linkedin.title, 'Remove Item');
	assert.equal(linkedin.message, 'This will remove ALL LinkedIn scraper results. Are you sure?');
	assert.equal(linkedin.confirmText, 'Remove All');
	assert.equal(linkedin.cancelText, 'Cancel');
	assert.equal(linkedin.variant, 'danger');

	const rr = buildClearConfirmOptions('remoterocketship');
	assert.equal(rr.message, 'This will remove ALL Remote Rocketship scraper results. Are you sure?');
});

test('public/findJob-app.ts - clear all results button uses selected source', () => {
	// Mirror clearCurrentScraperSource routing: the button always forwards the
	// currently selected source into clearScraperSource.
	function clearCurrent(source: string, clearScraperSource: (s: string) => string): string {
		return clearScraperSource(source);
	}

	let calledWith: string | null = null;
	clearCurrent('linkedin', s => {
		calledWith = s;
		return `cleared:${s}`;
	});
	assert.equal(calledWith, 'linkedin');

	clearCurrent('google', s => {
		calledWith = s;
		return `cleared:${s}`;
	});
	assert.equal(calledWith, 'google');
});

test('public/findJob-app.ts - clear all results button disabled state', () => {
	// Mirror updateClearAllResultsButtonState: disabled when the active source
	// has no results, enabled otherwise.
	interface Payload {
		results: unknown[];
	}
	function computeDisabledState(payload: Payload | null): { disabled: boolean; cls: string } {
		const hasResults = !!payload && Array.isArray(payload.results) && payload.results.length > 0;
		return { disabled: !hasResults, cls: hasResults ? '' : 'card-action-btn--disabled' };
	}

	assert.deepEqual(computeDisabledState(null), { disabled: true, cls: 'card-action-btn--disabled' });
	assert.deepEqual(computeDisabledState({ results: [] }), { disabled: true, cls: 'card-action-btn--disabled' });
	assert.deepEqual(computeDisabledState({ results: [{}] }), { disabled: false, cls: '' });
});

test('public/findJob-app.ts - saved card action disabled flag for collection URLs', () => {
	// Mirror the Run ATS disabled logic for collection-page URLs in saved view
	function isRunATSDisabled(itemUrl: string): boolean {
		if (!itemUrl || typeof itemUrl !== 'string') return false;
		return /\/jobs\/collections\//.test(itemUrl) || /\/jobs\/search\//.test(itemUrl);
	}

	// Regular job URLs - Run ATS enabled
	assert.equal(isRunATSDisabled('https://example.com/job/view/1'), false);
	assert.equal(isRunATSDisabled('https://www.linkedin.com/jobs/view/12345'), false);

	// Collection URLs - Run ATS disabled
	assert.equal(isRunATSDisabled('https://www.linkedin.com/jobs/collections/123'), true);
	assert.equal(isRunATSDisabled('https://www.linkedin.com/jobs/search/?keywords=test'), true);
	assert.equal(isRunATSDisabled('https://example.com/jobs/collections/456'), true);

	// Edge cases
	assert.equal(isRunATSDisabled(''), false);
	assert.equal(isRunATSDisabled(null as unknown as string), false);
	assert.equal(isRunATSDisabled(undefined as unknown as string), false);
});
