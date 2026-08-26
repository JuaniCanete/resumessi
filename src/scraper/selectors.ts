/**
 * Scraper Selector Configuration
 *
 * Centralized CSS selectors for all scrapers. LinkedIn DOM changes frequently,
 * so we use fallback chains for each field.
 *
 * IMPORTANT: LinkedIn scraper uses ElementHandle (page.$() / page.$$()) not
 * Playwright locators — locators fail on LinkedIn's dynamic DOM. Selector
 * strings are passed directly to page.$() / page.$$() which return ElementHandle.
 */

// LinkedIn job card container selectors (tried in order)
export const LINKEDIN_CARD_SELECTORS = [
	'li[data-occludable-job-id]', // Most stable: data attribute
	'.job-card-container', // Current class name
	'.base-card', // Older class name
	'.jobs-search-results__list-item', // Search results list item
	'.job-card-list', // Generic job card list
	'ul.jobs-search__results-list > li', // Direct list children
	'article.job-card, div.job-card', // Article/div variants
] as const;

// LinkedIn field selectors within a card ElementHandle
export const LINKEDIN_FIELD_SELECTORS = {
	// Title: linked job title
	title: [
		'a.job-card-container__link', // Current
		'a[data-tracking-control-name="public_jobs_jdb-title"]', // Data attr
		'h3 a', // Generic h3 link
		'a.job-card-list__title', // Alternative
	],
	// Company name
	company: [
		'.job-card-container__company-name', // Current
		'a[data-tracking-control-name="public_jobs_jdb-company"]', // Data attr
		'h4 a', // Generic h4 link
		'.job-card-list__company', // Alternative
	],
	// Location
	location: [
		'.job-card-container__metadata-item', // Current
		'li.job-card-container__metadata-item', // List item variant
		'.job-card-list__location', // Alternative
	],
	// Job URL (on title link)
	url: [
		'a.job-card-container__link', // Same as title
		'a[data-tracking-control-name="public_jobs_jdb-title"]',
	],
} as const;

// RemoteRocketship card container selectors (tried in order)
export const REMOTEROCKETSHIP_CARD_SELECTORS = [
	'div[role="button"][tabindex="0"]', // Main card container (current primary)
	'div.relative.cursor-pointer[role="button"]', // Alternative class
	'div:has(h3 a[href*="/publicjobs/"])', // Has job title link
] as const;

// RemoteRocketship field selectors within a card ElementHandle
export const REMOTEROCKETSHIP_FIELD_SELECTORS = {
	// Title from h3 link
	title: [
		'h3 a[href*="/publicjobs/"]',
	],
	// Company from h4 link
	company: [
		'h4 a[href*="/company/"]',
	],
	// Posted date with clock emoji
	date: [
		'p.notranslate:has-text("🕒")',
	],
	// View Job link (fallback for URL)
	viewJobLink: [
		'a:has-text("View Job")[href*="/publicjobs/"]',
	],
} as const;

// Type helpers for selector config
export type SelectorConfig = {
	card: readonly string[];
	fields: Record<string, readonly string[]>;
};

export const SCRAPER_SELECTORS: Record<string, SelectorConfig> = {
	linkedin: {
		card: LINKEDIN_CARD_SELECTORS,
		fields: LINKEDIN_FIELD_SELECTORS,
	},
	remoterocketship: {
		card: REMOTEROCKETSHIP_CARD_SELECTORS,
		fields: REMOTEROCKETSHIP_FIELD_SELECTORS,
	},
} as const;

/**
 * Try multiple selectors in order on an ElementHandle, return first match.
 * Used by both LinkedIn and RemoteRocketship scrapers.
 */
export async function trySelectors(
	element: import('playwright').ElementHandle,
	selectors: readonly string[]
): Promise<import('playwright').ElementHandle | null> {
	for (const selector of selectors) {
		try {
			const el = await element.$(selector);
			if (el) return el;
		} catch {
			continue;
		}
	}
	return null;
}
