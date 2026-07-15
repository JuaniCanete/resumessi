/**
 * tests/unit/renderResume.test.js
 *
 * Unit tests for resume rendering utility logic.
 * Tests the data transformation helpers that convert
 * resume JSON into display-ready values.
 *
 * NOTE: The actual renderResume function is inlined in public/main.html.
 * These tests mirror the transformation logic directly. When it is
 * extracted into public/utils.js (future refactor), update the import here.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { formatDate, renderSkills, getDuration } = require('../../public/utils.js');

test('formatDate returns "Present" for null/undefined/empty', () => {
  assert.equal(formatDate(null), 'Present');
  assert.equal(formatDate(undefined), 'Present');
  assert.equal(formatDate(''), 'Present');
});

test('formatDate formats ISO date string to readable format', () => {
  // Jan 2023 → should contain "2023" and "Jan"
  const result = formatDate('2023-01-01');
  assert.ok(result.includes('2023'), `Expected "2023" in "${result}"`);
  assert.ok(result.includes('Jan'), `Expected "Jan" in "${result}"`);
});

test('formatDate returns raw string for unparseable date', () => {
  assert.equal(formatDate('not-a-date'), 'not-a-date');
});

test('renderSkills returns empty string for empty array', () => {
  assert.equal(renderSkills([]), '');
});

test('renderSkills returns empty string for non-array', () => {
  assert.equal(renderSkills(null), '');
  assert.equal(renderSkills(undefined), '');
});

test('renderSkills wraps each skill in a span', () => {
  const result = renderSkills(['JavaScript', 'Node.js']);
  assert.ok(result.includes('<span>JavaScript</span>'));
  assert.ok(result.includes('<span>Node.js</span>'));
});

test('getDuration calculates months correctly', () => {
  const result = getDuration('2023-01-01', '2023-07-01');
  assert.ok(result.includes('6mo'), `Expected "6mo" in "${result}"`);
});

test('getDuration calculates years correctly', () => {
  const result = getDuration('2021-01-01', '2023-01-01');
  assert.ok(result.includes('2yr'), `Expected "2yr" in "${result}"`);
});

test('getDuration returns empty string for invalid start date', () => {
  assert.equal(getDuration('invalid', '2023-01-01'), '');
});
