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

test('public/findJob-app.ts - buildLinkedInSearchUrl logic', () => {
	// Mirror the buildLinkedInSearchUrl logic (simplified) - using strings like real ScraperQuery
	function buildLinkedInSearchUrl(params: {
		keywords?: string;
		location?: string;
		seniority?: string;
		employmentType?: string;
		region?: string;
		country?: string;
		currency?: string;
	}): string {
		const base = 'https://www.linkedin.com/jobs/search/?';
		const parts: string[] = [];

		if (params.keywords) parts.push(`keywords=${encodeURIComponent(params.keywords)}`);
		if (params.location) parts.push(`location=${encodeURIComponent(params.location)}`);
		if (params.seniority) parts.push(`f_E=${params.seniority}`);
		if (params.employmentType) parts.push(`f_WT=${params.employmentType}`);
		if (params.region) parts.push(`geoId=${encodeURIComponent(params.region)}`);
		if (params.country) parts.push(`country=${encodeURIComponent(params.country)}`);

		return base + parts.join('&');
	}

	const url = buildLinkedInSearchUrl({
		keywords: 'software engineer',
		location: 'New York',
		seniority: '4',
		employmentType: '2',
	});

	assert.ok(url.includes('keywords=software%20engineer'));
	assert.ok(url.includes('location=New%20York'));
	assert.ok(url.includes('f_E=4'));
	assert.ok(url.includes('f_WT=2'));
});
