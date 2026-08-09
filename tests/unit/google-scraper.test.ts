import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleSearchUrl, extractGoogleResultUrl, DEFAULT_TARGET_DOMAINS } from '../../src/scraper/google';
import type { ScraperQuery } from '../../src/scraper/types';

test('buildGoogleSearchUrl uses default domains when customDomains is empty array', () => {
  const query: ScraperQuery = {
    source: 'google',
    role: 'SDET',
    customDomains: [],
  };
  const url = buildGoogleSearchUrl(query);
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('site:teamtailor.com'));
  assert.ok(decoded.includes('site:greenhouse.io'));
  assert.ok(decoded.includes('site:lever.co'));
  assert.ok(decoded.includes('site:workday.com'));
  assert.ok(decoded.includes('site:jobs.ashbyhq.com'));
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
    'teamtailor.com',
    'greenhouse.io',
    'lever.co',
    'workday.com',
    'jobs.ashbyhq.com',
  ]);
});