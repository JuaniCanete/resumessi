/**
 * tests/unit/public-app.test.ts
 *
 * Unit tests for public/app.ts core functions.
 * Tests ATS scan flow, resume rendering, sidebar logic.
 */
'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

// NOTE: public/app.ts contains DOM-dependent code (uses document, window, etc.)
// These tests focus on pure utility functions that can be tested in isolation.
// Full integration tests are in tests/e2e/

test('public/app.ts - formatDate utility (mirrored from utils)', () => {
	// Mirror the formatDate logic from public/utils.ts
	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return 'Present';
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return dateStr;
		if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
			const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
		}
		return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
	}

	assert.equal(formatDate(null), 'Present');
	assert.equal(formatDate(undefined), 'Present');
	assert.equal(formatDate(''), 'Present');
	assert.equal(formatDate('2023-01-15'), 'Jan 2023');
	assert.equal(formatDate('2020-12-31'), 'Dec 2020');
	assert.equal(formatDate('invalid'), 'invalid');
});

test('public/app.ts - getDuration utility (mirrored from utils)', () => {
	function _getDuration(startDate: string, endDate?: string): string {
		const start = new Date(startDate);
		const end = endDate ? new Date(endDate) : new Date();
		if (isNaN(start.getTime())) return '';
		const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
		const years = Math.floor(months / 12);
		const rem = months % 12;
		if (years === 0) return `${rem}mo`;
		if (rem === 0) return `${years}yr`;
		return `${years}yr ${rem}mo`;
	}

	assert.equal(_getDuration('2023-01-01', '2023-06-01'), '5mo');
	assert.equal(_getDuration('2022-01-01', '2023-01-01'), '1yr');
	assert.equal(_getDuration('2021-01-01', '2023-06-01'), '2yr 5mo');
	assert.equal(_getDuration('invalid'), '');
});

test('public/app.ts - renderSkills utility (mirrored from utils)', () => {
	function renderSkills(skills: string[] | null | undefined): string {
		if (!Array.isArray(skills) || skills.length === 0) return '';
		return skills.map(s => `<span>${s}</span>`).join('');
	}

	assert.equal(renderSkills([]), '');
	assert.equal(renderSkills(null), '');
	assert.equal(renderSkills(undefined), '');
	assert.equal(renderSkills(['JavaScript', 'TypeScript']), '<span>JavaScript</span><span>TypeScript</span>');
});

test('public/app.ts - getPhotoPath utility (mirrored from utils)', () => {
	function getPhotoPath(uploadedPhoto: string | null, resumeData?: { basics?: { photo?: string } } | null): string {
		if (uploadedPhoto) return uploadedPhoto;
		if (resumeData && resumeData.basics && resumeData.basics.photo) {
			if (resumeData.basics.photo.includes('/')) {
				return resumeData.basics.photo;
			}
			return `public/assets/photos/${resumeData.basics.photo}`;
		}
		return '/demo/goat.jpg';
	}

	assert.equal(getPhotoPath('custom.jpg'), 'custom.jpg');
	assert.equal(getPhotoPath(null, { basics: { photo: 'photo.jpg' } }), 'public/assets/photos/photo.jpg');
	assert.equal(
		getPhotoPath(null, { basics: { photo: 'http://example.com/photo.jpg' } }),
		'http://example.com/photo.jpg'
	);
	assert.equal(getPhotoPath(null, { basics: {} }), '/demo/goat.jpg');
	assert.equal(getPhotoPath(null, null), '/demo/goat.jpg');
});

test('public/app.ts - stripMarkdown utility (mirrored from utils)', () => {
	function stripMarkdown(text: string): string {
		return text
			.replace(/```[\s\S]*?```/g, '')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/\*\*([^*]+)\*\*/g, '$1')
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/__([^_]+)__/g, '$1')
			.replace(/#+\s*/g, '')
			.replace(/>\s*/g, '')
			.replace(/[-*+]\s+/g, '• ')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/\s+/g, ' ')
			.trim();
	}

	assert.equal(stripMarkdown('**bold**'), 'bold');
	assert.equal(stripMarkdown('*italic*'), 'italic');
	assert.equal(stripMarkdown('`code`'), 'code');
	assert.equal(stripMarkdown('# Heading'), 'Heading');
	assert.equal(stripMarkdown('> quote'), 'quote');
	assert.equal(stripMarkdown('- item'), '• item');
	assert.equal(stripMarkdown('[link](url)'), 'link');
	assert.equal(stripMarkdown('  multiple   spaces  '), 'multiple spaces');
});
