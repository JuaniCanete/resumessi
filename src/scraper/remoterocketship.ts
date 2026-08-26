import fs from 'fs';
import path from 'path';
import { REMOTEROCKETSHIP_CARD_SELECTORS, REMOTEROCKETSHIP_FIELD_SELECTORS, trySelectors } from './selectors';
import type { ScraperQuery, ScraperResult } from './types';
import { buildScraperSearchUrl, buildScraperSearchUrls } from './pagination';
import { launchStealthBrowser, randomDelay } from './browser';

export class RemoteRocketshipError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: Error
	) {
		super(message);
		this.name = 'RemoteRocketshipError';
	}
}

export class RemoteRocketshipNetworkError extends RemoteRocketshipError {
	constructor(message: string, cause?: Error) {
		super(message, 'NETWORK_ERROR', cause);
		this.name = 'RemoteRocketshipNetworkError';
	}
}

export class RemoteRocketshipParsingError extends RemoteRocketshipError {
	constructor(message: string, cause?: Error) {
		super(message, 'PARSING_ERROR', cause);
		this.name = 'RemoteRocketshipParsingError';
	}
}

export class RemoteRocketshipTimeoutError extends RemoteRocketshipError {
	constructor(message: string, cause?: Error) {
		super(message, 'TIMEOUT_ERROR', cause);
		this.name = 'RemoteRocketshipTimeoutError';
	}
}

/**
 * Scrape Remote Rocketship job listings.
 */
export async function scrapeRemoteRocketship(
	query: ScraperQuery,
	_env?: Record<string, string | undefined>
): Promise<ScraperResult[]> {
	const browserPath = undefined; // auto-detected via findChromePath
	const timeoutMs = 30000;
	const rateLimitMs = 2000;

	const { browser, context } = await launchStealthBrowser({
		headless: true,
		executablePath: browserPath,
	});

	const baseUrl = buildScraperSearchUrl('remoterocketship', query);
	const pageCount = query.pageCount ?? 1;
	const startPage = query.startPage ?? 1;
	const searchUrls = buildScraperSearchUrls(baseUrl, 'remoterocketship', pageCount, startPage);

	console.info(`[RemoteRocketship Scraper] Scraping ${searchUrls.length} page(s) starting from page ${startPage}`);

	const page = await context.newPage();
	const results: ScraperResult[] = [];

	try {
		for (let pageIndex = 0; pageIndex < searchUrls.length; pageIndex++) {
			const searchUrl = searchUrls[pageIndex];
			try {
				await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
			} catch (err) {
				if ((err as Error).name === 'TimeoutError' || (err as Error).message?.includes('timeout')) {
					throw new RemoteRocketshipTimeoutError(`Page load timeout: ${searchUrl}`, err as Error);
				}
				throw new RemoteRocketshipNetworkError(`Failed to navigate to ${searchUrl}`, err as Error);
			}
			await randomDelay(rateLimitMs, rateLimitMs * 2);

			// Extract job cards using the card container selector
			const cards = await extractJobCards(page);
			console.info(`[RemoteRocketship Scraper] Found ${cards.length} cards on page ${pageIndex + 1}`);

			// Save page HTML for debugging (opt-in via SCRAPER_DEBUG=true)
			if (process.env.SCRAPER_DEBUG === 'true') {
				try {
					const debugDir = path.join(process.cwd(), 'data', 'scraper-debug');
					if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
					const html = await page.content();
					const debugFile = path.join(debugDir, `remoterocketship-page-${startPage + pageIndex}.html`);
					fs.writeFileSync(debugFile, html);
					console.info(`[RemoteRocketship Scraper] Saved debug HTML to ${debugFile}`);
				} catch (debugErr: unknown) {
					console.warn('[RemoteRocketship Scraper] Failed to save debug HTML:', (debugErr as Error).message);
				}
			}

			for (const card of cards) {
				const job = await extractJobFromCard(page, card);
				if (job) {
					results.push(job);
				}
			}

			console.info(`[RemoteRocketship Scraper] Page ${searchUrl} yielded ${results.length} results so far`);
		}
	} catch (err: unknown) {
		if (err instanceof RemoteRocketshipError) {
			throw err;
		}
		console.error('[RemoteRocketship Scraper] Error during scraping:', (err as Error).message);
		throw new RemoteRocketshipError('Unknown scraping error', 'UNKNOWN_ERROR', err as Error);
	} finally {
		await browser.close();
	}

	return results;
}

export async function extractJobCards(page: import('playwright').Page): Promise<import('playwright').ElementHandle[]> {
	// Card container selectors (tried in order)
	const triedSelectors: string[] = [];

	for (const selector of REMOTEROCKETSHIP_CARD_SELECTORS) {
		triedSelectors.push(selector);
		try {
			const cards = await page.$$(selector);
			if (cards.length > 0) {
				console.info(`[RemoteRocketship Scraper] Found ${cards.length} cards using selector: ${selector}`);
				return cards;
			}
		} catch {
			continue;
		}
	}

	console.warn(
		'[RemoteRocketship Scraper] No cards found with any selector strategy. ' +
			`Tried: ${triedSelectors.join(' | ')}. ` +
			'Update REMOTEROCKETSHIP_CARD_SELECTORS in src/scraper/selectors.ts.'
	);
	return [];
}

export async function extractJobFromCard(
	page: import('playwright').Page,
	card: import('playwright').ElementHandle
): Promise<ScraperResult | null> {
	try {
		// Extract title from h3 a[href*="/publicjobs/"]
		const titleEl = await trySelectors(card, REMOTEROCKETSHIP_FIELD_SELECTORS.title);
		const title = titleEl ? (await titleEl.textContent())?.trim() || '' : '';

		// Extract job URL from the title link (or View Job link)
		let jobUrl = '';
		if (titleEl) {
			const href = await titleEl.getAttribute('href');
			if (href) {
				jobUrl = href.startsWith('http') ? href : `https://www.remoterocketship.com${href}`;
			}
		}

		// Fallback: get View Job link (only visible on hover but href exists in DOM)
		if (!jobUrl) {
			const viewJobEl = await trySelectors(card, REMOTEROCKETSHIP_FIELD_SELECTORS.viewJobLink);
			if (viewJobEl) {
				const href = await viewJobEl.getAttribute('href');
				if (href) {
					jobUrl = href.startsWith('http') ? href : `https://www.remoterocketship.com${href}`;
				}
			}
		}

		// Extract company from h4 a[href*="/company/"]
		const companyEl = await trySelectors(card, REMOTEROCKETSHIP_FIELD_SELECTORS.company);
		const company = companyEl ? (await companyEl.textContent())?.trim() || '' : '';

		// Extract date from p.notranslate with 🕒
		const dateEl = await trySelectors(card, REMOTEROCKETSHIP_FIELD_SELECTORS.date);
		const postedDate = dateEl ? (await dateEl.textContent())?.trim() || '' : '';

		// Extract all pill tags (not in selector config - specific to RR UI)
		const pillEls = await card.$$('div.py-2.px-2.my-1.flex.flex-row.items-center.bg-pill');
		const tags: string[] = [];
		let location = '';
		let salary = '';
		let employmentType = '';
		let seniority = '';

		for (const pillEl of pillEls) {
			const text = (await pillEl.textContent())?.trim() || '';
			if (text) {
				tags.push(text);
				// Categorize tags
				if (text.includes('🌏') || text.includes('Anywhere') || text.includes('World')) {
					location = text.replace('🌏', '').trim();
				} else if (text.includes('💵') || text.includes('$')) {
					salary = text.replace('💵', '').trim();
				} else if (
					text.includes('⏰') ||
					text.includes('Full Time') ||
					text.includes('Part Time') ||
					text.includes('Contract')
				) {
					employmentType = text.replace('⏰', '').trim();
				} else if (
					text.includes('🟡') ||
					text.includes('🟠') ||
					text.includes('Mid') ||
					text.includes('Senior') ||
					text.includes('Junior') ||
					text.includes('Lead')
				) {
					seniority = text.replace('🟡', '').replace('🟠', '').trim();
				}
			}
		}

		// Build snippet from available info
		const snippetParts = [company, location || salary || employmentType || seniority, postedDate].filter(Boolean);
		const snippet = snippetParts.join(' • ') || tags.join(' • ');

		if (!title || !jobUrl) return null;

		return {
			title,
			url: jobUrl,
			snippet,
			source: 'remoterocketship',
			company,
			postedDate,
			site: 'remoterocketship.com',
			parameters: tags,
		};
	} catch (err: unknown) {
		console.warn('[RemoteRocketship Scraper] Failed to extract job from card:', (err as Error).message);
		return null;
	}
}
