import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRequestPath, getScraperResultsStorageKey } from '../../src/scraper/runtime-utils';

test('getRequestPath strips query strings from file requests', () => {
  assert.equal(getRequestPath('/public/findJob.html?source=linkedin'), '/public/findJob.html');
  assert.equal(getRequestPath('/public/findJob.html?source=google&loading=true'), '/public/findJob.html');
  assert.equal(getRequestPath('/api/scraper/results?source=linkedin'), '/api/scraper/results');
});

test('getScraperResultsStorageKey returns a stable key per source', () => {
  assert.equal(getScraperResultsStorageKey('linkedin'), 'scraper-results:linkedin');
  assert.equal(getScraperResultsStorageKey('google'), 'scraper-results:google');
});
