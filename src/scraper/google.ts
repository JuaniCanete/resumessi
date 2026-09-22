import { createScraperDebugSession, type ScraperDebugSession } from '../utils/logger';
import { buildScraperSearchUrl, buildSingleRoleQuery, parseRoleTerms, DEFAULT_TARGET_DOMAINS } from './pagination';
import type { ScraperQuery, ScraperResult } from './types';

export { DEFAULT_TARGET_DOMAINS };

/**
 * Google wraps external result links in a redirect URL:
 *   https://www.google.com/url?q=<real-url>&sa=U&...
 * Extract the real destination URL from the `q` parameter.
 */
export function extractGoogleResultUrl(rawUrl: string): string {
	if (!rawUrl) return '';
	try {
		const parsed = new URL(rawUrl);
		if (parsed.hostname.includes('google.com') && parsed.pathname === '/url' && parsed.searchParams.has('q')) {
			return parsed.searchParams.get('q') || '';
		}
	} catch {
		// Not a valid URL — fall through
	}
	return rawUrl;
}

export async function scrapeGoogle(
	query: ScraperQuery,
	env: Record<string, string | undefined>
): Promise<ScraperResult[]> {
	const apiKey = env.GOOGLE_API_KEY;

	if (!apiKey) {
		console.error('[Google Scraper] Error: GOOGLE_API_KEY is missing in env.');
		return [];
	}

	const roleTerms =
		query.roleTerms && query.roleTerms.length > 0 ? query.roleTerms : query.role ? parseRoleTerms(query.role) : [];
	query.roleTerms = roleTerms;
	const split = query.splitRoles !== false && roleTerms.length > 1;

	const debugSession = createScraperDebugSession('google');
	const executedQueries: string[] = [];
	const seenUrls = new Set<string>();

	if (!split) {
		// Legacy single-query path (splitRoles === false or at most one role term)
		const googleSearchUrl = buildScraperSearchUrl('google', query);
		let searchQuery: string;
		try {
			searchQuery = new URL(googleSearchUrl).searchParams.get('q') || '';
		} catch (err: unknown) {
			console.error('[Google Scraper] Failed to parse search query string:', (err as Error).message);
			return [];
		}
		if (!searchQuery) {
			console.warn('[Google Scraper] Warning: Empty search query compiled.');
			return [];
		}
		executedQueries.push(searchQuery);
		debugSession.log(`Starting scrape for query: "${searchQuery}"`);
		const { results } = await scrapeGoogleSingleQuery(
			searchQuery,
			query,
			apiKey,
			debugSession,
			'google',
			MAX_TOTAL_ITEMS,
			seenUrls,
			roleTerms.length === 1 ? roleTerms[0] : undefined
		);
		query.executedQueries = executedQueries;
		return results.slice(0, MAX_TOTAL_ITEMS);
	}

	// Split path: one sequential SerpAPI queue entry per role term, merged in CSV order.
	debugSession.log(`Split scrape: ${roleTerms.length} role terms`);
	const merged: ScraperResult[] = [];
	for (let i = 0; i < roleTerms.length; i++) {
		if (merged.length >= MAX_TOTAL_ITEMS) {
			console.info(`[Google Scraper] Reached max items (${MAX_TOTAL_ITEMS}), stopping role queue`);
			debugSession.log(`Reached max items (${MAX_TOTAL_ITEMS}), stopping role queue`);
			break;
		}
		if (i > 0) {
			console.info(`[Google Scraper] Waiting ${ROLE_TERM_DELAY_MS / 1000}s before next role term...`);
			// Skipped in tests so the suite stays fast; production always waits.
			if (process.env.NODE_ENV !== 'test') {
				await new Promise(r => setTimeout(r, ROLE_TERM_DELAY_MS));
			}
		}
		const term = roleTerms[i];
		const searchQuery = buildSingleRoleQuery(term, query);
		if (!searchQuery) {
			console.warn(`[Google Scraper] Warning: Empty search query compiled for role term "${term}".`);
			continue;
		}
		executedQueries.push(searchQuery);
		console.info(`[Google Scraper] Scraping role term "${term}" (${i + 1}/${roleTerms.length})`);
		debugSession.log(`Role term ${i + 1}/${roleTerms.length} "${term}": "${searchQuery}"`);
		const { results, hitQuota } = await scrapeGoogleSingleQuery(
			searchQuery,
			query,
			apiKey,
			debugSession,
			`google-${sanitizeTermForFilename(term)}`,
			MAX_TOTAL_ITEMS - merged.length,
			seenUrls,
			term
		);
		merged.push(...results);
		debugSession.log(`Role term "${term}": kept ${results.length} results`);
		if (hitQuota) {
			debugSession.log(`Role term "${term}" hit quota (429), continuing to next term`, 'WARN');
		}
	}
	query.executedQueries = executedQueries;
	console.info(`[Google Scraper] Split scrape done: ${merged.length} results from ${executedQueries.length} queries`);
	return merged.slice(0, MAX_TOTAL_ITEMS);
}

const MAX_TOTAL_ITEMS = 50;
const MAX_GOOGLE_PAGES = 10;
const ROLE_TERM_DELAY_MS = 10000;

function sanitizeTermForFilename(term: string): string {
	return (
		term
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'role'
	);
}

async function scrapeGoogleSingleQuery(
	searchQuery: string,
	query: ScraperQuery,
	apiKey: string,
	debugSession: ScraperDebugSession,
	artifactPrefix: string,
	maxItems: number,
	seenUrls: Set<string>,
	roleTerm?: string
): Promise<{ results: ScraperResult[]; hitQuota: boolean }> {
	const results: ScraperResult[] = [];
	const pageCount = Math.min(query.pageCount ?? 10, MAX_GOOGLE_PAGES);
	const startPage = query.startPage ?? 1;
	const safeQuery = [...searchQuery]
		.filter(c => {
			const code = c.codePointAt(0) ?? 32;
			return code >= 32 && code !== 127 && !(code >= 128 && code <= 159);
		})
		.join('')
		.substring(0, 2048);
	if (safeQuery !== searchQuery) {
		console.warn('[Google Scraper] Warning: search query sanitized (control chars stripped, capped at 2048).');
	}
	console.info(
		`[Google Scraper] Scraping up to ${pageCount} page(s) starting from page ${startPage} ` +
			`of SerpAPI for query: "${safeQuery}" (max ${maxItems} items)`
	);
	for (let page = 0; page < pageCount; page++) {
		if (results.length >= maxItems) {
			break;
		}
		const startParam = (startPage - 1 + page) * 10;
		const apiUrl = new URL('https://serpapi.com/search.json?engine=google');
		apiUrl.searchParams.set('api_key', apiKey);
		apiUrl.searchParams.set('q', safeQuery);
		apiUrl.searchParams.set('start', String(startParam));
		apiUrl.searchParams.set('tbs', 'qdr:m');

		try {
			const response = await fetch(apiUrl.toString());
			if (response.status === 429) {
				console.error('[Google Scraper] SerpAPI quota exceeded (HTTP 429).');
				debugSession.log('SerpAPI quota exceeded (HTTP 429).', 'ERROR');
				// Low 429 risk in practice (30+ calls/min observed fine); skip this term and continue.
				// If 429s start appearing, implement retry-fallback with backoff here.
				return { results, hitQuota: true };
			}

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[Google Scraper] SerpAPI error (HTTP ${response.status}):`, errorText);
				debugSession.log(`SerpAPI error (HTTP ${response.status}): ${errorText}`, 'ERROR');
				break;
			}

			const data = await response.json();
			const items = data.organic_results || [];
			console.info(`[Google Scraper] Received ${items.length} items from SerpAPI for page ${page + 1}`);
			debugSession.log(`Page ${page + 1} (startParam ${startParam}): Received ${items.length} items`);

			// Save SerpAPI response for debugging pagination behavior
			debugSession.saveArtifact(`${artifactPrefix}-page-${startPage + page}.json`, JSON.stringify(data, null, 2));

			// Only keep results whose hostname is one of the targeted ATS domains
			// AND whose URL path looks like an actual job posting.
			const allowedDomains = (
				query.customDomains !== undefined && query.customDomains !== null ? query.customDomains : DEFAULT_TARGET_DOMAINS
			).map(d => d.trim().toLowerCase());

			// Job-board hostnames that should accept any path (their hostname alone
			// identifies the result as a listing). We still enforce the domain
			// allowlist above, so this is a permissive second signal only for ATS
			// domains that don't always expose `/jobs/` in the URL path.
			const JOB_BOARD_HOSTS = new Set([
				'jobs.lever.co',
				'jobs.ashbyhq.com',
				'myworkdayjobs.com',
				'teamtailor.com',
				'boards.greenhouse.io',
				'bamboohr.com',
				'torre.ai',
				'jobs.dayforcehcm.com',
			]);

			for (const item of items) {
				const title = item.title || '';
				const rawUrl = item.link || '';
				const snippet = item.snippet || '';

				const url = extractGoogleResultUrl(rawUrl);

				if (!title || !url || url.includes('google.com/search') || url.includes('accounts.google')) {
					continue;
				}

				let parsedUrl: URL;
				try {
					parsedUrl = new URL(url);
				} catch {
					continue;
				}
				const hostname = parsedUrl.hostname.toLowerCase();
				// Strip leading "www." for comparison
				const bareHost = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
				const isAllowed = allowedDomains.some(d => bareHost === d || bareHost.endsWith(`.${d}`));
				if (!isAllowed) continue;

				const isJobBoardHost = JOB_BOARD_HOSTS.has(bareHost);
				if (!isJobBoardHost) {
					const JOB_PATH_PATTERNS = [
						'/jobs/',
						'/job/',
						'/careers',
						'/positions',
						'/position/',
						'/job-board',
						'/openings',
						'/listing',
						'/joblist',
					];
					const pathname = parsedUrl.pathname.toLowerCase();
					const looksLikeJob = JOB_PATH_PATTERNS.some(p => pathname.includes(p));
					if (!looksLikeJob) {
						console.info(`[Google Scraper] Skipping non-listing result (${url})`);
						continue;
					}
				}

				const dedupeKey = url.trim().toLowerCase();
				if (seenUrls.has(dedupeKey)) {
					continue;
				}
				seenUrls.add(dedupeKey);
				results.push({
					title,
					url,
					snippet: snippet || title,
					source: 'google',
					site: bareHost,
					...(roleTerm ? { roleTerm } : {}),
				});

				// Stop if we've collected max items
				if (results.length >= maxItems) {
					console.info(`[Google Scraper] Reached max items (${maxItems}), stopping pagination`);
					break;
				}
			}

			// If we got fewer than 10 results, there is no next page
			if (items.length < 10) {
				break;
			}
		} catch (err: unknown) {
			console.error('[Google Scraper] Network or parsing error:', (err as Error).message);
			break;
		}
	}

	return { results: results.slice(0, maxItems), hitQuota: false };
}
