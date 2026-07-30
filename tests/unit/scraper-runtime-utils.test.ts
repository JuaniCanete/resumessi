import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRequestPath, getScraperResultsStorageKey } from '../../src/scraper/runtime-utils';

test('getRequestPath strips query strings from file requests', () => {
  assert.equal(getRequestPath('/public/results.html?source=linkedin'), '/public/results.html');
  assert.equal(getRequestPath('/public/results.html?source=google&loading=true'), '/public/results.html');
  assert.equal(getRequestPath('/api/scraper/results?source=linkedin'), '/api/scraper/results');
});

test('getScraperResultsStorageKey returns a stable key per source', () => {
  assert.equal(getScraperResultsStorageKey('linkedin'), 'scraper-results:linkedin');
  assert.equal(getScraperResultsStorageKey('google'), 'scraper-results:google');
});
