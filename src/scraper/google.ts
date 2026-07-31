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

  if (query.keywords) parts.push(`"${query.keywords}"`);
  if (query.role) parts.push(query.role);
  if (query.stack) parts.push(query.stack);
  if (query.employmentType) parts.push(query.employmentType);

  const domains = query.customDomains && query.customDomains.length > 0
    ? query.customDomains
    : DEFAULT_TARGET_DOMAINS;

  const siteQuery = domains.map(d => `site:${d.trim()}`).join(' OR ');
  parts.push(`(${siteQuery})`);
  parts.push('("careers" OR "jobs" OR "open positions")');

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

    // Extract search result containers from Google
    const searchBlocks = await page.$$('div.g, div.MjjYud');

    for (const block of searchBlocks) {
      const titleElem = await block.$('h3');
      const linkElem = await block.$('a[href^="http"]');
      const snippetElem = await block.$('div.VwiC3b, div.IsZvec, div[style*="-webkit-line-clamp"]');

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
