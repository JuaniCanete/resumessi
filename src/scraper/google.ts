import path from 'path';
import { launchStealthBrowser, randomDelay } from './browser';
import { buildScraperSearchUrls, buildScraperSearchUrl, DEFAULT_TARGET_DOMAINS } from './pagination';
import type { ScraperQuery, ScraperResult } from './types';

export { DEFAULT_TARGET_DOMAINS };

// Deprecated: use buildScraperSearchUrl('google', query) from pagination.ts instead
export function buildGoogleSearchUrl(query: ScraperQuery): string {
  return buildScraperSearchUrl('google', query);
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

// Ordered list of selector strategies for Google search result blocks. Each
// strategy is tried in sequence until one yields results. Google changes their
// DOM frequently, so we layer stable fallbacks (data-* attributes, generic
// heading anchors) on top of the current class names.
const GOOGLE_RESULT_SELECTOR_STRATEGIES: string[] = [
  // Primary: current Google result containers
  'div.g, div.MjjYud',
  // data-* attributes (more stable than class names)
  'div[data-snf], div[data-hveid], div[data-async-context]',
  // Search-result list containers
  'div#search div.g, div#main div.g, div#rso div.g',
  // Generic fallbacks: any heading inside a link that points to an external site
  'a[href^="http"] h3',
  'div.BNeawe',
  'div.search-result, div[data-snf="n"]',
];

/**
 * Extract Google search result blocks from the current page.
 * Tries multiple selector strategies in order and returns results from the
 * first strategy that yields any blocks.
 */
async function extractGoogleResults(page: import('playwright').Page): Promise<ScraperResult[]> {
  const pageResults: ScraperResult[] = [];

  let searchBlocks: import('playwright').Locator[] = [];
  let triedSelectors: string[] = [];

  for (const selector of GOOGLE_RESULT_SELECTOR_STRATEGIES) {
    triedSelectors.push(selector);
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        searchBlocks = await locator.all();
        console.log(`[Google Scraper] Found ${count} results using selector: ${selector}`);
        break;
      }
    } catch (err: unknown) {
      console.warn(`[Google Scraper] Selector failed (${selector}):`, (err as Error).message);
      continue;
    }
  }

  if (searchBlocks.length === 0) {
    // Explicit failure diagnostics: list every selector tried plus page context
    console.warn(
      '[Google Scraper] No results found with any selector strategy. ' +
      `Tried: ${triedSelectors.join(' | ')}. ` +
      'Google may have changed their DOM structure or blocked automated access. ' +
      'Update GOOGLE_RESULT_SELECTOR_STRATEGIES in src/scraper/google.ts.',
    );
    try {
      console.log('[Google Scraper] Page title:', await page.title());
      console.log('[Google Scraper] Current URL:', page.url());
      const bodyText = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 500) : '');
      console.log('[Google Scraper] Body text preview:', JSON.stringify(bodyText));
    } catch {
      // ignore diagnostics errors
    }
    const screenshotPath = path.join(process.cwd(), 'data', 'scraper-results', 'google-debug.png');
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[Google Scraper] Saved debug screenshot to:', screenshotPath);
    } catch {
      // ignore screenshot errors
    }
  }

  for (const block of searchBlocks) {
    const titleLocator = block.locator('h3').first();
    const linkLocator = block.locator('a[href^="http"]').first();
    const snippetLocator = block.locator('div.VwiC3b, div.IsZvec, div[style*="-webkit-line-clamp"], div.BNeawe').first();

    const title = (await titleLocator.textContent())?.trim() ?? '';
    const rawUrl = (await linkLocator.getAttribute('href')) || '';
    const snippet = (await snippetLocator.textContent())?.trim() ?? '';

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
