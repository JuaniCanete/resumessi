import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleSearchUrl, extractGoogleResultUrl, DEFAULT_TARGET_DOMAINS, scrapeGoogle } from '../../src/scraper/google';
import type { ScraperQuery } from '../../src/scraper/types';

test('buildGoogleSearchUrl skips site filters when customDomains is empty array', () => {
  const query: ScraperQuery = {
    source: 'google',
    role: 'SDET',
    customDomains: [],
  };
  const url = buildGoogleSearchUrl(query);
  const decoded = decodeURIComponent(url);
  assert.ok(!decoded.includes('site:'));
});

test('buildGoogleSearchUrl uses default domains when customDomains is undefined', () => {
  const query: ScraperQuery = {
    source: 'google',
    role: 'SDET',
  };
  const url = buildGoogleSearchUrl(query);
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('site:teamtailor.com'));
});

test('buildGoogleSearchUrl uses custom domains when provided', () => {
  const query: ScraperQuery = {
    source: 'google',
    role: 'SDET',
    customDomains: ['bamboohr.com', 'recruitee.com'],
  };
  const url = buildGoogleSearchUrl(query);
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('site:bamboohr.com'));
  assert.ok(decoded.includes('site:recruitee.com'));
  assert.ok(!decoded.includes('site:teamtailor.com'));
});

test('buildGoogleSearchUrl includes role, seniority, and location parts', () => {
  const query: ScraperQuery = {
    source: 'google',
    role: 'Fullstack Engineer',
    seniority: 'Senior',
    country: 'Argentina',
    region: 'LATAM',
    currency: 'USD',
  };
  const url = buildGoogleSearchUrl(query);
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('"Fullstack Engineer"'));
  assert.ok(decoded.includes('Senior'));
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
  assert.deepEqual(DEFAULT_TARGET_DOMAINS, [
    'remoterocketship.com',
    'myworkdayjobs.com',
    'jobs.ashbyhq.com',
    'teamtailor.com',
    'greenhouse.io',
    'lever.co',
    'bamboohr.com',
    'torre.ai',
  ]);
});

test('scrapeGoogle returns empty array when credentials are missing', async () => {
  const query: ScraperQuery = { source: 'google', role: 'Engineer' };
  const results = await scrapeGoogle(query, {});
  assert.deepEqual(results, []);
});

test('scrapeGoogle parses SerpAPI results successfully', async (t) => {
  const query: ScraperQuery = { source: 'google', role: 'Engineer', pageCount: 1 };
  const mockEnv = { GOOGLE_API_KEY: 'test-key' };

  const mockResponse = {
    organic_results: [
      {
        title: 'Software Engineer Job',
        link: 'https://www.google.com/url?q=https%3A%2F%2Fjobs.lever.co%2Ftest%2Fjobs%2F123&sa=U',
        snippet: 'We are hiring a Software Engineer...'
      }
    ]
  };

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input: Parameters<typeof fetch>[0]) => {
    const urlStr = input.toString();
    assert.ok(urlStr.includes('api_key=test-key'));
    assert.ok(urlStr.includes('q='));
    return {
      status: 200,
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse)
    } as Response;
  };

  const results = await scrapeGoogle(query, mockEnv);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Software Engineer Job');
  assert.equal(results[0].url, 'https://jobs.lever.co/test/jobs/123');
  assert.equal(results[0].snippet, 'We are hiring a Software Engineer...');
});

test('scrapeGoogle handles 429 quota limit error gracefully', async (t) => {
  const query: ScraperQuery = { source: 'google', role: 'Engineer', pageCount: 1 };
  const mockEnv = { GOOGLE_API_KEY: 'test-key' };

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => {
    return {
      status: 429,
      ok: false,
      text: async () => 'Quota Exceeded'
    } as Response;
  };

  const results = await scrapeGoogle(query, mockEnv);
  assert.deepEqual(results, []);
});