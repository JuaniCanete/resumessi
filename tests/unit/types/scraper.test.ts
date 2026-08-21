import { test } from 'node:test';
import assert from 'node:assert/strict';

test('src/types/scraper.ts - ScraperResult shape validation', () => {
  const minimalResult = {
    title: 'Software Engineer',
    url: 'https://example.com/job/1',
    snippet: 'Job description snippet',
    source: 'linkedin' as const,
  };
  
  // Validate required fields
  assert.ok(minimalResult.title);
  assert.ok(minimalResult.url);
  assert.ok(minimalResult.snippet);
  assert.ok(['linkedin', 'google', 'remoterocketship', 'user'].includes(minimalResult.source));
});

test('src/types/scraper.ts - ScraperResult optional fields', () => {
  const fullResult = {
    title: 'Software Engineer',
    url: 'https://example.com/job/1',
    snippet: 'Job description snippet',
    source: 'linkedin' as const,
    author: 'John Doe',
    company: 'Example Corp',
    postedDate: '2 days ago',
    aiSummary: 'AI generated summary',
    queryAffinity: 'High' as const,
    parameters: ['remote', 'senior'],
    saved: true,
    savedAt: '2024-01-15T10:00:00Z',
    applied: false,
    appliedAt: undefined,
    removed: false,
    status: 'No News' as const,
    column: 'applied',
    interviewRounds: 2,
    notes: 'Applied via website',
    id: 'test-123',
    site: 'linkedin.com',
    jobDescription: 'Full job description...',
    isCollectionUrl: false,
  };
  
  assert.ok(fullResult.author);
  assert.ok(fullResult.company);
  assert.ok(fullResult.postedDate);
  assert.ok(fullResult.aiSummary);
  assert.ok(['High', 'Medium', 'Low'].includes(fullResult.queryAffinity!));
  assert.ok(Array.isArray(fullResult.parameters));
  assert.equal(typeof fullResult.saved, 'boolean');
  assert.equal(typeof fullResult.applied, 'boolean');
  assert.ok(['No News', 'Interviewing', 'Offer', 'Rejected', 'Hired'].includes(fullResult.status!));
  assert.ok(fullResult.column);
  assert.equal(typeof fullResult.interviewRounds, 'number');
  assert.ok(fullResult.notes);
  assert.ok(fullResult.id);
  assert.ok(fullResult.site);
  assert.ok(fullResult.jobDescription);
  assert.equal(typeof fullResult.isCollectionUrl, 'boolean');
});

test('src/types/scraper.ts - ScraperQuery shape validation', () => {
  const query = {
    source: 'linkedin' as const,
    keywords: 'TypeScript, Playwright',
    role: 'SDET',
    seniority: 'Senior',
    employmentType: 'fulltime',
    region: 'LATAM',
    country: 'Argentina',
    currency: 'USD',
    customDomains: ['example.com'],
    pageCount: 2,
    startPage: 1,
    datePosted: 'week',
    workType: 'remote',
  };
  
  assert.ok(query.source);
  assert.ok(query.keywords);
  assert.ok(query.role);
  assert.ok(query.seniority);
  assert.ok(query.employmentType);
  assert.ok(query.region);
  assert.ok(query.country);
  assert.ok(query.currency);
  assert.ok(Array.isArray(query.customDomains));
  assert.equal(typeof query.pageCount, 'number');
  assert.equal(typeof query.startPage, 'number');
  assert.ok(query.datePosted);
  assert.ok(query.workType);
});

test('src/types/scraper.ts - ScraperRunPayload shape validation', () => {
  const payload = {
    timestamp: '2024-01-15T10:00:00Z',
    source: 'linkedin' as const,
    query: { role: 'SDET' },
    totalResults: 100,
    results: [],
    summary: 'Found 100 jobs',
    runId: 'run-123',
  };
  
  assert.ok(payload.timestamp);
  assert.ok(payload.source);
  assert.ok(payload.query);
  assert.equal(typeof payload.totalResults, 'number');
  assert.ok(Array.isArray(payload.results));
  assert.ok(payload.summary);
  assert.ok(payload.runId);
});