import { test } from 'node:test';
import assert from 'node:assert';
import { extractJobFromCard, extractJobCards } from '../../src/scraper/remoterocketship';

// Simplified mock types for testing - using loose typing for test mocks
type MockPage = { $$: (selector: string) => Promise<unknown[]> };
type MockCard = { $: (selector: string) => Promise<unknown>; $$: (selector: string) => Promise<unknown[]> };

const mockPage: MockPage = {
	$$: async (selector: string): Promise<unknown[]> => {
		if (selector === 'div[role="button"][tabindex="0"]') {
			return [mockCard];
		}
		return [];
	},
};

const mockCard: MockCard = {
	$: async (selector: string): Promise<unknown> => {
		if (selector === 'h3 a[href*="/publicjobs/"]') {
			return {
				textContent: async () => 'Senior Software Engineer',
				getAttribute: async (attr: string): Promise<string | null> => (attr === 'href' ? '/publicjobs/12345' : null),
			};
		}
		if (selector === 'h4 a[href*="/company/"]') {
			return {
				textContent: async () => 'Test Company',
			};
		}
		if (selector === 'p.notranslate:has-text("🕒")') {
			return {
				textContent: async () => '🕒 2 days ago',
			};
		}
		if (selector === 'div.py-2.px-2.my-1.flex.flex-row.items-center.bg-pill') {
			return [
				{ textContent: async () => '🌏 Anywhere', getAttribute: async () => null },
				{ textContent: async () => '💵 $100k-$150k', getAttribute: async () => null },
				{ textContent: async () => '⏰ Full Time', getAttribute: async () => null },
				{ textContent: async () => '🟡 Senior', getAttribute: async () => null },
			];
		}
		return null;
	},
	$$: async (selector: string): Promise<unknown[]> => {
		if (selector === 'div.py-2.px-2.my-1.flex.flex-row.items-center.bg-pill') {
			return [
				{ textContent: async () => '🌏 Anywhere', getAttribute: async () => null },
				{ textContent: async () => '💵 $100k-$150k', getAttribute: async () => null },
				{ textContent: async () => '⏰ Full Time', getAttribute: async () => null },
				{ textContent: async () => '🟡 Senior', getAttribute: async () => null },
			];
		}
		return [];
	},
};

const mockPageNoCards: MockPage = {
	$$: async (): Promise<unknown[]> => [],
};

test('extractJobCards returns cards when found with primary selector', async () => {
	// @ts-expect-error mock page for testing
	const cards = await extractJobCards(mockPage);
	assert.strictEqual(cards.length, 1);
});

test('extractJobCards returns empty array when no cards found', async () => {
	// @ts-expect-error mock page for testing
	const cards = await extractJobCards(mockPageNoCards);
	assert.strictEqual(cards.length, 0);
});

test('extractJobFromCard extracts job with all fields', async () => {
	// @ts-expect-error mock page/card for testing
	const job = await extractJobFromCard(mockPage, mockCard);
	assert.ok(job !== null);
	if (job) {
		assert.strictEqual(job.title, 'Senior Software Engineer');
		assert.strictEqual(job.url, 'https://www.remoterocketship.com/publicjobs/12345');
		assert.strictEqual(job.company, 'Test Company');
		assert.strictEqual(job.postedDate, '🕒 2 days ago');
		assert.strictEqual(job.source, 'remoterocketship');
		assert.strictEqual(job.site, 'remoterocketship.com');
		assert.ok(job.snippet.includes('Test Company'));
		assert.ok(job.snippet.includes('Anywhere'));
		assert.ok(job.parameters?.includes('🌏 Anywhere'));
		assert.ok(job.parameters?.includes('💵 $100k-$150k'));
		assert.ok(job.parameters?.includes('⏰ Full Time'));
		assert.ok(job.parameters?.includes('🟡 Senior'));
		assert.deepStrictEqual(job.parameters, [
			'🌏 Anywhere',
			'💵 $100k-$150k',
			'⏰ Full Time',
			'🟡 Senior',
		]);
	}
});

test('extractJobFromCard returns null when title missing', async () => {
	const badCard: MockCard = {
		$: async () => null,
		$$: async () => [],
	};
	// @ts-expect-error mock page/card for testing
	const job = await extractJobFromCard(mockPage, badCard);
	assert.strictEqual(job, null);
});

test('extractJobFromCard returns null when URL missing', async () => {
	const badCard: MockCard = {
		$: async (selector: string) => {
			if (selector === 'h3 a[href*="/publicjobs/"]') {
				return {
					textContent: async () => 'Senior Software Engineer',
					getAttribute: async () => null,
				};
			}
			if (selector === 'h4 a[href*="/company/"]') {
				return { textContent: async () => 'Test Company' };
			}
			return null;
		},
		$$: async () => [],
	};
	// @ts-expect-error mock page/card for testing
	const job = await extractJobFromCard(mockPage, badCard);
	assert.strictEqual(job, null);
});

test('extractJobFromCard handles missing pill tags gracefully', async () => {
	const minimalCard: MockCard = {
		$: async (selector: string) => {
			if (selector === 'h3 a[href*="/publicjobs/"]') {
				return {
					textContent: async () => 'Junior Developer',
					getAttribute: async (attr: string) => (attr === 'href' ? '/publicjobs/999' : null),
				};
			}
			if (selector === 'h4 a[href*="/company/"]') {
				return { textContent: async () => 'Startup Inc' };
			}
			if (selector === 'p.notranslate:has-text("🕒")') {
				return { textContent: async () => '🕒 1 day ago' };
			}
			return null;
		},
		$$: async () => [],
	};
	// @ts-expect-error mock page/card for testing
	const job = await extractJobFromCard(mockPage, minimalCard);
	assert.ok(job !== null);
	if (job) {
		assert.strictEqual(job.title, 'Junior Developer');
		assert.strictEqual(job.company, 'Startup Inc');
		assert.strictEqual(job.postedDate, '🕒 1 day ago');
		assert.ok(job.snippet.includes('Startup Inc'));
		assert.ok(job.snippet.includes('1 day ago'));
	}
});

test('extractJobFromCard handles View Job link fallback', async () => {
	const cardWithViewJob: MockCard = {
		$: async (selector: string) => {
			if (selector === 'h3 a[href*="/publicjobs/"]') {
				return {
					textContent: async () => 'No Href Title',
					getAttribute: async () => null,
				};
			}
			if (selector === 'a:has-text("View Job")[href*="/publicjobs/"]') {
				return {
					getAttribute: async (attr: string) => (attr === 'href' ? '/publicjobs/fallback' : null),
				};
			}
			if (selector === 'h4 a[href*="/company/"]') {
				return { textContent: async () => 'Fallback Company' };
			}
			if (selector === 'p.notranslate:has-text("🕒")') {
				return { textContent: async () => '🕒 3 days ago' };
			}
			return null;
		},
		$$: async () => [],
	};
	// @ts-expect-error mock page/card for testing
	const job = await extractJobFromCard(mockPage, cardWithViewJob);
	assert.ok(job !== null);
	if (job) {
		assert.strictEqual(job.title, 'No Href Title');
		assert.strictEqual(job.url, 'https://www.remoterocketship.com/publicjobs/fallback');
		assert.strictEqual(job.company, 'Fallback Company');
	}
});
