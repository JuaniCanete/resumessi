import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	trySelectors,
	LINKEDIN_CARD_SELECTORS,
	LINKEDIN_FIELD_SELECTORS,
	REMOTEROCKETSHIP_CARD_SELECTORS,
	REMOTEROCKETSHIP_FIELD_SELECTORS,
} from '../../src/scraper/selectors';

const mockElementHandle = {
	// eslint-disable-next-line require-await
	$: async (selector: string) => {
		if (selector === 'h3 a[href*="/publicjobs/"]')
			return {
				// eslint-disable-next-line require-await
				textContent: async () => 'Test Title',
			};
		if (selector === 'h4 a[href*="/company/"]')
			return {
				// eslint-disable-next-line require-await
				textContent: async () => 'Test Company',
			};
		if (selector === 'p.notranslate:has-text("🕒")')
			return {
				// eslint-disable-next-line require-await
				textContent: async () => '🕒 2 days ago',
			};
		if (selector === 'a:has-text("View Job")[href*="/publicjobs/"]')
			return {
				// eslint-disable-next-line require-await
				getAttribute: async () => '/publicjobs/123',
			};
		return null;
	},
	// eslint-disable-next-line require-await
	$$: async (selector: string) => {
		if (selector === 'div.py-2.px-2.my-1.flex.flex-row.items-center.bg-pill') return [];
		return [];
	},
	// eslint-disable-next-line require-await
	getAttribute: async (attr: string) => {
		if (attr === 'href') return '/publicjobs/123';
		return null;
	},
} as unknown as import('playwright').ElementHandle;

test('Selector config has LinkedIn card selectors as non-empty readonly array', () => {
	assert.ok(LINKEDIN_CARD_SELECTORS.length > 0);
	assert.ok(Array.isArray(LINKEDIN_CARD_SELECTORS));
});

test('Selector config has LinkedIn field selectors with title, company, location, url', () => {
	assert.ok(LINKEDIN_FIELD_SELECTORS.title);
	assert.ok(LINKEDIN_FIELD_SELECTORS.company);
	assert.ok(LINKEDIN_FIELD_SELECTORS.location);
	assert.ok(LINKEDIN_FIELD_SELECTORS.url);
	assert.ok(LINKEDIN_FIELD_SELECTORS.title.length > 0);
});

test('Selector config has RemoteRocketship card selectors as non-empty readonly array', () => {
	assert.ok(REMOTEROCKETSHIP_CARD_SELECTORS.length > 0);
	assert.ok(Array.isArray(REMOTEROCKETSHIP_CARD_SELECTORS));
});

test('Selector config has RemoteRocketship field selectors with title, company, date, viewJobLink', () => {
	assert.ok(REMOTEROCKETSHIP_FIELD_SELECTORS.title);
	assert.ok(REMOTEROCKETSHIP_FIELD_SELECTORS.company);
	assert.ok(REMOTEROCKETSHIP_FIELD_SELECTORS.date);
	assert.ok(REMOTEROCKETSHIP_FIELD_SELECTORS.viewJobLink);
});

test('trySelectors returns first matching element for title selector', async () => {
	const result = await trySelectors(mockElementHandle, REMOTEROCKETSHIP_FIELD_SELECTORS.title);
	assert.ok(result !== null);
	assert.equal(await result?.textContent(), 'Test Title');
});

test('trySelectors returns first matching element for company selector', async () => {
	const result = await trySelectors(mockElementHandle, REMOTEROCKETSHIP_FIELD_SELECTORS.company);
	assert.ok(result !== null);
	assert.equal(await result?.textContent(), 'Test Company');
});

test('trySelectors returns first matching element for date selector', async () => {
	const result = await trySelectors(mockElementHandle, REMOTEROCKETSHIP_FIELD_SELECTORS.date);
	assert.ok(result !== null);
	assert.equal(await result?.textContent(), '🕒 2 days ago');
});

test('trySelectors returns first matching element for viewJobLink selector', async () => {
	const result = await trySelectors(mockElementHandle, REMOTEROCKETSHIP_FIELD_SELECTORS.viewJobLink);
	assert.ok(result !== null);
	assert.equal(await result?.getAttribute('href'), '/publicjobs/123');
});

test('trySelectors returns null when no selectors match', async () => {
	const result = await trySelectors(mockElementHandle, ['non-existent-selector']);
	assert.equal(result, null);
});

test('trySelectors skips failing selectors and tries next', async () => {
	const mockWithError = {
		// eslint-disable-next-line require-await
		$: async (selector: string) => {
			if (selector === 'fail-first') throw new Error('selector error');
			if (selector === 'h3 a[href*="/publicjobs/"]')
				return {
					// eslint-disable-next-line require-await
					textContent: async () => 'Success',
				};
			return null;
		},
	} as unknown as import('playwright').ElementHandle;

	const result = await trySelectors(mockWithError, ['fail-first', 'h3 a[href*="/publicjobs/"]']);
	assert.ok(result !== null);

	assert.equal(await result?.textContent(), 'Success');
});
