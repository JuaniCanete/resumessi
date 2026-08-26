import type { ScraperQuery } from '../../src/scraper/types';
import assert from 'node:assert/strict';
import { buildScraperSearchUrl } from '../../src/scraper/pagination';
import { DEFAULT_TARGET_DOMAINS, extractGoogleResultUrl, scrapeGoogle } from '../../src/scraper/google';
import { mock, test } from 'node:test';

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
	assert.ok(decoded.includes('"LATAM" OR "Argentina"'));
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
