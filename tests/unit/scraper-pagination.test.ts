import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScraperSearchUrls } from '../../src/scraper/pagination';

test('buildScraperSearchUrls adds pagination offsets for LinkedIn', () => {
  const urls = buildScraperSearchUrls('https://www.linkedin.com/jobs/search/?keywords=react', 'linkedin', 3);
  assert.deepEqual(urls, [
    'https://www.linkedin.com/jobs/search/?keywords=react',
    'https://www.linkedin.com/jobs/search/?keywords=react&start=25',
    'https://www.linkedin.com/jobs/search/?keywords=react&start=50',
  ]);
});

test('buildScraperSearchUrls adds pagination offsets for Google', () => {
  const urls = buildScraperSearchUrls('https://www.google.com/search?q=react%20developer', 'google', 2);
  assert.equal(urls[0], 'https://www.google.com/search?q=react%20developer');
  assert.equal(urls[1], 'https://www.google.com/search?q=react+developer&start=10');
});
