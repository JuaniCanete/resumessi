import { LINKEDIN_CARD_SELECTORS } from './selectors';
import fs from 'fs';
import { generateLinkedInStorageState } from '../../scripts/linkedin-auth';
import path from 'path';
import { updateJobDescription } from '../storage/jobDataSqlite';
import type { ScraperQuery, ScraperResult } from './types';
import { buildScraperSearchUrl, buildScraperSearchUrls } from './pagination';
import { launchStealthBrowser, randomDelay } from './browser';

const STORAGE_FILE =
	process.env.LINKEDIN_STORAGE_FILE || path.join(process.cwd(), 'data', 'storage-state', 'linkedin.json');

// Markers that delimit the job description on a LinkedIn job posting page.
// The content between a start marker and an end marker is the actual JD text.
//
// LinkedIn renders these in the page locale, so we list the known variants and
// pick the earliest match. English is canonical; Spanish variants handle the
// es_ES locale (otherwise extraction silently returns '' and the JD is lost).
// Start: "About the job" | "Acerca del empleo"
const JD_START_MARKERS = ['About the job', 'Acerca del empleo'];
// End: "Set alert for similar jobs" | "Configurar alerta para empleos similares" |
//              "Crear alerta para empleos similares"
const JD_END_MARKERS = [
	'Set alert for similar jobs',
	'Configurar alerta para empleos similares',
	'Crear alerta para empleos similares',
];

// Maximum number of job pages to visit for full JD extraction (to avoid long scrape times)
const MAX_JD_EXTRACTIONS = 10;

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

	for (const selector of LINKEDIN_CARD_SELECTORS) {
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
			'Update LINKEDIN_CARD_SELECTORS in src/scraper/selectors.ts.'
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

/**
 * Earliest occurrence of any marker in `markers`. Ties resolve to the first
 * listed marker (deterministic). Returns `{ index, length }` of the winner or
 * `null` when none of the markers is present. Pure — used by extraction + tests.
 */
function findEarliestMarker(bodyText: string, markers: string[]): { index: number; length: number } | null {
	let best: { index: number; length: number } | null = null;
	for (const marker of markers) {
		const idx = bodyText.indexOf(marker);
		if (idx === -1) continue;
		if (best === null || idx < best.index) best = { index: idx, length: marker.length };
	}
	return best;
}

/**
 * Extract the job description text from a LinkedIn page body, between the
 * earliest start marker and the earliest end marker that follows it. Supports
 * locale variants (e.g. Spanish "Acerca del empleo" for the es_ES locale).
 * Returns '' when no start marker is found. Shared by the scraper and the
 * authenticated Check-JD fetch.
 */
export function extractJdTextFromBody(bodyText: string): string {
	if (!bodyText) return '';

	const start = findEarliestMarker(bodyText, JD_START_MARKERS);
	if (!start) return '';

	const contentStart = start.index + start.length;
	const end = findEarliestMarker(bodyText.substring(contentStart), JD_END_MARKERS);
	const contentEnd = end === null ? bodyText.length : contentStart + end.index;

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
				`start: [${JD_START_MARKERS.filter(m => bodyText.includes(m)).join(' | ') || 'none'}], ` +
				`end: [${JD_END_MARKERS.filter(m => bodyText.includes(m)).join(' | ') || 'none'}]`
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

	// Cheap pre-flight: session file must exist (inline validation catches expiry)
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

		// Wait for the JD to render (LinkedIn renders it client-side). Wait for any
		// recognized start marker, since locale variants change the text.
		// Timeout is non-fatal: extraction below returns '' if absent.
		// (JD is fetched server-side; timeout only gates the waitForFunction call)
		await page
			.waitForFunction(
				(arg: { markers: string[] }) =>
					document.body && document.body.innerText && arg.markers.some(m => document.body.innerText.includes(m)),
				{ markers: JD_START_MARKERS },
				{ timeout: 15000 }
			)
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
 *
 * Uses generic token detection patterns to catch new/unknown token types.
 */
function redactDebugHtml(html: string): string {
	let redacted = html;

	// Generic token patterns: JWT (eyJ...), base64-like, long alphanumeric session tokens
	const TOKEN_PATTERNS = [
		/eyJ[A-Za-z0-9_-]{20,}/g, // JWT header (base64url encoded)
		/[A-Za-z0-9_-]{32,}/g, // Long alphanumeric tokens (session IDs, CSRF)
		/[A-Za-z0-9+/]{40,}={0,2}/g, // Base64 encoded data (40+ chars)
	];

	// Token key names to redact in JSON/serialized state
	const TOKEN_KEY_PATTERNS = [
		/csrfToken/i,
		/csrf[_-]?token/i,
		/sessionId/i,
		/session[_-]?id/i,
		/li_at/i,
		/JSESSIONID/i,
		/bscookie/i,
		/voyagerIdentity/i,
		/access[_-]?token/i,
		/refresh[_-]?token/i,
		/api[_-]?key/i,
		/secret/i,
		/bearer/i,
		/authorization/i,
	];

	// Remove <script> blocks that reference session tokens or user data.
	redacted = redacted.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, match => {
		// Check for known token key patterns
		if (TOKEN_KEY_PATTERNS.some(p => p.test(match))) {
			return '<!-- [redacted] script block containing session data -->';
		}
		// Check for generic token patterns
		if (TOKEN_PATTERNS.some(p => p.test(match))) {
			return '<!-- [redacted] script block containing token-like data -->';
		}
		return match;
	});

	// Remove hidden inputs that carry CSRF/token data.
	redacted = redacted.replace(/<input[^>]*type=["']hidden["'][^>]*>/gi, match => {
		if (TOKEN_KEY_PATTERNS.some(p => p.test(match))) {
			return '<!-- [redacted] hidden input with token data -->';
		}
		return match;
	});

	// Redact token values in JSON/serialized state - both key-based and generic
	// Pattern: "key": "value" where key matches token patterns OR value looks like a token
	redacted = redacted.replace(/("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/gi, (_match, key, value) => {
		// Check if key looks like a token-related field
		if (TOKEN_KEY_PATTERNS.some(p => p.test(key))) {
			return `${key}: "[REDACTED]"`;
		}
		// Check if value looks like a token (long alphanumeric, JWT, base64)
		const unquotedValue = value.slice(1, -1);
		if (TOKEN_PATTERNS.some(p => p.test(unquotedValue))) {
			return `${key}: "[REDACTED]"`;
		}
		return `${key}: ${value}`;
	});

	// Also redact unquoted JSON values that look like tokens (e.g., {token: abc123})
	redacted = redacted.replace(
		/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*([A-Za-z0-9+/_-]{32,}={0,2})/gi,
		(_match, prefix, key, value) => {
			if (TOKEN_KEY_PATTERNS.some(p => p.test(key)) || TOKEN_PATTERNS.some(p => p.test(value))) {
				return `${prefix}${key}: [REDACTED]`;
			}
			return `${prefix}${key}: ${value}`;
		}
	);

	return redacted;
}

export async function scrapeLinkedIn(query: ScraperQuery): Promise<ScraperResult[]> {
	// Precondition: check state validity
	const isValid = await validateLinkedInStorageState();
	if (!isValid) {
		console.info('[LinkedIn Scraper] Storage state invalid or missing. Auto-regenerating...');
		await generateLinkedInStorageState();
	}
	const { browser, context } = await launchStealthBrowser({
		headless: true,
		storageStatePath: fs.existsSync(STORAGE_FILE) ? STORAGE_FILE : undefined,
	});

	const baseUrl = buildScraperSearchUrl('linkedin', query);
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
