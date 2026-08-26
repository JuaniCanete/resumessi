import type { ScraperQuery } from '../../src/scraper/types';
import assert from 'node:assert/strict';
import { buildScraperSearchUrl } from '../../src/scraper/pagination';
import { test } from 'node:test';

test('buildScraperSearchUrl returns base URL when no query parts are provided', () => {
	const query: ScraperQuery = { source: 'linkedin' };
	const url = buildScraperSearchUrl('linkedin', query);
	assert.equal(url, 'https://www.linkedin.com/jobs/search/?keywords=');
});

test('buildScraperSearchUrl includes keywords and role, and maps seniority to f_E', () => {
	const query: ScraperQuery = {
		source: 'linkedin',
		keywords: 'SDET',
		role: 'QA Engineer',
		seniority: 'Senior',
	};
	const url = buildScraperSearchUrl('linkedin', query);
	// URLSearchParams form-encodes spaces as '+'; decode them back to spaces
	const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
	assert.ok(decoded.includes('SDET'));
	assert.ok(decoded.includes('QA Engineer'));
	// Seniority is encoded as the LinkedIn f_E numeric filter, not plain text
	assert.ok(decoded.includes('f_E=4'));
});

test('buildScraperSearchUrl includes employment type, region, country, and currency', () => {
	const query: ScraperQuery = {
		source: 'linkedin',
		role: 'Backend Engineer',
		employmentType: 'fulltime',
		region: 'LATAM',
		country: 'Argentina',
		currency: 'USD',
	};
	const url = buildScraperSearchUrl('linkedin', query);
	const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
	assert.ok(decoded.includes('Backend Engineer'));
	assert.ok(decoded.includes('fulltime'));
	assert.ok(decoded.includes('LATAM'));
	assert.ok(decoded.includes('Argentina'));
	assert.ok(decoded.includes('USD'));
});

test('buildScraperSearchUrl URL-encodes special characters in the query', () => {
	const query: ScraperQuery = {
		source: 'linkedin',
		role: 'Fullstack Engineer / Developer',
	};
	const url = buildScraperSearchUrl('linkedin', query);
	// The raw URL must not contain unencoded spaces or special chars
	assert.ok(!url.includes(' '));
	// Decoding should recover the original parts (URLSearchParams encodes spaces as '+')
	const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
	assert.ok(decoded.includes('Fullstack Engineer / Developer'));
});

test('buildScraperSearchUrl omits empty optional fields', () => {
	const query: ScraperQuery = {
		source: 'linkedin',
		role: 'SDET',
		seniority: '',
		employmentType: '',
		region: '',
		country: '',
		currency: '',
	};
	const url = buildScraperSearchUrl('linkedin', query);
	const decoded = decodeURIComponent(url);
	// Only the role should appear; empty fields must not add stray tokens
	assert.ok(decoded.includes('SDET'));
	assert.equal(decoded.trim(), 'https://www.linkedin.com/jobs/search/?keywords=SDET');
});
