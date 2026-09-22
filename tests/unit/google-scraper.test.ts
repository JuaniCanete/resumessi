import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { DEFAULT_TARGET_DOMAINS, extractGoogleResultUrl, scrapeGoogle } from '../../src/scraper/google';
import { buildScraperSearchUrl, buildSingleRoleQuery, parseRoleTerms } from '../../src/scraper/pagination';
import type { ScraperQuery } from '../../src/scraper/types';

const mockSerpApiResponse = {
	organic_results: [
		{
			title: 'Senior SDET',
			link: 'https://jobs.lever.co/example/sdet',
			snippet: 'We are looking for a Senior SDET...',
			displayed_link: 'jobs.lever.co',
			company_name: 'Example Corp',
		},
		{
			title: 'QA Automation Engineer',
			link: 'https://jobs.ashbyhq.com/example/qa',
			snippet: 'Join our QA team...',
			displayed_link: 'jobs.ashbyhq.com',
			company_name: 'Test Inc',
		},
	],
	search_metadata: {
		id: 'test-search-id',
		status: 'Success',
		json_endpoint: 'https://serpapi.com/searches/test.json',
	},
};

test('buildScraperSearchUrl skips site filters when customDomains is empty array', () => {
	const query: ScraperQuery = {
		source: 'google',
		role: 'SDET',
		customDomains: [],
	};
	const url = buildScraperSearchUrl('google', query);
	const decoded = decodeURIComponent(url);
	assert.ok(!decoded.includes('site:'));
});

test('buildScraperSearchUrl keeps intitle and location when customDomains is empty array', () => {
	const query: ScraperQuery = {
		source: 'google',
		role: 'SDET',
		region: 'LATAM',
		country: 'Argentina',
		customDomains: [],
	};
	const url = buildScraperSearchUrl('google', query);
	const decoded = decodeURIComponent(new URL(url).searchParams.get('q')!);
	assert.ok(!decoded.includes('site:'));
	assert.ok(decoded.includes('(intitle:"SDET")'));
	assert.ok(decoded.includes('("LATAM" OR "Argentina")'));
});

test('buildScraperSearchUrl uses default domains when customDomains is undefined', () => {
	const query: ScraperQuery = {
		source: 'google',
		role: 'SDET',
	};
	const url = buildScraperSearchUrl('google', query);
	const decoded = decodeURIComponent(url);
	assert.ok(decoded.includes('site:teamtailor.com'));
});

test('buildScraperSearchUrl uses custom domains when provided', () => {
	const query: ScraperQuery = {
		source: 'google',
		role: 'SDET',
		customDomains: ['bamboohr.com', 'recruitee.com'],
	};
	const url = buildScraperSearchUrl('google', query);
	const decoded = decodeURIComponent(url);
	assert.ok(decoded.includes('site:bamboohr.com'));
	assert.ok(decoded.includes('site:recruitee.com'));
	assert.ok(!decoded.includes('site:teamtailor.com'));
});

test('buildScraperSearchUrl pairs site scope with role-mirrored intitle group', () => {
	const query: ScraperQuery = {
		source: 'google',
		role: 'SDET, QA Automation',
		customDomains: ['jobs.lever.co'],
		region: 'LATAM',
	};
	const url = buildScraperSearchUrl('google', query);
	const decoded = decodeURIComponent(url);
	assert.ok(decoded.includes('site:jobs.lever.co'));
	assert.ok(decoded.includes('(intitle:"SDET" OR intitle:"QA Automation")'));
	assert.ok(!decoded.includes('intitle:"careers"'));
});

test('buildScraperSearchUrl builds H-shape query: body role + intitle mirror + remote location', () => {
	const query: ScraperQuery = {
		source: 'google',
		role: 'QA Automation',
		region: 'LATAM',
		country: 'Argentina',
	};
	const url = buildScraperSearchUrl('google', query);
	const decoded = decodeURIComponent(url);
	const q = new URL(url).searchParams.get('q');
	assert.ok(q);
	const decodedQ = decodeURIComponent(q!);
	assert.ok(decodedQ.includes('"QA Automation"'));
	assert.ok(decodedQ.includes('(intitle:"QA Automation")'));
	assert.ok(decodedQ.includes('("LATAM" OR "Argentina")'));
	assert.ok(!decodedQ.includes('remote'));
	assert.ok(decoded.includes('site:'));
});

test('buildScraperSearchUrl includes role, seniority, and location parts', () => {
	const query: ScraperQuery = {
		source: 'google',
		role: 'Fullstack Engineer',
		seniority: 'Senior',
		country: 'Argentina',
		region: 'LATAM',
		currency: 'USD',
	};
	const url = buildScraperSearchUrl('google', query);
	const decoded = decodeURIComponent(url);
	assert.ok(decoded.includes('Fullstack Engineer')); // role is NOT quoted
	assert.ok(decoded.includes('"Senior"')); // seniority IS quoted
	assert.ok(decoded.includes('("LATAM" OR "Argentina")'));
	assert.ok(decoded.includes('USD'));
});

test('extractGoogleResultUrl unwraps Google /url?q= redirect', () => {
	const raw = 'https://www.google.com/url?q=https%3A%2F%2Fjobs.lever.co%2Fexample%2Fjob&sa=U&ved=2ahUKEwj';
	assert.equal(extractGoogleResultUrl(raw), 'https://jobs.lever.co/example/job');
});

test('extractGoogleResultUrl returns raw URL when not a Google redirect', () => {
	const raw = 'https://jobs.lever.co/example/job';
	assert.equal(extractGoogleResultUrl(raw), raw);
});

test('extractGoogleResultUrl returns empty string for empty input', () => {
	assert.equal(extractGoogleResultUrl(''), '');
});

test('DEFAULT_TARGET_DOMAINS contains the expected job board domains', () => {
	assert.ok(DEFAULT_TARGET_DOMAINS.length > 0);
	assert.ok(DEFAULT_TARGET_DOMAINS.includes('jobs.ashbyhq.com'));
	assert.ok(DEFAULT_TARGET_DOMAINS.includes('jobs.lever.co'));
});

test('scrapeGoogle returns empty array when credentials are missing', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET' };
	const env = { GOOGLE_API_KEY: undefined } as Record<string, string | undefined>;
	const results = await scrapeGoogle(query, env);
	assert.ok(Array.isArray(results));
	assert.equal(results.length, 0);
});

test('scrapeGoogle parses SerpAPI results successfully', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET' };
	const env = {
		GOOGLE_API_KEY: 'test-key',
		MISTRAL_API_KEY: undefined,
		COHERE_API_KEY: undefined,
		GEMINI_API_KEY: undefined,
		GROQ_API_KEY: undefined,
		AI_INFERENCE_ORDER: undefined,
	} as Record<string, string | undefined>;

	mock.method(global, 'fetch', (url: string) => {
		assert.ok(url.includes('serpapi.com/search.json'));
		assert.ok(url.includes('api_key=test-key'));
		return {
			ok: true,
			status: 200,
			json: () => Promise.resolve(mockSerpApiResponse),
		} as Response;
	});

	const results = await scrapeGoogle(query, env);
	assert.ok(Array.isArray(results));
	assert.ok(results.length >= 1);
	const first = results[0];
	assert.ok(first.url.startsWith('http'));
	assert.ok(first.title.length > 0);
	assert.ok(first.site && first.site.length > 0);
});

test('scrapeGoogle handles 429 quota limit error gracefully', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET' };
	const env = {
		GOOGLE_API_KEY: 'test-key',
		MISTRAL_API_KEY: undefined,
		COHERE_API_KEY: undefined,
		GEMINI_API_KEY: undefined,
		GROQ_API_KEY: undefined,
		AI_INFERENCE_ORDER: undefined,
	} as Record<string, string | undefined>;

	mock.method(
		global,
		'fetch',
		() =>
			({
				ok: false,
				status: 429,
				json: () => Promise.resolve({ error: 'Rate limit exceeded' }),
			}) as Response
	);

	const results = await scrapeGoogle(query, env);
	assert.ok(Array.isArray(results));
});

test('parseRoleTerms splits CSV and legacy OR syntax', () => {
	assert.deepEqual(parseRoleTerms('SDET, QA Automation'), ['SDET', 'QA Automation']);
	assert.deepEqual(parseRoleTerms('SDET OR QA Automation'), ['SDET', 'QA Automation']);
	assert.deepEqual(parseRoleTerms('  SDET ,, QA Automation  '), ['SDET', 'QA Automation']);
	assert.deepEqual(parseRoleTerms('SDET'), ['SDET']);
	assert.deepEqual(parseRoleTerms('   '), []);
});

test('buildSingleRoleQuery builds H-shape query for one term', () => {
	const q = buildSingleRoleQuery('SDET', {
		source: 'google',
		role: 'SDET, QA Automation',
		region: 'LATAM',
		country: 'Argentina',
	} as ScraperQuery);
	assert.ok(q.includes('"SDET"'));
	assert.ok(q.includes('(intitle:"SDET")'));
	assert.ok(!q.includes('QA Automation'));
	assert.ok(q.includes('site:'));
});

function serpEnv(): Record<string, string | undefined> {
	return {
		GOOGLE_API_KEY: 'test-key',
		MISTRAL_API_KEY: undefined,
		COHERE_API_KEY: undefined,
		GEMINI_API_KEY: undefined,
		GROQ_API_KEY: undefined,
		AI_INFERENCE_ORDER: undefined,
	} as Record<string, string | undefined>;
}

function serpItem(title: string, link: string) {
	return { title, link, snippet: title, displayed_link: link, company_name: 'Test' };
}

function mockFetchByRole(routes: Record<string, object>) {
	mock.method(global, 'fetch', (url: string | URL) => {
		const q = new URL(String(url)).searchParams.get('q') || '';
		for (const [marker, payload] of Object.entries(routes)) {
			if (q.includes(marker)) {
				return { ok: true, status: 200, json: () => Promise.resolve(payload) } as Response;
			}
		}
		return {
			ok: true,
			status: 200,
			json: () => Promise.resolve({ organic_results: [] }),
		} as Response;
	});
}

test('scrapeGoogle splits CSV roles and concatenates in CSV order', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET, QA Automation', pageCount: 1 };
	mockFetchByRole({
		'intitle:"SDET"': { organic_results: [serpItem('Senior SDET', 'https://jobs.lever.co/a/sdet-1')] },
		'intitle:"QA Automation"': {
			organic_results: [serpItem('QA Automation Engineer', 'https://jobs.ashbyhq.com/b/qa-1')],
		},
	});
	const results = await scrapeGoogle(query, serpEnv());
	assert.equal(results.length, 2);
	assert.equal(results[0].title, 'Senior SDET');
	assert.equal(results[1].title, 'QA Automation Engineer');
	assert.deepEqual(query.roleTerms, ['SDET', 'QA Automation']);
	assert.equal(query.executedQueries?.length, 2);
	assert.ok(query.executedQueries?.[0].includes('(intitle:"SDET")'));
	assert.ok(query.executedQueries?.[1].includes('(intitle:"QA Automation")'));
});

test('scrapeGoogle deduplicates same URL across role terms, first wins', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET, QA Automation', pageCount: 1 };
	const shared = serpItem('Senior SDET', 'https://jobs.lever.co/a/shared');
	mockFetchByRole({
		'intitle:"SDET"': { organic_results: [shared, serpItem('SDET 2', 'https://jobs.lever.co/a/sdet-2')] },
		'intitle:"QA Automation"': {
			organic_results: [serpItem('Senior SDET', 'https://jobs.lever.co/a/shared')],
		},
	});
	const results = await scrapeGoogle(query, serpEnv());
	assert.equal(results.length, 2);
	const urls = results.map(r => r.url);
	assert.equal(new Set(urls).size, urls.length);
});

test('scrapeGoogle respects global 50-item cap across role terms', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET, QA Automation', pageCount: 1 };
	const many = (prefix: string, host: string) =>
		Array.from({ length: 30 }, (_, i) => serpItem(`${prefix} ${i}`, `https://${host}/x/${prefix}-${i}`));
	mockFetchByRole({
		'intitle:"SDET"': { organic_results: many('sdet', 'jobs.lever.co') },
		'intitle:"QA Automation"': { organic_results: many('qa', 'jobs.ashbyhq.com') },
	});
	const results = await scrapeGoogle(query, serpEnv());
	assert.equal(results.length, 50);
});

test('scrapeGoogle skips 429 term and continues to next term', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET, QA Automation, E2E', pageCount: 1 };
	mock.method(global, 'fetch', (url: string | URL) => {
		const q = new URL(String(url)).searchParams.get('q') || '';
		if (q.includes('intitle:"QA Automation"')) {
			return { ok: false, status: 429, json: () => Promise.resolve({ error: 'x' }) } as Response;
		}
		const title = q.includes('intitle:"SDET"') ? 'Senior SDET' : 'E2E Engineer';
		const link = q.includes('intitle:"SDET"') ? 'https://jobs.lever.co/a/sdet-1' : 'https://jobs.ashbyhq.com/b/e2e-1';
		return {
			ok: true,
			status: 200,
			json: () => Promise.resolve({ organic_results: [serpItem(title, link)] }),
		} as Response;
	});
	const results = await scrapeGoogle(query, serpEnv());
	assert.equal(results.length, 2);
	assert.equal(results[0].title, 'Senior SDET');
	assert.equal(results[1].title, 'E2E Engineer');
	assert.equal(query.executedQueries?.length, 3);
});

test('scrapeGoogle splitRoles=false uses legacy single query', async () => {
	const query: ScraperQuery = { source: 'google', role: 'SDET, QA Automation', pageCount: 1, splitRoles: false };
	let calls = 0;
	mock.method(global, 'fetch', (url: string | URL) => {
		calls++;
		const q = new URL(String(url)).searchParams.get('q') || '';
		assert.ok(q.includes('("SDET" OR "QA Automation")'));
		return {
			ok: true,
			status: 200,
			json: () => Promise.resolve({ organic_results: [serpItem('Senior SDET', 'https://jobs.lever.co/a/1')] }),
		} as Response;
	});
	const results = await scrapeGoogle(query, serpEnv());
	assert.equal(calls, 1);
	assert.equal(results.length, 1);
	assert.equal(query.executedQueries?.length, 1);
});

test('scrapeGoogle with unparseable role returns empty array', async () => {
	const query: ScraperQuery = { source: 'google', role: ' , , ' };
	mockFetchByRole({});
	const results = await scrapeGoogle(query, serpEnv());
	assert.equal(results.length, 0);
});

test('scrapeGoogle sanitizes overlong query before sending to SerpAPI', async () => {
	const longRoleQuery: ScraperQuery = { source: 'google', role: `SDET ${'x'.repeat(3000)}`, pageCount: 1 };
	let sentQ = '';
	mock.method(global, 'fetch', (url: string | URL) => {
		sentQ = new URL(String(url)).searchParams.get('q') || '';
		return {
			ok: true,
			status: 200,
			json: () => Promise.resolve({ organic_results: [] }),
		} as Response;
	});
	await scrapeGoogle(longRoleQuery, serpEnv());
	assert.ok(sentQ.length <= 2048);
});
