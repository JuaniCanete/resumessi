import type { ScraperQuery } from './types';

export const DEFAULT_TARGET_DOMAINS = [
    'teamtailor.com',
    'greenhouse.io',
    'lever.co',
    'workday.com',
    'jobs.ashbyhq.com',
];

const LINKEDIN_SENIORITY_MAP: Record<string, string> = {
    internship: '1',
    entry: '2',
    associate: '3',
    mid: '4',
    senior: '4',
    director: '5',
    executive: '6',
};

const LINKEDIN_DATE_POSTED_MAP: Record<string, string> = {
    day: 'r86400',
    week: 'r604800',
    month: 'r2592000',
};

const LINKEDIN_WORK_TYPE_MAP: Record<string, string> = {
    onsite: '1',
    hybrid: '3',
    remote: '2',
};

/**
 * Build a search URL for LinkedIn or Google from a scraper query.
 * Single source of truth for query composition (role, keywords,
 * employment type, country, region, currency, domain selection).
 */
export function buildScraperSearchUrl(source: 'linkedin' | 'google', query: ScraperQuery): string {
    const parts: string[] = [];

    if (source === 'linkedin') {
        // Process keywords: split by comma, trim, and join with spaces
        if (query.keywords) {
            const keywordTerms = query.keywords
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);
            if (keywordTerms.length > 0) {
                parts.push(keywordTerms.join(' '));
            }
        }
        if (query.role) parts.push(query.role);
        if (query.employmentType) parts.push(query.employmentType);
        if (query.region) parts.push(query.region);
        if (query.country) parts.push(query.country);
        if (query.currency) parts.push(query.currency);

        const fullQuery = parts.join(' ');
        const url = new URL('https://www.linkedin.com/jobs/search/');
        // URLSearchParams.set handles encoding — do NOT wrap with encodeURIComponent
        url.searchParams.set('keywords', fullQuery);

        if (query.seniority) {
            const mapped = LINKEDIN_SENIORITY_MAP[query.seniority.toLowerCase()];
            if (mapped) url.searchParams.set('f_E', mapped);
        }
        if (query.datePosted) {
            const mapped = LINKEDIN_DATE_POSTED_MAP[query.datePosted.toLowerCase()];
            if (mapped) url.searchParams.set('f_TPR', mapped);
        }
        if (query.workType) {
            const mapped = LINKEDIN_WORK_TYPE_MAP[query.workType.toLowerCase()];
            if (mapped) url.searchParams.set('f_WT', mapped);
        }

        return url.toString();
    }

    if (query.role) parts.push(`"${query.role}"`);
    if (query.seniority) parts.push(`"${query.seniority}"`);
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
