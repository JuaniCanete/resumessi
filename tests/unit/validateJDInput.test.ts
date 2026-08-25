/**
 * tests/unit/validateJDInput.test.ts
 *
 * Unit tests for the Job Description input validation logic.
 * Tests the guards that prevent empty/too-short JDs from
 * being submitted to the ATS scan.
 *
 * NOTE: The validation logic is inlined in public/main.html.
 * These tests mirror it directly. When extracted to public/utils.js,
 * update the import here.
 */
'use strict';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateJDInput } from '../../public/utils';

test('validateJDInput rejects null', () => {
	const result = validateJDInput(null as unknown as string);
	assert.equal(result.valid, false);
	assert.ok(result.reason);
});

test('validateJDInput rejects undefined', () => {
	const result = validateJDInput(undefined as unknown as string);
	assert.equal(result.valid, false);
});

test('validateJDInput rejects empty string', () => {
	const result = validateJDInput('');
	assert.equal(result.valid, false);
});

test('validateJDInput rejects whitespace-only string', () => {
	const result = validateJDInput('   \n\t  ');
	assert.equal(result.valid, false);
});

test('validateJDInput rejects string shorter than 50 chars', () => {
	const result = validateJDInput('Too short');
	assert.equal(result.valid, false);
	assert.ok(result.reason?.includes('too short'));
});

test('validateJDInput accepts valid job description', () => {
	const jd = 'We are looking for a senior software engineer with 5+ years of experience in Node.js and React.';
	const result = validateJDInput(jd);
	assert.equal(result.valid, true);
	assert.equal(result.reason, undefined);
});

test('validateJDInput accepts exactly 50 character string', () => {
	const jd = 'A'.repeat(50);
	const result = validateJDInput(jd);
	assert.equal(result.valid, true);
});

test('validateJDInput trims whitespace before length check', () => {
	const jd = `   ${'A'.repeat(45)}   `; // 45 real chars, fails threshold
	const result = validateJDInput(jd);
	assert.equal(result.valid, false);
});
