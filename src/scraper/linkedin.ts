import fs from 'fs';
import { generateLinkedInStorageState } from '../../scripts/linkedin-auth';
import path from 'path';
import { updateJobDescription } from '../storage/jobDataSqlite';
import type { ScraperQuery, ScraperResult } from './types';
import { buildScraperSearchUrls, buildScraperSearchUrl } from './pagination';
import { launchStealthBrowser, randomDelay } from './browser';

const STORAGE_FILE =
	process.env.LINKEDIN_STORAGE_FILE || path.join(process.cwd(), 'data', 'storage-state', 'linkedin.json');

// Markers that delimit the job description on a LinkedIn job posting page.
// The content between these two markers is the actual JD text.
const JD_START_MARKER = 'About the job';
const JD_END_MARKER = 'Set alert for similar jobs';

// Maximum number of job pages to visit for full JD extraction (to avoid long scrape times)
const MAX_JD_EXTRACTIONS = 10;

// Ordered list of selector strategies for LinkedIn job card containers. Each
// strategy is tried in sequence until one yields results. LinkedIn changes their
// DOM frequently, so we layer stable fallbacks (data-* attributes, generic
// list-item patterns) on top of the current class names.
const LINKEDIN_RESULT_SELECTOR_STRATEGIES: string[] = [
	'.job-card-container, .base-card, .jobs-search-results__list-item, .job-card-list',
	'ul.jobs-search__results-list > li',
	'li[data-occludable-job-id]',
	'article.job-card, div.job-card',
];

/**
 * Typed error thrown when the LinkedIn session (data/storage-state/linkedin.json)
 * is missing, expired, or redirected to login. The server surfaces this to the
 * user instead of silently falling back to an unauthenticated fetch (which would
 * re-fetch the login page and recreate the collection misclassification).
 */
export class LinkedInSessionExpiredError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LinkedInSessionExpiredError';
	}
}

/**
 * Normalize a LinkedIn wrapper URL (collections/search + currentJobId) to the
 * canonical single-job form `https://www.linkedin.com/jobs/view/{id}/`.
 *
 * Returns:
 *  - the canonical URL when the input is a LinkedIn job wrapper or a canonical
 *    `/jobs/view/{id}` URL,
 *  - `null` for non-job LinkedIn pages or non-LinkedIn hosts (caller falls back),
 *  - throws on a non-digit `currentJobId` to prevent path/host injection when
 *    rebuilding the URL.
 */
export function normalizeLinkedInJobUrl(rawUrl: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return null;
	}

	if (!parsed.hostname.endsWith('linkedin.com')) return null;

	const pathname = parsed.pathname;

	// Already canonical: /jobs/view/{id}/
	const viewMatch = pathname.match(/^\/jobs\/view\/(\d+)\/?$/);
	if (viewMatch) {
		return `https://www.linkedin.com/jobs/view/${viewMatch[1]}/`;
	}

	// Wrapper: /collections/... or /search/... with a currentJobId param
	const isWrapper = pathname.includes('/collections/') || pathname.includes('/search/');
	const currentJobId = parsed.searchParams.get('currentJobId');
	if (isWrapper && currentJobId) {
		if (!/^\d+$/.test(currentJobId)) {
			throw new Error(`Invalid LinkedIn currentJobId: ${currentJobId}`);
		}
		return `https://www.linkedin.com/jobs/view/${currentJobId}/`;
	}

	return null;
}

/**
 * Extract LinkedIn job card blocks from the current page.
 * Tries multiple selector strategies in order and returns results from the
 * first strategy that yields any blocks.
 */
async function extractLinkedInJobCards(page: import('playwright').Page): Promise<import('playwright').ElementHandle[]> {
	const triedSelectors: string[] = [];

	for (const selector of LINKEDIN_RESULT_SELECTOR_STRATEGIES) {
		triedSelectors.push(selector);
		try {
			const cards = await page.$$(selector);
			if (cards.length > 0) {
				console.info(`[LinkedIn Scraper] Found ${cards.length} cards using selector: ${selector}`);
				return cards;
			}
		} catch (err: unknown) {
			console.warn(`[LinkedIn Scraper] Selector failed (${selector}):`, (err as Error).message);
			continue;
		}
	}

	console.warn(
		'[LinkedIn Scraper] No cards found with any selector strategy. ' +
			`Tried: ${triedSelectors.join(' | ')}. ` +
			'LinkedIn may have changed their DOM structure or blocked automated access. ' +
			'Update LINKEDIN_RESULT_SELECTOR_STRATEGIES in src/scraper/linkedin.ts.'
	);
	return [];
}

/**
 * Extract job card postings from LinkedIn with failure diagnostics.
 */
async function extractLinkedInCards(page: import('playwright').Page, results: ScraperResult[]): Promise<void> {
	const cards = await extractLinkedInJobCards(page);

	if (cards.length === 0) {
		console.warn('[LinkedIn Scraper] Zero cards extracted from page.');
		try {
			console.info('[LinkedIn Scraper] Page title:', await page.title());
			console.info('[LinkedIn Scraper] Current URL:', page.url());
			const bodyText = await page.evaluate(() => (document.body ? document.body.innerText.substring(0, 500) : ''));
			console.info('[LinkedIn Scraper] Body text preview:', JSON.stringify(bodyText));
		} catch {
			// ignore diagnostics errors
		}
		if (process.env.SCRAPER_DEBUG === 'true') {
			const screenshotPath = path.join(process.cwd(), 'data', 'scraper-results', 'linkedin-debug.png');
			try {
				await page.screenshot({ path: screenshotPath, fullPage: true });
				console.info('[LinkedIn Scraper] Saved debug screenshot to:', screenshotPath);
			} catch {
				// ignore screenshot errors
			}
		}
		return;
	}

	for (const card of cards) {
		const titleLink = await card.$('.job-card-list__title--link');
		const title = titleLink ? (await titleLink.getAttribute('aria-label'))?.trim() || '' : '';
		const linkElem = await card.$('a[href*="/jobs/"]');
		const url = linkElem ? (await linkElem.getAttribute('href')) || '' : '';

		if (!title || !url) continue;

		// Company name: current LinkedIn DOM renders it as an <img alt="<Company> logo">
		// (or a hashed span) inside the entity lockup — the old
		// .job-card-container__primary-description / __company-name selectors no longer match.
		let company = '';
		try {
			const logoImg = await card.$('img[alt$=" logo"], img[alt$=" logo "]');
			if (logoImg) {
				const alt = (await logoImg.getAttribute('alt')) || '';
				company = alt.replace(/\s*logo\s*$/i, '').trim();
			}
			if (!company) {
				const lockupSpan = await card.$(
					'.artdeco-entity-lockup__title + * span, .scaffold-layout__list-item span[dir="ltr"]'
				);
				if (lockupSpan) {
					company = (await lockupSpan.textContent())?.trim() || '';
				}
			}
		} catch {
			// ignore company extraction errors
		}

		const rawUrl = url.startsWith('http') ? url : `https://www.linkedin.com${url}`;
		let canonicalUrl = rawUrl;
		try {
			canonicalUrl = normalizeLinkedInJobUrl(rawUrl) ?? rawUrl;
		} catch {
			// keep raw URL if normalization fails (e.g. non-digit currentJobId)
		}

		results.push({
			title,
			url: canonicalUrl,
			snippet: company ? `Company: ${company}` : '',
			source: 'linkedin',
			company,
		});
	}
}

export async function validateLinkedInStorageState(): Promise<boolean> {
	if (!fs.existsSync(STORAGE_FILE)) {
		return false;
	}
	try {
		const { browser, context } = await launchStealthBrowser({
			headless: true,
			storageStatePath: STORAGE_FILE,
		});
		const page = await context.newPage();
		await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 15000 });
		const url = page.url();
		await browser.close();
		// If redirected to login, storage state is invalid
		return !url.includes('/login') && !url.includes('/checkpoint');
	} catch {
		return false;
	}
}

// Deprecated: use buildScraperSearchUrl('linkedin', query) from pagination.ts instead
export function buildLinkedInSearchUrl(query: ScraperQuery): string {
	return buildScraperSearchUrl('linkedin', query);
}

/**
 * Extract the job description text from a LinkedIn page body, between the
 * "About the job" and "Set alert for similar jobs" markers. Returns '' when
 * the start marker is not found. Shared by the scraper and the authenticated
 * Check-JD fetch.
 */
export function extractJdTextFromBody(bodyText: string): string {
	if (!bodyText) return '';

	const startIdx = bodyText.indexOf(JD_START_MARKER);
	if (startIdx === -1) return '';

	const searchStart = startIdx + JD_START_MARKER.length;
	const endIdx = bodyText.indexOf(JD_END_MARKER, searchStart);
	const contentStart = startIdx + JD_START_MARKER.length;
	const contentEnd = endIdx === -1 ? bodyText.length : endIdx;

	return bodyText.substring(contentStart, contentEnd).trim();
}

/**
 * Navigate to an individual LinkedIn job posting page and extract the job
 * description text between the "About the job" and "Set alert for similar
 * jobs" markers.
 */
async function extractLinkedInJobDescription(page: import('playwright').Page, jobUrl: string): Promise<string> {
	try {
		await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
		await randomDelay(1500, 3000);

		// Get the full page text content
		const bodyText = await page.evaluate(() => {
			const body = document.body;
			return body ? body.innerText : '';
		});

		if (!bodyText) {
			console.warn(`[LinkedIn Scraper] JD extraction: page body text is empty for ${jobUrl}`);
			return '';
		}

		const jdText = extractJdTextFromBody(bodyText);
		console.info(
			`[LinkedIn Scraper] JD markers for ${jobUrl}: ` +
				`JD_START_MARKER="${JD_START_MARKER}" ${bodyText.includes(JD_START_MARKER) ? 'FOUND' : 'NOT FOUND'}, ` +
				`JD_END_MARKER="${JD_END_MARKER}" ${bodyText.includes(JD_END_MARKER) ? 'FOUND' : 'NOT FOUND'}`
		);
		return jdText;
	} catch (err: unknown) {
		console.warn(`[LinkedIn Scraper] JD extraction failed for ${jobUrl}:`, (err as Error).message);
		return '';
	}
}

/**
 * Session-validated JD extraction. Pure helper shared by the browser path and
 * unit tests: if the final page URL indicates a login/checkpoint redirect, the
 * session is invalid and a LinkedInSessionExpiredError is thrown (so the caller
 * never falls through to an unauthenticated fetch). Otherwise the JD markers
 * are extracted from the page body.
 */
export function extractLinkedInJdFromPage(pageUrl: string, bodyText: string): string {
	if (pageUrl.includes('/login') || pageUrl.includes('/checkpoint')) {
		throw new LinkedInSessionExpiredError('LinkedIn session expired. Run: tsx scripts/linkedin-auth.ts');
	}
	return extractJdTextFromBody(bodyText);
}

/**
 * Fetch a single LinkedIn job description via the authenticated Playwright
 * path (uses data/storage-state/linkedin.json). Normalizes wrapper URLs to the
 * canonical jobs/view form, validates the session inline (single browser
 * launch), and extracts the JD between the standard markers.
 *
 * Returns the JD text, or '' when the URL is not a LinkedIn job page or the
 * markers are not found. Throws LinkedInSessionExpiredError when the session
 * is missing/expired so the caller can surface it — never silently fall back
 * to an unauthenticated fetch (that would re-fetch the login page and recreate
 * the collection misclassification).
 */
export async function fetchLinkedInJobDescription(rawUrl: string): Promise<string> {
	const jobUrl = normalizeLinkedInJobUrl(rawUrl);
	if (!jobUrl) return '';

	// No stored session means any Playwright fetch would only return LinkedIn's
	// login page. Fail fast with the typed error instead of launching a headless
	// browser and waiting for a JD that can never render.
	if (!fs.existsSync(STORAGE_FILE)) {
		throw new LinkedInSessionExpiredError('LinkedIn session missing. Run: tsx scripts/linkedin-auth.ts');
	}

	const { browser, context } = await launchStealthBrowser({
		headless: true,
		storageStatePath: STORAGE_FILE,
	});

	try {
		const page = await context.newPage();
		await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

		// Wait for the JD to render (LinkedIn renders it client-side) instead of a
		// blind delay. Timeout is non-fatal: extraction below returns '' if absent.
		await page
			.waitForFunction(() => document.body && document.body.innerText.includes('About the job'), { timeout: 15000 })
			.catch(() => {});

		const bodyText = await page.evaluate(() => {
			const body = document.body;
			return body ? body.innerText : '';
		});

		// Inline session validation: if redirected to login/checkpoint, the stored
		// session is invalid. Throws so the caller surfaces it instead of falling
		// back to an unauthenticated fetch.
		const jd = extractLinkedInJdFromPage(page.url(), bodyText);

		// Persist JD to SQLite so retries don't re-fetch
		if (jd) {
			try {
				updateJobDescription(jobUrl, jd);
			} catch (err) {
				console.warn('[LinkedIn Scraper] Failed to save JD to DB:', (err as Error).message);
			}
		}

		return jd;
	} finally {
		await browser.close();
	}
}

/**
 * Strip session-bearing data from authenticated page HTML before it is
 * written to disk by SCRAPER_DEBUG. LinkedIn embeds csrfToken, sessionId,
 * and full profile data in the DOM — never persist it unredacted.
 */
function redactDebugHtml(html: string): string {
	let redacted = html;

	// Remove <script> blocks that reference session tokens or user data.
	redacted = redacted.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, match => {
		if (/(csrfToken|csrf-token|sessionId|li_at|JSESSIONID|bscookie|voyagerIdentity)/i.test(match)) {
			return '<!-- [redacted] script block containing session data -->';
		}
		return match;
	});

	// Remove hidden inputs that carry CSRF tokens.
	redacted = redacted.replace(/<input[^>]*name=["'][^"']*csrf[^"']*["'][^>]*>/gi, '<!-- [redacted] csrf input -->');

	// Redact known session-token values inside the serialized page state.
	redacted = redacted
		.replace(/("csrfToken"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
		.replace(/("sessionId"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
		.replace(/("li_at"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2');

	return redacted;
}

export async function scrapeLinkedIn(query: ScraperQuery): Promise<ScraperResult[]> {
	// Precondition: check state validity
	let isValid = await validateLinkedInStorageState();
	if (!isValid) {
		console.info('[LinkedIn Scraper] Storage state invalid or missing. Auto-regenerating...');
		await generateLinkedInStorageState();
		isValid = await validateLinkedInStorageState();
	}

	const { browser, context } = await launchStealthBrowser({
		headless: true,
		storageStatePath: fs.existsSync(STORAGE_FILE) ? STORAGE_FILE : undefined,
	});

	const baseUrl = buildLinkedInSearchUrl(query);
	const pageCount = query.pageCount ?? 1;
	const startPage = query.startPage ?? 1;
	const searchUrls = buildScraperSearchUrls(baseUrl, 'linkedin', pageCount, startPage);
	console.info(
		`[LinkedIn Scraper] Scraping ${searchUrls.length} page(s) starting from page ${startPage}: ${searchUrls.join(', ')}`
	);

	const page = await context.newPage();
	const results: ScraperResult[] = [];

	try {
		for (let pageIndex = 0; pageIndex < searchUrls.length; pageIndex++) {
			const searchUrl = searchUrls[pageIndex];
			await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
			await randomDelay(2000, 4000);

			// Lazy-load all job cards. LinkedIn renders the first ~7 cards and
			// keeps the remaining result slots as empty skeleton <li> placeholders
			// that only hydrate when individually scrolled into view (their
			// IntersectionObserver fires on per-element intersection, not on
			// container scrollTop). The container-scroll approach below plateaus
			// at ~7; the per-card scrollIntoView + focus approach hydrates all 25.
			const hydrated = await page.evaluate(async () => {
				const cards = document.querySelectorAll('li[id*="ember"][class*="ember-view"][data-occludable-job-id]');
				for (let i = 0; i < cards.length; i++) {
					const card = cards[i] as HTMLElement;
					card.scrollIntoView({ block: 'center', inline: 'center' });
					card.focus();
					// Yield to the event loop so IntersectionObserver callbacks flush
					await new Promise(r => setTimeout(r, 550));
				}
				return document.querySelectorAll('.job-card-container').length;
			});
			console.info(`[LinkedIn Scraper] Hydrated ${hydrated} job cards on page ${searchUrl}`);

			// Save page HTML for debugging pagination/scroll behavior (opt-in via SCRAPER_DEBUG=true).
			// The HTML is redacted first to strip session tokens and profile data from disk.
			if (process.env.SCRAPER_DEBUG === 'true') {
				try {
					const debugDir = path.join(process.cwd(), 'data', 'scraper-debug');
					if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
					const html = redactDebugHtml(await page.content());
					const debugFile = path.join(debugDir, `linkedin-page-${startPage + pageIndex}.html`);
					fs.writeFileSync(debugFile, html);
					console.info(`[LinkedIn Scraper] Saved redacted debug HTML to ${debugFile}`);
				} catch (debugErr: unknown) {
					console.warn('[LinkedIn Scraper] Failed to save debug HTML:', (debugErr as Error).message);
				}
			}

			// Extract job card postings from LinkedIn with selector strategies and failure diagnostics
			await extractLinkedInCards(page, results);

			console.info(`[LinkedIn Scraper] Page ${searchUrl} yielded ${results.length} results so far`);
		}

		// Visit individual job pages to extract the full JD
		if (results.length > 0) {
			console.info(
				`[LinkedIn Scraper] Extracting JDs for ${Math.min(results.length, MAX_JD_EXTRACTIONS)} of ${results.length} jobs...`
			);
			for (let i = 0; i < Math.min(results.length, MAX_JD_EXTRACTIONS); i++) {
				const result = results[i];
				const jdText = await extractLinkedInJobDescription(page, result.url);
				if (jdText) {
					// Append JD text to existing snippet (preserve company/location info)
					const prefix = result.snippet ? `${result.snippet}\n\n` : '';
					result.snippet = prefix + jdText;
				}
				await randomDelay(1000, 2500);
			}
		}
	} catch (err: unknown) {
		console.error('[LinkedIn Scraper] Error during scraping:', (err as Error).message);
	} finally {
		await browser.close();
	}

	return results;
}
