import path from 'path';
import { launchStealthBrowser, randomDelay } from './browser';
import { buildScraperSearchUrls } from './pagination';
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

/**
 * Extract Google search result blocks from the current page.
 */
async function extractGoogleResults(page: import('playwright').Page): Promise<ScraperResult[]> {
  const pageResults: ScraperResult[] = [];

  // Try multiple selector patterns for Google search results
  const selectorPatterns = [
    'div.g, div.MjjYud',
    'div.search-result, div[data-snf="n"]',
    'div.BNeawe',
    'div.g a[href^="http"] h3',
    'div#search div.g',
    'div#main div.g',
  ];

  let searchBlocks: import('playwright').ElementHandle[] = [];
  for (const selector of selectorPatterns) {
    try {
      searchBlocks = await page.$$(selector);
    } catch (err: unknown) {
      console.warn(`[Google Scraper] Selector failed (${selector}):`, (err as Error).message);
      continue;
    }
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
    const rawUrl = linkElem ? (await linkElem.getAttribute('href')) || '' : '';
    const snippet = snippetElem ? (await snippetElem.textContent())?.trim() : '';

    // Unwrap Google's /url?q= redirect to get the real destination
    const url = extractGoogleResultUrl(rawUrl);

    // Only skip actual Google-internal pages (search, accounts, etc.), not redirect-wrapped results
    if (title && url && !url.includes('google.com/search') && !url.includes('accounts.google')) {
      pageResults.push({
        title,
        url,
        snippet: snippet || title,
        source: 'google',
      });
    }
  }

  return pageResults;
}

export async function scrapeGoogle(query: ScraperQuery): Promise<ScraperResult[]> {
  const { browser, context } = await launchStealthBrowser({ headless: true });
  const baseUrl = buildGoogleSearchUrl(query);
  const pageCount = query.pageCount ?? 3;
  const searchUrls = buildScraperSearchUrls(baseUrl, 'google', pageCount);
  console.log(`[Google Scraper] Scraping ${searchUrls.length} page(s): ${searchUrls.join(', ')}`);

  const page = await context.newPage();
  const results: ScraperResult[] = [];

  try {
    for (const searchUrl of searchUrls) {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(2000, 3500);

      console.log('[Google Scraper] Page title:', await page.title());
      console.log('[Google Scraper] Current URL:', page.url());

      // Detect Google bot-block page (CAPTCHA / "sorry" page)
      if (page.url().includes('/sorry/index')) {
        console.warn('[Google Scraper] Google is blocking automated access (CAPTCHA / sorry page).');
        const screenshotPath = path.join(process.cwd(), 'data', 'scraper-results', 'google-debug.png');
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log('[Google Scraper] Saved debug screenshot to:', screenshotPath);
        } catch {
          // ignore screenshot errors
        }
        break;
      }

      const pageResults = await extractGoogleResults(page);
      console.log(`[Google Scraper] Page ${searchUrl} yielded ${pageResults.length} results`);
      results.push(...pageResults);
    }
  } catch (err: unknown) {
    console.error('[Google Scraper] Error during scraping:', (err as Error).message);
  } finally {
    await browser.close();
  }

  return results;
}
