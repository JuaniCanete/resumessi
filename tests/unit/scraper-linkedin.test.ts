import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeLinkedInJobUrl,
	extractJdTextFromBody,
	extractLinkedInJdFromPage,
	LinkedInSessionExpiredError,
} from '../../src/scraper/linkedin';

test('normalizeLinkedInJobUrl - converts collections wrapper to canonical jobs/view URL', () => {
	const result = normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=12345');
	assert.equal(result, 'https://www.linkedin.com/jobs/view/12345/');
});

test('normalizeLinkedInJobUrl - converts search wrapper to canonical jobs/view URL', () => {
	const result = normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/search/?keywords=react&location=NYC&currentJobId=67890');
	assert.equal(result, 'https://www.linkedin.com/jobs/view/67890/');
});

test('normalizeLinkedInJobUrl - passes through an already-canonical jobs/view URL', () => {
	const result = normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/view/111222/');
	assert.equal(result, 'https://www.linkedin.com/jobs/view/111222/');
});

test('normalizeLinkedInJobUrl - returns null for non-job LinkedIn pages', () => {
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/feed'), null);
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/in/someuser'), null);
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/company/somecompany'), null);
});

test('normalizeLinkedInJobUrl - returns null for non-LinkedIn hosts', () => {
	assert.equal(normalizeLinkedInJobUrl('https://www.google.com/search?q=jobs'), null);
	assert.equal(normalizeLinkedInJobUrl('https://www.indeed.com/jobs?q=react'), null);
});

test('normalizeLinkedInJobUrl - returns null for invalid URLs', () => {
	assert.equal(normalizeLinkedInJobUrl('not-a-url'), null);
	assert.equal(normalizeLinkedInJobUrl(''), null);
});

test('normalizeLinkedInJobUrl - rejects non-digit currentJobId to prevent injection', () => {
	assert.throws(
		() => normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=abc'),
		/Invalid LinkedIn currentJobId: abc/
	);
});

test('normalizeLinkedInJobUrl - returns null for wrapper without currentJobId', () => {
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/collections/recommended/'), null);
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/search/'), null);
});

test('extractJdTextFromBody - returns text between the two markers', () => {
	const body = 'Some text About the job This is the job description Set alert for similar jobs More text';
	const result = extractJdTextFromBody(body);
	assert.equal(result, 'This is the job description');
});

test('extractJdTextFromBody - returns empty string when start marker missing', () => {
	const body = 'Some text without the start marker Set alert for similar jobs';
	const result = extractJdTextFromBody(body);
	assert.equal(result, '');
});

test('extractJdTextFromBody - returns text to end when end marker missing', () => {
	const body = 'Some text About the job This is the job description without end marker';
	const result = extractJdTextFromBody(body);
	assert.equal(result, 'This is the job description without end marker');
});

test('extractJdTextFromBody - returns empty string for empty input', () => {
	assert.equal(extractJdTextFromBody(''), '');
});

test('extractJdTextFromBody - handles multiple occurrences (uses first)', () => {
	const body = 'About the job First description Set alert for similar jobs About the job Second description Set alert for similar jobs';
	const result = extractJdTextFromBody(body);
	assert.equal(result, 'First description');
});

test('extractJdTextFromBody - trims whitespace', () => {
	const body = 'About the job   Description with spaces   Set alert for similar jobs';
	const result = extractJdTextFromBody(body);
	assert.equal(result, 'Description with spaces');
});

test('extractLinkedInJdFromPage - throws LinkedInSessionExpiredError when redirected to login', () => {
	assert.throws(
		() => extractLinkedInJdFromPage('https://www.linkedin.com/login?redirect=...', 'About the job Desc Set alert for similar jobs'),
		LinkedInSessionExpiredError
	);
});

test('extractLinkedInJdFromPage - throws LinkedInSessionExpiredError when redirected to checkpoint', () => {
	assert.throws(
		() => extractLinkedInJdFromPage('https://www.linkedin.com/checkpoint/challenge', 'About the job Desc Set alert for similar jobs'),
		LinkedInSessionExpiredError
	);
});

test('extractLinkedInJdFromPage - returns extracted JD text on a valid session', () => {
	const body = 'About the job This is the job description Set alert for similar jobs';
	const result = extractLinkedInJdFromPage('https://www.linkedin.com/jobs/view/123/', body);
	assert.equal(result, 'This is the job description');
});

test('extractLinkedInJdFromPage - returns empty string when JD markers are missing on a valid session', () => {
	const body = 'No markers here at all';
	const result = extractLinkedInJdFromPage('https://www.linkedin.com/jobs/view/123/', body);
	assert.equal(result, '');
});

test('extractLinkedInJdFromPage - handles case sensitivity of markers', () => {
	const body = 'about the job lower case Set alert for similar jobs';
	const result = extractLinkedInJdFromPage('https://www.linkedin.com/jobs/view/123/', body);
	assert.equal(result, '');
});

test('extractLinkedInJdFromPage - handles newlines in body', () => {
	const body = 'About the job\nThis is a multi-line\ndescription\nSet alert for similar jobs';
	const result = extractLinkedInJdFromPage('https://www.linkedin.com/jobs/view/123/', body);
	assert.equal(result, 'This is a multi-line\ndescription');
});