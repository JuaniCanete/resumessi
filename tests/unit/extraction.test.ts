/**
 * tests/unit/extraction.test.ts
 *
 * Unit tests for the extractNameFromPDFText function.
 * This function is inlined in public/app.ts and used during AI resume
 * generation to validate candidate identity.
 *
 * Tests cover:
 * - Name extraction from various text formats
 * - Ignoring headers, contact info, and other non-name lines
 * - Ignoring job titles / roles (e.g. "Senior SDET")
 * - Handling edge cases (empty text, no valid name found)
 */
'use strict';

import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Mirror of the extraction logic from public/app.ts.
 * @param {string} text - The PDF text to extract name from
 * @returns {string|null} - The extracted name or null
 */
function extractNameFromPDFText(text: string | null | undefined): string | null {
	if (!text) return null;
	const lines = text.split('\n');
	const headerBlacklist =
		/^(summary|professional summary|profile|experience|work experience|education|skills|certifications|contact|about|objective|languages)/i;
	// Common job-title / role words that should never be treated as a person's name
	const jobTitleBlacklistTerms = [
		'senior',
		'junior',
		'lead',
		'staff',
		'principal',
		'mid',
		'mid-level',
		'entry',
		'entry-level',
		'software',
		'frontend',
		'front-end',
		'backend',
		'back-end',
		'fullstack',
		'full-stack',
		'devops',
		'sdet',
		'qa',
		'quality',
		'automation',
		'engineer',
		'developer',
		'manager',
		'director',
		'architect',
		'analyst',
		'consultant',
		'specialist',
		'designer',
		'product',
		'project',
		'program',
		'scrum',
		'agile',
		'data',
		'cloud',
		'platform',
		'infrastructure',
		'network',
		'security',
		'test',
		'testing',
		'tester',
		'intern',
		'internship',
		'contractor',
		'freelance',
		'remote',
		'head',
		'chief',
		'cto',
		'ceo',
		'coo',
		'cfo',
		'vp',
		'vice',
		'president',
		'founder',
		'owner',
		'recruiter',
		'talent',
		'people',
		'hr',
		'human',
		'resources',
		'marketing',
		'sales',
		'finance',
		'legal',
		'operations',
		'support',
		'success',
		'account',
		'business',
		'strategy',
		'growth',
		'content',
		'writer',
		'copywriter',
		'editor',
		'teacher',
		'professor',
		'nurse',
		'doctor',
		'lawyer',
		'accountant',
		'architect',
		'scientist',
		'researcher',
		'technician',
		'coordinator',
		'assistant',
		'associate',
		'representative',
		'officer',
		'leadership',
		'lead',
	];
	const jobTitleBlacklist = new RegExp(`^(${jobTitleBlacklistTerms.join('|')})`, 'i');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		if (!line || line.length < 3 || line.length > 60) continue;
		if (/^(email|phone|location|linkedin|github|http|www|@)/i.test(line)) continue;
		if (headerBlacklist.test(line)) continue;
		if (line === line.toUpperCase() && /[A-Z]/.test(line)) continue;
		if (jobTitleBlacklist.test(line)) continue;

		const words = line.split(/\s+/);

		if (words.length >= 2 && words.length <= 4) {
			if (/^[a-zA-ZÀ-ÿñÑ'. -]+$/.test(line) && !/\d/.test(line)) {
				const isLikelyName = words.every(word => {
					const firstChar = word.charAt(0);
					return firstChar === firstChar.toUpperCase() || /^(de|del|la|las|los|y)$/i.test(word);
				});

				if (isLikelyName) {
					return line;
				}
			}
		}
	}
	return null;
}

// ─── Basic Name Extraction ──────────────────────────────────────────

test('extractNameFromPDFText returns null for empty text', () => {
	assert.equal(extractNameFromPDFText(''), null);
});

test('extractNameFromPDFText returns null for null input', () => {
	assert.equal(extractNameFromPDFText(null), null);
});

test('extractNameFromPDFText returns null for undefined input', () => {
	assert.equal(extractNameFromPDFText(undefined), null);
});

test('extractNameFromPDFText extracts simple name from beginning of text', () => {
	const text = `John Smith
Software Engineer
Email: john@example.com`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText extracts name with accented characters', () => {
	const text = `José García
Engineer
Location: Madrid`;
	assert.equal(extractNameFromPDFText(text), 'José García');
});

test('extractNameFromPDFText extracts name with single quotes and hyphens', () => {
	const text = `Mary-Jane O'Connor
Developer`;
	assert.equal(extractNameFromPDFText(text), "Mary-Jane O'Connor");
});

// ─── Filtering Rules ────────────────────────────────────────────────

test('extractNameFromPDFText ignores email lines', () => {
	const text = `john@example.com
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores phone lines', () => {
	const text = `Phone: +1-555-000-0000
Jane Doe`;
	assert.equal(extractNameFromPDFText(text), 'Jane Doe');
});

test('extractNameFromPDFText ignores location lines', () => {
	const text = `Location: New York, NY
John Doe`;
	assert.equal(extractNameFromPDFText(text), 'John Doe');
});

test('extractNameFromPDFText ignores LinkedIn/GitHub lines', () => {
	const text = `https://linkedin.com/in/johndoe
John Doe`;
	assert.equal(extractNameFromPDFText(text), 'John Doe');
});

test('extractNameFromPDFText ignores lines with numbers', () => {
	const text = `John123 Smith
Jane Smith`;
	assert.equal(extractNameFromPDFText(text), 'Jane Smith');
});

test('extractNameFromPDFText ignores single-word lines', () => {
	const text = `Resume
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores section headers', () => {
	const text = `Summary
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores ALL-CAPS lines', () => {
	const text = `JOHN SMITH
Jane Doe`;
	assert.equal(extractNameFromPDFText(text), 'Jane Doe');
});

// ─── Job Title / Role Filtering ────

test('extractNameFromPDFText ignores job title "Senior SDET" and finds real name', () => {
	const text = `Senior SDET
Juan Ignacio Cañete
Email: juan@example.com`;
	assert.equal(extractNameFromPDFText(text), 'Juan Ignacio Cañete');
});

test('extractNameFromPDFText ignores job title "Software Engineer"', () => {
	const text = `Software Engineer
Jane Doe`;
	assert.equal(extractNameFromPDFText(text), 'Jane Doe');
});

test('extractNameFromPDFText ignores job title "Fullstack Developer"', () => {
	const text = `Fullstack Developer
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores job title "QA Automation Engineer"', () => {
	const text = `QA Automation Engineer
Maria Lopez`;
	assert.equal(extractNameFromPDFText(text), 'Maria Lopez');
});

test('extractNameFromPDFText ignores job title "Lead Software Architect"', () => {
	const text = `Lead Software Architect
Carlos Ruiz`;
	assert.equal(extractNameFromPDFText(text), 'Carlos Ruiz');
});

// ─── Edge Cases ─────────────────────────────────────────────────────

test('extractNameFromPDFText ignores lines longer than 60 characters', () => {
	const longLine = 'A'.repeat(61);
	const text = `${longLine}
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores lines shorter than 3 characters', () => {
	const text = `AB
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText returns first valid name found', () => {
	const text = `First Person
Second Person
Third Person`;
	assert.equal(extractNameFromPDFText(text), 'First Person');
});

test('extractNameFromPDFText handles whitespace correctly', () => {
	const text = `   John   Smith  
Software Engineer`;
	assert.equal(extractNameFromPDFText(text), 'John   Smith');
});

test('extractNameFromPDFText ignores lines starting with @ symbol', () => {
	const text = `@username
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText ignores www prefix lines', () => {
	const text = `www.example.com
John Smith`;
	assert.equal(extractNameFromPDFText(text), 'John Smith');
});

test('extractNameFromPDFText returns null when no valid name found', () => {
	const text = `john@example.com
Phone: 555-1234
Location: NYC
https://github.com`;
	assert.equal(extractNameFromPDFText(text), null);
});
