import path from 'path';
import { launchStealthBrowser, randomDelay } from './browser';
import type { ScraperQuery, ScraperResult } from './types';

export const DEFAULT_TARGET_DOMAINS = [
  'teamtailor.com',
  'greenhouse.io',
  'lever.co',
  'workday.com',
  'jobs.ashbyhq.com',
];

export function buildGoogleSearchUrl(query: ScraperQuery): string {
  const parts: string[] = [];

  if (query.role) parts.push(`"${query.role}"`);
  if (query.seniority) parts.push(`"${query.seniority}"`);
  if (query.stack) parts.push(query.stack);
  if (query.employmentType) parts.push(query.employmentType);

  const domains = query.customDomains !== undefined && query.customDomains !== null
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

export async function scrapeGoogle(query: ScraperQuery): Promise<ScraperResult[]> {
  const { browser, context } = await launchStealthBrowser({ headless: true });
  const searchUrl = buildGoogleSearchUrl(query);
  console.log(`[Google Scraper] Scraping URL: ${searchUrl}`);

  const page = await context.newPage();
  const results: ScraperResult[] = [];

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3500);

    console.log('[Google Scraper] Page title:', await page.title());
    console.log('[Google Scraper] Current URL:', page.url());

    // Try multiple selector patterns for Google search results
    const selectorPatterns = [
      'div.g, div.MjjYud',
      'div.search-result, div[data-snf="n"]',
      'div.eg Miscellaneous, div.BNeawe',
      'div.g a[href^="http"] h3',
      'div#search div.g',
      'div#main div.g',
    ];

    let searchBlocks: import('playwright').ElementHandle[] = [];
    for (const selector of selectorPatterns) {
      searchBlocks = await page.$$(selector);
      if (searchBlocks.length > 0) {
        console.log(`[Google Scraper] Found ${searchBlocks.length} results using selector: ${selector}`);
        break;
      }
    }

    if (searchBlocks.length === 0) {
      console.warn('[Google Scraper] No results found with any selector. Page may have different structure or be blocked.');
      const screenshotPath = path.join(process.cwd(), 'data', 'scraper-results', 'google-debug.png');
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('[Google Scraper] Saved debug screenshot to:', screenshotPath);
      } catch {
        // ignore screenshot errors
      }
    }

    for (const block of searchBlocks) {
      const titleElem = await block.$('h3');
      const linkElem = await block.$('a[href^="http"]');
      const snippetElem = await block.$('div.VwiC3b, div.IsZvec, div[style*="-webkit-line-clamp"], div.BNeawe');

      const title = titleElem ? (await titleElem.textContent())?.trim() : '';
      const url = linkElem ? (await linkElem.getAttribute('href')) || '' : '';
      const snippet = snippetElem ? (await snippetElem.textContent())?.trim() : '';

      if (title && url && !url.includes('google.com') && !url.includes('accounts.google')) {
        results.push({
          title,
          url,
          snippet: snippet || title,
          source: 'google',
        });
      }
    }
  } catch (err: unknown) {
    console.error('[Google Scraper] Error during scraping:', (err as Error).message);
  } finally {
    await browser.close();
  }

  return results;
}
