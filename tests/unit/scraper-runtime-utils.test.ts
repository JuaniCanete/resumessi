import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRequestPath, isCollectionUrl, getScraperResultsStorageKey } from '../../src/scraper/runtime-utils';

test('getRequestPath returns pathname for full URL', () => {
  assert.equal(getRequestPath('https://www.linkedin.com/jobs/view/12345'), '/jobs/view/12345');
});

test('getRequestPath returns pathname for relative URL', () => {
  assert.equal(getRequestPath('/jobs/view/12345'), '/jobs/view/12345');
});

test('isCollectionUrl detects /jobs/collections/ paths', () => {
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/collections/recommended/'), true);
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=12345'), true);
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/collections/saved-jobs/'), true);
});

test('isCollectionUrl detects /jobs/search paths', () => {
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/search/'), true);
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/search/?keywords=react&location=NYC'), true);
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/search'), true);
});

test('isCollectionUrl returns false for individual job /jobs/view/ URLs', () => {
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/view/12345/'), false);
  assert.equal(isCollectionUrl('https://www.linkedin.com/jobs/view/abcdef/'), false);
});

test('isCollectionUrl returns false for non-LinkedIn URLs', () => {
  assert.equal(isCollectionUrl('https://www.google.com/search?q=jobs'), false);
  assert.equal(isCollectionUrl('https://www.indeed.com/jobs?q=react'), false);
});

test('isCollectionUrl returns false for null, undefined, non-string', () => {
  assert.equal(isCollectionUrl(null), false);
  assert.equal(isCollectionUrl(undefined), false);
  assert.equal(isCollectionUrl(123), false);
  assert.equal(isCollectionUrl({}), false);
  assert.equal(isCollectionUrl(''), false);
});

test('isCollectionUrl returns false for garbage strings without valid URL', () => {
  assert.equal(isCollectionUrl('not-a-url'), false);
});

test('getScraperResultsStorageKey returns correct key for each source', () => {
  assert.equal(getScraperResultsStorageKey('linkedin'), 'scraper-results:linkedin');
  assert.equal(getScraperResultsStorageKey('google'), 'scraper-results:google');
  assert.equal(getScraperResultsStorageKey('remoterocketship'), 'scraper-results:remoterocketship');
});
