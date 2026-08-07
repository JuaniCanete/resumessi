import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkedInSearchUrl } from '../../src/scraper/linkedin';
import type { ScraperQuery } from '../../src/scraper/types';

test('buildLinkedInSearchUrl returns base URL when no query parts are provided', () => {
  const query: ScraperQuery = { source: 'linkedin' };
  const url = buildLinkedInSearchUrl(query);
  assert.equal(url, 'https://www.linkedin.com/jobs/search/?keywords=');
});

test('buildLinkedInSearchUrl includes keywords, role, seniority, and stack', () => {
  const query: ScraperQuery = {
    source: 'linkedin',
    keywords: 'SDET',
    role: 'QA Engineer',
    seniority: 'Senior',
    stack: 'TypeScript',
  };
  const url = buildLinkedInSearchUrl(query);
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('SDET'));
  assert.ok(decoded.includes('QA Engineer'));
  assert.ok(decoded.includes('Senior'));
  assert.ok(decoded.includes('TypeScript'));
});

test('buildLinkedInSearchUrl includes employment type, region, country, and currency', () => {
  const query: ScraperQuery = {
    source: 'linkedin',
    role: 'Backend Engineer',
    employmentType: 'fulltime',
    region: 'LATAM',
    country: 'Argentina',
    currency: 'USD',
  };
  const url = buildLinkedInSearchUrl(query);
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('Backend Engineer'));
  assert.ok(decoded.includes('fulltime'));
  assert.ok(decoded.includes('LATAM'));
  assert.ok(decoded.includes('Argentina'));
  assert.ok(decoded.includes('USD'));
});

test('buildLinkedInSearchUrl URL-encodes special characters in the query', () => {
  const query: ScraperQuery = {
    source: 'linkedin',
    role: 'Fullstack Engineer',
    stack: 'React & Node.js',
  };
  const url = buildLinkedInSearchUrl(query);
  // The raw URL must not contain unencoded spaces or ampersands
  assert.ok(!url.includes(' '));
  assert.ok(!url.includes('&'));
  // Decoding should recover the original parts
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('Fullstack Engineer'));
  assert.ok(decoded.includes('React & Node.js'));
});

test('buildLinkedInSearchUrl omits empty optional fields', () => {
  const query: ScraperQuery = {
    source: 'linkedin',
    role: 'SDET',
    seniority: '',
    stack: '',
    employmentType: '',
    region: '',
    country: '',
    currency: '',
  };
  const url = buildLinkedInSearchUrl(query);
  const decoded = decodeURIComponent(url);
  // Only the role should appear; empty fields must not add stray tokens
  assert.ok(decoded.includes('SDET'));
  assert.equal(decoded.trim(), 'https://www.linkedin.com/jobs/search/?keywords=SDET');
});