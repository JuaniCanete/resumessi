import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	normalizeLinkedInJobUrl,
	extractJdTextFromBody,
	extractLinkedInJdFromPage,
	LinkedInSessionExpiredError,
} from '../../src/scraper/linkedin';

// ─── normalizeLinkedInJobUrl ──────────────────────────────────────────────

test('normalizeLinkedInJobUrl converts collections wrapper to canonical jobs/view URL', () => {
	const url = 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4440070396&f_TPR=r2592000';
	assert.equal(normalizeLinkedInJobUrl(url), 'https://www.linkedin.com/jobs/view/4440070396/');
});

test('normalizeLinkedInJobUrl converts search wrapper to canonical jobs/view URL', () => {
	const url = 'https://www.linkedin.com/jobs/search/?keywords=Engineer&currentJobId=1234567890';
	assert.equal(normalizeLinkedInJobUrl(url), 'https://www.linkedin.com/jobs/view/1234567890/');
});

test('normalizeLinkedInJobUrl passes through an already-canonical jobs/view URL', () => {
	const url = 'https://www.linkedin.com/jobs/view/4440070396/';
	assert.equal(normalizeLinkedInJobUrl(url), 'https://www.linkedin.com/jobs/view/4440070396/');
});

test('normalizeLinkedInJobUrl returns null for non-job LinkedIn pages', () => {
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/feed/'), null);
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/in/someone'), null);
});

test('normalizeLinkedInJobUrl returns null for non-LinkedIn hosts', () => {
	assert.equal(normalizeLinkedInJobUrl('https://www.google.com/search?q=jobs'), null);
	assert.equal(normalizeLinkedInJobUrl('https://evil.example.com/jobs/view/123/'), null);
});

test('normalizeLinkedInJobUrl returns null for invalid URLs', () => {
	assert.equal(normalizeLinkedInJobUrl('not a url'), null);
});

test('normalizeLinkedInJobUrl rejects non-digit currentJobId to prevent injection', () => {
	assert.throws(
		() => normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=../../evil'),
		/Invalid LinkedIn currentJobId/
	);
});

test('normalizeLinkedInJobUrl returns null for wrapper without currentJobId', () => {
	assert.equal(normalizeLinkedInJobUrl('https://www.linkedin.com/jobs/collections/recommended/'), null);
});

// ─── extractJdTextFromBody ────────────────────────────────────────────────

test('extractJdTextFromBody returns text between the two markers', () => {
	const body = 'Some header\nAbout the job\nSenior SDET role\nSet alert for similar jobs\nFooter';
	assert.equal(extractJdTextFromBody(body), 'Senior SDET role');
});

test('extractJdTextFromBody returns empty string when start marker missing', () => {
	assert.equal(extractJdTextFromBody('No markers here'), '');
});

test('extractJdTextFromBody returns text to end when end marker missing', () => {
	const body = 'About the job\nSDET role\n\nlots of details';
	assert.equal(extractJdTextFromBody(body), 'SDET role\n\nlots of details');
});

test('extractJdTextFromBody returns empty string for empty input', () => {
	assert.equal(extractJdTextFromBody(''), '');
});

// ─── extractLinkedInJdFromPage (pure session + extraction logic) ──────────

test('extractLinkedInJdFromPage throws LinkedInSessionExpiredError when redirected to login', () => {
	assert.throws(
		() => extractLinkedInJdFromPage('https://www.linkedin.com/login', 'Inicio de sesión en LinkedIn...'),
		(err: unknown) => err instanceof LinkedInSessionExpiredError && err.message.includes('linkedin-auth.ts')
	);
});

test('extractLinkedInJdFromPage throws LinkedInSessionExpiredError when redirected to checkpoint', () => {
	assert.throws(
		() => extractLinkedInJdFromPage('https://www.linkedin.com/checkpoint/challengesAqGf', ''),
		LinkedInSessionExpiredError
	);
});

test('extractLinkedInJdFromPage returns extracted JD text on a valid session', () => {
	const text = extractLinkedInJdFromPage(
		'https://www.linkedin.com/jobs/view/4440070396/',
		'Header\nAbout the job\nSenior SDET at Acme\nSet alert for similar jobs\nFooter'
	);
	assert.equal(text, 'Senior SDET at Acme');
});

test('extractLinkedInJdFromPage returns empty string when JD markers are missing on a valid session', () => {
	const text = extractLinkedInJdFromPage(
		'https://www.linkedin.com/jobs/view/4440070396/',
		'Just a plain page with no markers'
	);
	assert.equal(text, '');
});
