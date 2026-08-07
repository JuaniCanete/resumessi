import type { ScraperQuery } from './types';

export const DEFAULT_TARGET_DOMAINS = [
  'teamtailor.com',
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'jobs.ashbyhq.com',
];

/**
 * Build a search URL for LinkedIn or Google from a scraper query.
 * Single source of truth for query composition (role, seniority, stack,
 * employment type, country, region, currency, domain selection).
 */
export function buildScraperSearchUrl(source: 'linkedin' | 'google', query: ScraperQuery): string {
  const parts: string[] = [];

  if (source === 'linkedin') {
    if (query.keywords) parts.push(query.keywords);
    if (query.role) parts.push(query.role);
    if (query.seniority) parts.push(query.seniority);
    if (query.stack) parts.push(query.stack);
    if (query.employmentType) parts.push(query.employmentType);
    if (query.region) parts.push(query.region);
    if (query.country) parts.push(query.country);
    if (query.currency) parts.push(query.currency);

    const fullQuery = parts.join(' ');
    return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(fullQuery)}`;
  }

  if (query.role) parts.push(`"${query.role}"`);
  if (query.seniority) parts.push(`"${query.seniority}"`);
  if (query.stack) parts.push(query.stack);
  if (query.employmentType) parts.push(query.employmentType);

  // Empty array means "no custom selection" → fall back to defaults
  const domains = query.customDomains !== undefined && query.customDomains !== null && query.customDomains.length > 0
    ? query.customDomains
    : DEFAULT_TARGET_DOMAINS;

  if (domains.length > 0) {
    const siteQuery = domains.map(d => `site:${d.trim()}`).join(' OR ');
    parts.push(`(${siteQuery})`);
    parts.push('("careers" OR "jobs" OR "open positions")');
  }

  // Combine country and region into a single quoted group, e.g. ("LATAM" OR "Argentina")
  const locationParts: string[] = [];
  if (query.region) locationParts.push(query.region);
  if (query.country) locationParts.push(query.country);
  if (locationParts.length > 0) {
    parts.push(`(${locationParts.map(l => `"${l}"`).join(' OR ')})`);
  }

  if (query.currency) parts.push(query.currency);

  const fullQuery = parts.join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
}

export function buildScraperSearchUrls(baseUrl: string, source: 'linkedin' | 'google', pageCount: number): string[] {
  const urls = [baseUrl];

  if (source === 'linkedin') {
    for (let page = 1; page < pageCount; page += 1) {
      const url = new URL(baseUrl);
      url.searchParams.set('start', String(page * 25));
      urls.push(url.toString());
    }
    return urls;
  }

  for (let page = 1; page < pageCount; page += 1) {
    const url = new URL(baseUrl);
    url.searchParams.set('start', String(page * 10));
    urls.push(url.toString());
  }

  return urls;
}
