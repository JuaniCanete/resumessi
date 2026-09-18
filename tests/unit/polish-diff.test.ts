'use strict';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	computeDiff,
	mergeDiff,
	formatSectionForDisplay,
	stableStringify,
	DiffSection,
} from '../../public/utils/polish-diff';

test('computeDiff - returns empty array for identical objects', () => {
	const original = { summary: 'test', experience: [] };
	const polished = { summary: 'test', experience: [] };
	assert.deepEqual(computeDiff(original, polished), []);
});

test('computeDiff - detects summary change', () => {
	const original = { summary: 'old summary' };
	const polished = { summary: 'new summary' };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.equal(diff[0].id, 'summary');
	assert.equal(diff[0].label, 'Summary');
	assert.equal(diff[0].oldRaw, 'old summary');
	assert.equal(diff[0].newRaw, 'new summary');
});

test('computeDiff - detects basics title change', () => {
	const original = { basics: { name: 'John', title: 'Dev' } };
	const polished = { basics: { name: 'John', title: 'Senior Dev' } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.equal(diff[0].id, 'basics-title');
	assert.equal(diff[0].label, 'Professional Title');
});

test('computeDiff - detects basics location change', () => {
	const original = { basics: { location: 'NYC' } };
	const polished = { basics: { location: 'SF' } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.equal(diff[0].label, 'Location');
});

test('computeDiff - detects basics summary change', () => {
	const original = { basics: { summary: 'old' } };
	const polished = { basics: { summary: 'new' } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.equal(diff[0].label, 'Summary');
});

test('computeDiff - ignores basics name change (personal data)', () => {
	const original = { basics: { name: 'John', email: 'j@j.com' } };
	const polished = { basics: { name: 'Jane', email: 'j@j.com' } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 0);
});

test('computeDiff - ignores basics email change (personal data)', () => {
	const original = { basics: { email: 'a@a.com' } };
	const polished = { basics: { email: 'b@b.com' } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 0);
});

test('computeDiff - ignores basics phone change (personal data)', () => {
	const original = { basics: { phone: '123' } };
	const polished = { basics: { phone: '456' } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 0);
});

test('computeDiff - ignores basics linkedin/github/photo changes (personal data)', () => {
	const original = { basics: { linkedin: 'a', github: 'b', photo: 'c' } };
	const polished = { basics: { linkedin: 'x', github: 'y', photo: 'z' } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 0);
});

test('computeDiff - detects experience array changes', () => {
	const original = { experience: [{ title: 'Dev', company: 'A' }] };
	const polished = {
		experience: [
			{ title: 'Dev', company: 'A' },
			{ title: 'Lead', company: 'B' },
		],
	};
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.ok(diff[0].id.startsWith('experience-'));
	assert.ok(diff[0].label.includes('Lead at B'));
});

test('computeDiff - detects experience content change', () => {
	const original = { experience: [{ title: 'Dev', company: 'A', highlights: ['old'] }] };
	const polished = { experience: [{ title: 'Dev', company: 'A', highlights: ['new'] }] };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.deepEqual(diff[0].oldRaw, { title: 'Dev', company: 'A', highlights: ['old'] });
	assert.deepEqual(diff[0].newRaw, { title: 'Dev', company: 'A', highlights: ['new'] });
});

test('computeDiff - detects education changes', () => {
	const original = { education: [{ institution: 'MIT', degree: 'BS' }] };
	const polished = { education: [{ institution: 'MIT', degree: 'MS' }] };
	const diff = computeDiff(original, polished);
	// Identity uses institution|degree, so changing both creates new identity = 2 diffs (old removed, new added)
	assert.equal(diff.length, 2);
	assert.ok(diff[0].id.startsWith('education-'));
	assert.ok(diff[1].id.startsWith('education-'));
});

test('computeDiff - detects skills category changes', () => {
	const original = { skills: { 'Core Skills': [{ name: 'JS' }] } };
	const polished = { skills: { 'Core Skills': [{ name: 'JS' }, { name: 'TS' }] } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.equal(diff[0].id, 'skills-Core-Skills');
	assert.equal(diff[0].label, 'Skills: Core Skills');
});

test('computeDiff - detects new skills category', () => {
	const original = { skills: { 'Core Skills': [{ name: 'JS' }] } };
	const polished = { skills: { 'Core Skills': [{ name: 'JS' }], 'New Cat': [{ name: 'Go' }] } };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.equal(diff[0].label, 'Skills: New Cat');
});

test('computeDiff - detects certifications changes', () => {
	const original = { certifications: [{ title: 'AWS' }] };
	const polished = { certifications: [{ title: 'AWS' }, { title: 'GCP' }] };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.ok(diff[0].id.startsWith('certifications-'));
});

test('computeDiff - detects projects changes', () => {
	const original = { projects: [{ name: 'Proj1' }] };
	const polished = { projects: [{ name: 'Proj1' }, { name: 'Proj2' }] };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.ok(diff[0].id.startsWith('projects-'));
});

test('computeDiff - detects talks changes', () => {
	const original = { talks: [{ title: 'Talk1' }] };
	const polished = { talks: [{ title: 'Talk1' }, { title: 'Talk2' }] };
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.ok(diff[0].id.startsWith('talks-'));
});

test('mergeDiff - merges accepted summary change', () => {
	const original = { summary: 'old' };
	const sections: DiffSection[] = [
		{
			id: 'summary',
			label: 'Summary',
			path: ['summary'],
			oldRaw: 'old',
			newRaw: 'new',
			oldDisplay: 'old',
			newDisplay: 'new',
			accepted: true,
		},
	];
	const result = mergeDiff(original, sections);
	assert.equal(result.summary, 'new');
});

test('mergeDiff - keeps original for rejected change', () => {
	const original = { summary: 'old' };
	const sections: DiffSection[] = [
		{
			id: 'summary',
			label: 'Summary',
			path: ['summary'],
			oldRaw: 'old',
			newRaw: 'new',
			oldDisplay: 'old',
			newDisplay: 'new',
			accepted: false,
		},
	];
	const result = mergeDiff(original, sections);
	assert.equal(result.summary, 'old');
});

test('mergeDiff - merges basics title change', () => {
	const original = { basics: { name: 'John', title: 'Dev' } };
	const sections: DiffSection[] = [
		{
			id: 'basics.title',
			label: 'Professional Title',
			path: ['basics', 'title'],
			oldRaw: 'Dev',
			newRaw: 'Senior Dev',
			oldDisplay: 'Dev',
			newDisplay: 'Senior Dev',
			accepted: true,
		},
	];
	const result = mergeDiff(original, sections) as { basics: { title: string } };
	assert.equal(result.basics.title, 'Senior Dev');
});

test('mergeDiff - merges experience array addition', () => {
	const original = { experience: [{ title: 'Dev', company: 'A' }] };
	const sections: DiffSection[] = [
		{
			id: 'experience::Dev|A',
			label: 'Dev at A',
			path: ['experience', 1],
			oldRaw: null,
			newRaw: { title: 'Lead', company: 'B' },
			oldDisplay: '',
			newDisplay: 'Lead at B',
			accepted: true,
		},
	];
	const result = mergeDiff(original, sections) as { experience: Array<{ title: string }> };
	assert.equal(result.experience.length, 2);
	assert.equal(result.experience[1].title, 'Lead');
});

test('mergeDiff - inserts entry before existing entries via splice', () => {
	const original = {
		experience: [
			{ title: 'A', company: 'X' },
			{ title: 'B', company: 'Y' },
		],
	};
	const sections: DiffSection[] = [
		{
			id: 'experience::C|Z',
			label: 'C at Z',
			path: ['experience', 0],
			oldRaw: null,
			newRaw: { title: 'C', company: 'Z' },
			oldDisplay: '(New section)',
			newDisplay: 'C at Z',
			accepted: true,
		},
	];
	const result = mergeDiff(original, sections) as { experience: Array<{ title: string }> };
	assert.equal(result.experience.length, 3);
	assert.equal(result.experience[0].title, 'C');
	assert.equal(result.experience[1].title, 'A');
	assert.equal(result.experience[2].title, 'B');
});

test('mergeDiff - removes experience array item when accepted with null newRaw', () => {
	const original = {
		experience: [
			{ title: 'Dev', company: 'A' },
			{ title: 'Lead', company: 'B' },
		],
	};
	const sections: DiffSection[] = [
		{
			id: 'experience::Lead|B',
			label: 'Lead at B',
			path: ['experience', 1],
			oldRaw: { title: 'Lead', company: 'B' },
			newRaw: null,
			oldDisplay: 'Lead at B',
			newDisplay: '(Removed)',
			accepted: true,
		},
	];
	const result = mergeDiff(original, sections) as { experience: Array<{ title: string }> };
	assert.equal(result.experience.length, 1);
	assert.equal(result.experience[0].title, 'Dev');
});

test('mergeDiff - merges skills category change', () => {
	const original = { skills: { 'Core Skills': [{ name: 'JS' }] } };
	const sections: DiffSection[] = [
		{
			id: 'skills::Core Skills',
			label: 'Skills: Core Skills',
			path: ['skills', 'Core Skills'],
			oldRaw: [{ name: 'JS' }],
			newRaw: [{ name: 'JS' }, { name: 'TS' }],
			oldDisplay: 'JS',
			newDisplay: 'JS, TS',
			accepted: true,
		},
	];
	const result = mergeDiff(original, sections) as { skills: { 'Core Skills': Array<{ name: string }> } };
	assert.equal(result.skills['Core Skills'].length, 2);
});

test('formatSectionForDisplay - formats string value', () => {
	assert.equal(formatSectionForDisplay('summary', 'hello world'), 'hello world');
});

test('formatSectionForDisplay - formats experience object', () => {
	const exp = {
		title: 'Dev',
		company: 'Acme',
		startDate: '2020',
		endDate: '2023',
		description: 'Built stuff',
		highlights: ['a', 'b'],
	};
	const result = formatSectionForDisplay('experience', exp);
	assert.ok(result.includes('Dev at Acme'));
	assert.ok(result.includes('2020 – 2023'));
	assert.ok(result.includes('Built stuff'));
	assert.ok(result.includes('- a'));
	assert.ok(result.includes('- b'));
});

test('formatSectionForDisplay - formats education object', () => {
	const edu = { degree: 'BS', institution: 'MIT', year: '2020' };
	const result = formatSectionForDisplay('education', edu);
	assert.equal(result, 'BS\nMIT\n2020');
});

test('formatSectionForDisplay - formats certification object', () => {
	const cert = { title: 'AWS', issuer: 'Amazon', date: '2023' };
	const result = formatSectionForDisplay('certifications', cert);
	assert.equal(result, 'AWS\nAmazon\n2023');
});

test('formatSectionForDisplay - formats array of strings', () => {
	assert.equal(formatSectionForDisplay('skills', ['JS', 'TS']), 'JS, TS');
});

test('formatSectionForDisplay - formats array of objects with name', () => {
	const skills = [{ name: 'JS', expert: true }, { name: 'TS' }];
	const result = formatSectionForDisplay('skills', skills);
	assert.equal(result, '  JS (expert)\n  TS');
});

test('formatSectionForDisplay - handles null value', () => {
	assert.equal(formatSectionForDisplay('summary', null), '');
});

test('formatSectionForDisplay - handles undefined value', () => {
	assert.equal(formatSectionForDisplay('summary', undefined), '');
});

test('formatSectionForDisplay - formats array of generic objects', () => {
	const items = [{ foo: 'bar' }, { baz: 123 }];
	const result = formatSectionForDisplay('custom', items);
	assert.ok(result.includes('foo'));
	assert.ok(result.includes('baz'));
});

test('formatSectionForDisplay - formats generic object (fallback JSON)', () => {
	const obj = { customField: 'value', another: 42 };
	const result = formatSectionForDisplay('unknown', obj);
	assert.ok(result.includes('customField'));
	assert.ok(result.includes('value'));
});

test('formatSectionForDisplay - formats number value', () => {
	assert.equal(formatSectionForDisplay('count', 42), '42');
});

test('formatSectionForDisplay - formats boolean value', () => {
	assert.equal(formatSectionForDisplay('flag', true), 'true');
});

test('computeDiff - treats nested objects equal regardless of key insertion order', () => {
	const original = {
		experience: [{ title: 'Dev', company: 'A', bullets: ['shipped X'] }],
	};
	const polished = {
		experience: [{ company: 'A', bullets: ['shipped X'], title: 'Dev' }],
	};
	assert.deepEqual(computeDiff(original, polished), []);
});

test('stableStringify - sorts object keys for stable comparison', () => {
	assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
	assert.notEqual(JSON.stringify({ b: 1, a: 2 }), JSON.stringify({ a: 2, b: 1 }));
});

test('computeDiff - keeps duplicate experience entries distinct', () => {
	const original = {
		experience: [
			{ title: 'Dev', company: 'A' },
			{ title: 'Dev', company: 'A' },
		],
	};
	const polished = {
		experience: [
			{ title: 'Dev', company: 'A' },
			{ title: 'Dev', company: 'A', description: 'new' },
		],
	};
	const diff = computeDiff(original, polished);
	assert.equal(diff.length, 1);
	assert.ok(diff[0].id.startsWith('experience-'));
	assert.ok(/-1$/.test(diff[0].id));
});
