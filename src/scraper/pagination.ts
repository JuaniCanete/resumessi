import type { ScraperQuery } from './types';

export const DEFAULT_TARGET_DOMAINS = [
	'myworkdayjobs.com',
	'jobs.ashbyhq.com',
	'teamtailor.com',
	'boards.greenhouse.io',
	'jobs.lever.co',
	'bamboohr.com',
	'torre.ai',
	'jobs.dayforcehcm.com',
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
export function buildScraperSearchUrl(source: 'linkedin' | 'google' | 'remoterocketship', query: ScraperQuery): string {
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
		if (query.seniority) parts.push(query.seniority);
		if (query.employmentType) parts.push(query.employmentType);
		if (query.region) parts.push(query.region);
		if (query.country) parts.push(query.country);
		if (query.currency) parts.push(query.currency);

		const fullQuery = parts.join(' ');
		const search = new URLSearchParams();
		search.set('keywords', fullQuery);

		if (query.seniority) {
			const mapped = LINKEDIN_SENIORITY_MAP[query.seniority.toLowerCase()];
			if (mapped) search.set('f_E', mapped);
		}
		if (query.datePosted) {
			const mapped = LINKEDIN_DATE_POSTED_MAP[query.datePosted.toLowerCase()];
			if (mapped) search.set('f_TPR', mapped);
		}
		if (query.workType) {
			const mapped = LINKEDIN_WORK_TYPE_MAP[query.workType.toLowerCase()];
			if (mapped) search.set('f_WT', mapped);
		}

		return `https://www.linkedin.com/jobs/search/?${search.toString().replace(/\+/g, '%20')}`;
	}

	if (source === 'remoterocketship') {
		// Build Remote Rocketship search URL
		// New URL pattern: https://www.remoterocketship.com/jobs/full-time/?jobsInput=full-time&page=1&sort=DateAdded&employmentType=full-time&jobTitle=...&keywords=...&locations=...&seniority=...

		const params = new URLSearchParams();
		params.set('jobsInput', 'full-time');
		params.set('page', '1');
		params.set('sort', 'DateAdded');
		params.set('employmentType', 'full-time');

		if (query.role) {
			params.set('jobTitle', query.role);
		}

		if (query.keywords) {
			params.set('keywords', query.keywords);
		}

		const location = query.country || query.region;
		if (location) {
			params.set('locations', location);
		}

		if (query.seniority) {
			params.set('seniority', query.seniority); // entry-level, junior, mid, senior, expert
		}

		return `https://www.remoterocketship.com/jobs/full-time/?${params.toString()}`;
	}

	if (query.role) {
		const role = query.role.trim();
		const hasOr = /\s+OR\s+/i.test(role);
		const hasParens = role.includes('(') || role.includes(')');
		if (hasOr && hasParens) {
			parts.push(role);
		} else {
			parts.push(`"${role}"`);
		}
	}
	if (query.keywords) {
		const keywordTerms = query.keywords
			.split(',')
			.map(k => k.trim())
			.filter(k => k.length > 0);
		for (const term of keywordTerms) {
			parts.push(`"${term}"`);
		}
	}
	if (query.seniority) parts.push(`"${query.seniority}"`);
	if (query.employmentType) parts.push(query.employmentType);

	// undefined/null → fall back to defaults; empty array → no site filtering
	const domains =
		query.customDomains !== undefined && query.customDomains !== null ? query.customDomains : DEFAULT_TARGET_DOMAINS;

	if (domains.length > 0) {
		const siteQuery = domains.map(d => `site:${d.trim()}`).join(' OR ');
		parts.push(`(${siteQuery})`);
		parts.push('("careers" OR "jobs" OR "open positions" OR "hiring")');
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

export function buildScraperSearchUrls(
	baseUrl: string,
	source: 'linkedin' | 'google' | 'remoterocketship',
	pageCount: number,
	startPage: number = 1
): string[] {
	const urls: string[] = [];

	if (source === 'linkedin') {
		for (let page = startPage; page < startPage + pageCount; page += 1) {
			if (page === startPage) {
				urls.push(baseUrl);
			} else {
				const url = new URL(baseUrl);
				url.searchParams.set('start', String((page - 1) * 25));
				urls.push(url.toString());
			}
		}
		return urls;
	}

	if (source === 'remoterocketship') {
		for (let page = startPage; page < startPage + pageCount; page += 1) {
			if (page === startPage) {
				urls.push(baseUrl);
			} else {
				const url = new URL(baseUrl);
				url.searchParams.set('page', String(page));
				urls.push(url.toString());
			}
		}
		return urls;
	}

	for (let page = startPage; page < startPage + pageCount; page += 1) {
		if (page === startPage) {
			urls.push(baseUrl);
		} else {
			const url = new URL(baseUrl);
			url.searchParams.set('start', String((page - 1) * 10));
			urls.push(url.toString());
		}
	}

	return urls;
}
