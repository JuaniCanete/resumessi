import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripMarkdown, buildQueryUrl } from '../../public/utils';

// ─── stripMarkdown ────────────────────────────────────────────────────

test('stripMarkdown removes fenced code blocks', () => {
  const input = 'Before\n```js\nconst x = 1;\n```\nAfter';
  const result = stripMarkdown(input);
  assert.ok(!result.includes('const x'));
  assert.ok(result.includes('Before'));
  assert.ok(result.includes('After'));
});

test('stripMarkdown removes inline code backticks', () => {
  assert.equal(stripMarkdown('Use `npm install` here'), 'Use npm install here');
});

test('stripMarkdown removes bold and italic markers', () => {
  assert.equal(stripMarkdown('**bold** and *italic*'), 'bold and italic');
});

test('stripMarkdown removes heading markers', () => {
  assert.equal(stripMarkdown('## Heading\n# Big'), 'Heading Big');
});

test('stripMarkdown removes blockquote markers', () => {
  assert.equal(stripMarkdown('> quoted text'), 'quoted text');
});

test('stripMarkdown converts list markers to bullets', () => {
  assert.equal(stripMarkdown('- item one\n- item two'), '• item one • item two');
});

test('stripMarkdown converts markdown links to plain text', () => {
  assert.equal(stripMarkdown('[OpenAI](https://openai.com)'), 'OpenAI');
});

test('stripMarkdown collapses whitespace and trims', () => {
  assert.equal(stripMarkdown('  hello   world  '), 'hello world');
});

test('stripMarkdown handles empty string', () => {
  assert.equal(stripMarkdown(''), '');
});

// ─── buildQueryUrl ────────────────────────────────────────────────────

test('buildQueryUrl builds LinkedIn URL with role, and maps seniority to f_E', () => {
  const url = buildQueryUrl('linkedin', {
    role: 'SDET',
    seniority: 'Senior',
  });
  const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
  assert.ok(decoded.startsWith('https://www.linkedin.com/jobs/search/?keywords='));
  assert.ok(decoded.includes('SDET'));
  // Seniority is encoded as the LinkedIn f_E numeric filter, not plain text
  assert.ok(decoded.includes('f_E=4'));
});

test('buildQueryUrl includes employment type, region, country, currency for LinkedIn', () => {
  const url = buildQueryUrl('linkedin', {
    role: 'Backend Engineer',
    employmentType: 'fulltime',
    region: 'LATAM',
    country: 'Argentina',
    currency: 'USD',
  });
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('fulltime'));
  assert.ok(decoded.includes('LATAM'));
  assert.ok(decoded.includes('Argentina'));
  assert.ok(decoded.includes('USD'));
});

test('buildQueryUrl builds Google URL with default domains', () => {
  const url = buildQueryUrl('google', { role: 'SDET' });
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.startsWith('https://www.google.com/search?q='));
  assert.ok(decoded.includes('site:teamtailor.com'));
  assert.ok(decoded.includes('site:greenhouse.io'));
});

test('buildQueryUrl combines region and country into quoted group for Google', () => {
  const url = buildQueryUrl('google', {
    role: 'SDET',
    region: 'LATAM',
    country: 'Argentina',
  });
  const decoded = decodeURIComponent(url);
  assert.ok(decoded.includes('"LATAM" OR "Argentina"'));
});

test('buildQueryUrl URL-encodes special characters', () => {
  const url = buildQueryUrl('linkedin', { role: 'Fullstack Engineer / Developer' });
  assert.ok(!url.includes(' '));
  // URLSearchParams form-encodes spaces as '+'; decode them back to spaces
  const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
  assert.ok(decoded.includes('Fullstack Engineer / Developer'));
});

test('buildQueryUrl returns base URL when no query parts provided', () => {
  assert.equal(buildQueryUrl('linkedin', {}), 'https://www.linkedin.com/jobs/search/?keywords=');
  // Google always includes the default job-board domains even with no query parts
  const googleUrl = buildQueryUrl('google', {});
  const decoded = decodeURIComponent(googleUrl);
  assert.ok(decoded.startsWith('https://www.google.com/search?q='));
  assert.ok(decoded.includes('site:teamtailor.com'));
});
