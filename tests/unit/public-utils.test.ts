/**
 * tests/unit/public-utils.test.ts
 *
 * Unit tests for public/utils.ts utility functions.
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	escHtml,
	validateJDInput,
	formatDate,
	renderSkills,
	getDuration,
	getPhotoPath,
	stripMarkdown,
	buildQueryUrl,
} from '../../public/utils';

test('escHtml - escapes < and > to numeric refs', () => {
	assert.equal(escHtml('<b>'), '&#60;b&#62;');
});

test('escHtml - escapes & ampersand', () => {
	assert.equal(escHtml('a & b'), 'a &#38; b');
});

test('escHtml - escapes double quotes', () => {
	assert.equal(escHtml('"hello"'), '&#34;hello&#34;');
});

test('escHtml - escapes single quotes', () => {
	assert.equal(escHtml('it\u0027s'), 'it&#39;s');
});

test('escHtml - escapes XSS payload', () => {
	const html = '<script>alert("xss")</script>';
	const expected = '&#60;script&#62;alert(&#34;xss&#34;)&#60;/script&#62;';
	assert.equal(escHtml(html), expected);
});

test('escHtml - returns empty string unchanged', () => {
	assert.equal(escHtml(''), '');
});

test('escHtml - returns empty string for null', () => {
	assert.equal(escHtml(null), '');
});

test('escHtml - returns empty string for undefined', () => {
	assert.equal(escHtml(undefined), '');
});

test('escHtml - leaves safe text unchanged', () => {
	assert.equal(escHtml('Hello World 123'), 'Hello World 123');
});

test('validateJDInput - rejects null', () => {
	const result = validateJDInput(null as unknown as string);
	assert.equal(result.valid, false);
	assert.ok(result.reason);
});

test('validateJDInput - rejects undefined', () => {
	const result = validateJDInput(undefined as unknown as string);
	assert.equal(result.valid, false);
});

test('validateJDInput - rejects empty string', () => {
	const result = validateJDInput('');
	assert.equal(result.valid, false);
});

test('validateJDInput - rejects whitespace-only string', () => {
	const result = validateJDInput('   \n\t  ');
	assert.equal(result.valid, false);
});

test('validateJDInput - rejects string shorter than 50 chars', () => {
	const result = validateJDInput('Too short');
	assert.equal(result.valid, false);
	assert.ok(result.reason?.includes('too short'));
});

test('validateJDInput - accepts valid job description', () => {
	const jd = 'We are looking for a senior software engineer with 5+ years of experience in Node.js and React.';
	const result = validateJDInput(jd);
	assert.equal(result.valid, true);
	assert.equal(result.reason, undefined);
});

test('validateJDInput - accepts exactly 50 character string', () => {
	const jd = 'A'.repeat(50);
	const result = validateJDInput(jd);
	assert.equal(result.valid, true);
});

test('validateJDInput - trims whitespace before length check', () => {
	const jd = `   ${'A'.repeat(45)}   `;
	const result = validateJDInput(jd);
	assert.equal(result.valid, false);
});

test('formatDate - returns Present for null/undefined/empty', () => {
	assert.equal(formatDate(null), 'Present');
	assert.equal(formatDate(undefined), 'Present');
	assert.equal(formatDate(''), 'Present');
});

test('formatDate - formats ISO date string to readable format', () => {
	assert.equal(formatDate('2023-01-15'), 'Jan 2023');
	assert.equal(formatDate('2020-12-31'), 'Dec 2020');
});

test('formatDate - returns raw string for unparseable date', () => {
	assert.equal(formatDate('invalid-date'), 'invalid-date');
});

test('renderSkills - returns empty string for empty array', () => {
	assert.equal(renderSkills([]), '');
});

test('renderSkills - returns empty string for non-array', () => {
	assert.equal(renderSkills(null as unknown as string[]), '');
	assert.equal(renderSkills(undefined as unknown as string[]), '');
});

test('renderSkills - wraps each skill in a span', () => {
	assert.equal(renderSkills(['JavaScript', 'TypeScript']), '<span>JavaScript</span><span>TypeScript</span>');
});

test('getDuration - calculates months correctly', () => {
	assert.equal(getDuration('2023-01-01', '2023-06-01'), '5mo');
});

test('getDuration - calculates years correctly', () => {
	assert.equal(getDuration('2022-01-01', '2023-01-01'), '1yr');
	assert.equal(getDuration('2021-01-01', '2023-06-01'), '2yr 5mo');
});

test('getDuration - returns empty string for invalid start date', () => {
	assert.equal(getDuration('invalid'), '');
});

test('renderSkills - returns empty string for empty array', () => {
	assert.equal(renderSkills([]), '');
});

test('renderSkills - returns empty string for non-array', () => {
	assert.equal(renderSkills(null as unknown as string[]), '');
	assert.equal(renderSkills(undefined as unknown as string[]), '');
});

test('renderSkills - wraps each skill in a span', () => {
	assert.equal(renderSkills(['JavaScript', 'TypeScript']), '<span>JavaScript</span><span>TypeScript</span>');
});

test('getPhotoPath - returns uploaded photo when present', () => {
	assert.equal(getPhotoPath('custom.jpg'), 'custom.jpg');
});

test('getPhotoPath - returns resume photo path when no upload', () => {
	assert.equal(getPhotoPath(null, { basics: { photo: 'photo.jpg' } }), 'public/assets/photos/photo.jpg');
});

test('getPhotoPath - returns demo fallback when basics.photo is missing', () => {
	assert.equal(getPhotoPath(null, { basics: {} }), '/demo/goat.jpg');
	assert.equal(getPhotoPath(null, null), '/demo/goat.jpg');
});

test('getPhotoPath - uploaded photo takes priority over resume photo', () => {
	assert.equal(getPhotoPath('uploaded.jpg', { basics: { photo: 'resume.jpg' } }), 'uploaded.jpg');
});

test('stripMarkdown - removes fenced code blocks', () => {
	const md = '```js\ncode\n```';
	assert.equal(stripMarkdown(md), '');
});

test('stripMarkdown - removes inline code backticks', () => {
	assert.equal(stripMarkdown('`code`'), 'code');
});

test('stripMarkdown - removes bold and italic markers', () => {
	assert.equal(stripMarkdown('**bold**'), 'bold');
	assert.equal(stripMarkdown('*italic*'), 'italic');
	assert.equal(stripMarkdown('__bold__'), 'bold');
});

test('stripMarkdown - removes heading markers', () => {
	assert.equal(stripMarkdown('# Heading'), 'Heading');
	assert.equal(stripMarkdown('## Subheading'), 'Subheading');
});

test('stripMarkdown - removes blockquote markers', () => {
	assert.equal(stripMarkdown('> quote'), 'quote');
});

test('stripMarkdown - converts list markers to bullets', () => {
	assert.equal(stripMarkdown('- item'), '\u2022 item');
	assert.equal(stripMarkdown('* item'), '\u2022 item');
});

test('stripMarkdown - converts markdown links to plain text', () => {
	assert.equal(stripMarkdown('[link](url)'), 'link');
});

test('stripMarkdown - collapses whitespace and trims', () => {
	assert.equal(stripMarkdown('  multiple   spaces  '), 'multiple spaces');
});

test('stripMarkdown - handles empty string', () => {
	assert.equal(stripMarkdown(''), '');
});

test('buildQueryUrl - builds LinkedIn URL with role, and maps seniority to f_E', () => {
	const url = buildQueryUrl('linkedin', {
		role: 'software engineer',
		seniority: 'mid',
		employmentType: '2',
		region: 'us',
		country: 'us',
		currency: 'USD',
	});

	assert.ok(url.includes('linkedin.com'));
	assert.ok(url.includes('keywords=software%20engineer%20mid%202%20us%20us%20USD'));
	assert.ok(url.includes('f_E=4'));
	// f_WT is NOT set because workType is not provided (employmentType != workType)
});

test('buildQueryUrl - includes employment type, region, country, currency for LinkedIn', () => {
	const url = buildQueryUrl('linkedin', {
		role: 'engineer',
		seniority: 'associate',
		employmentType: '1',
		region: '102264436',
		country: 'us',
		currency: 'USD',
	});

	assert.ok(url.includes('f_E=3'));
	// f_WT is NOT set because workType is not provided (employmentType != workType)
	// region/country/currency go into keywords, not as separate geoId/country params
	assert.ok(url.includes('keywords=engineer%20associate%201%20102264436%20us%20USD'));
});

test('buildQueryUrl - builds Google URL with default domains', () => {
	const url = buildQueryUrl('google', { role: 'engineer' });
	assert.ok(url.includes('google.com'));
	assert.ok(url.includes('engineer'));
});

test('buildQueryUrl - combines region and country into quoted group for Google', () => {
	const url = buildQueryUrl('google', { role: 'engineer', region: 'California', country: 'USA' });
	assert.ok(url.includes('California'));
	assert.ok(url.includes('USA'));
});

test('buildQueryUrl - URL-encodes special characters', () => {
	const url = buildQueryUrl('linkedin', { role: 'c++ developer' });
	assert.ok(url.includes('c%2B%2B'));
});

test('buildQueryUrl - returns base URL when no query parts provided', () => {
	const url = buildQueryUrl('linkedin', {});
	assert.ok(url.startsWith('https://www.linkedin.com/jobs/search/?'));
});
