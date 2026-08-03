import fs from 'fs';
import path from 'path';
import { launchStealthBrowser, randomDelay } from './browser';
import { buildScraperSearchUrls } from './pagination';
import type { ScraperQuery, ScraperResult } from './types';
import { generateLinkedInStorageState } from '../../scripts/linkedin-auth';

const STORAGE_FILE = path.join(process.cwd(), 'data', 'storage-state', 'linkedin.json');

// Markers that delimit the job description on a LinkedIn job posting page.
// The content between these two markers is the actual JD text.
const JD_START_MARKER = 'About the job';
const JD_END_MARKER = 'Set alert for similar jobs';

// Maximum number of job pages to visit for full JD extraction (to avoid long scrape times)
const MAX_JD_EXTRACTIONS = 10;

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

export function buildLinkedInSearchUrl(query: ScraperQuery): string {
  const parts: string[] = [];
  if (query.role) parts.push(`"${query.role}"`);
  if (query.seniority) parts.push(query.seniority);
  if (query.stack) parts.push(query.stack);
  if (query.employmentType) parts.push(query.employmentType);
  if (query.region) parts.push(query.region);
  if (query.country) parts.push(query.country);
  if (query.currency) parts.push(query.currency);

  const fullQuery = parts.join(' ');
  return `https://www.linkedin.com/jobs/search-results/?keywords=${encodeURIComponent(fullQuery)}`;
}

/**
 * Navigate to an individual LinkedIn job posting page and extract the job
 * description text between the "About the job" and "Set alert for similar
 * jobs" markers.
 */
async function extractLinkedInJobDescription(
  page: import('playwright').Page,
  jobUrl: string,
): Promise<string> {
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

    const startIdx = bodyText.indexOf(JD_START_MARKER);
    const searchStart = startIdx >= 0 ? startIdx + JD_START_MARKER.length : 0;
    const endIdx = bodyText.indexOf(JD_END_MARKER, searchStart);

    console.log(
      `[LinkedIn Scraper] JD markers for ${jobUrl}: ` +
      `JD_START_MARKER="${JD_START_MARKER}" ${startIdx >= 0 ? 'FOUND' : 'NOT FOUND'}, ` +
      `JD_END_MARKER="${JD_END_MARKER}" ${endIdx >= 0 ? 'FOUND' : 'NOT FOUND'}`,
    );

    if (startIdx === -1) return '';

    const contentStart = startIdx + JD_START_MARKER.length;
    const contentEnd = endIdx === -1 ? bodyText.length : endIdx;

    const jdText = bodyText.substring(contentStart, contentEnd).trim();
    return jdText;
  } catch (err: unknown) {
    console.warn(`[LinkedIn Scraper] JD extraction failed for ${jobUrl}:`, (err as Error).message);
    return '';
  }
}

// Ordered list of selector strategies for LinkedIn job cards. Each strategy is
// tried in sequence until one yields results. Exact class names change when
// LinkedIn updates their UI, so we layer stable fallbacks (data-testid,
// data-job-id, generic list items) on top.
const LINKEDIN_CARD_SELECTOR_STRATEGIES: string[][] = [
  // Primary: current authenticated layout
  ['.job-card-container, .base-card, .jobs-search-results__list-item, .job-card-list'],
  // data-testid attributes (more stable than class names)
  ['[data-testid="job-card"], [data-job-id], li[data-testid="job-card"]'],
  // Guest / unauthenticated layout
  ['ul.jobs-search__results-list > li', '.jobs-search-results__list-item'],
  // Generic fallbacks: any anchor pointing to a LinkedIn job posting
  ['a[href*="/jobs/view/"], a[href*="/jobs/"]'],
];

/**
 * Extract job card postings from the current LinkedIn search results page.
 * Tries multiple selector strategies in order and returns results from the
 * first strategy that yields any cards.
 */
async function extractLinkedInCards(page: import('playwright').Page): Promise<ScraperResult[]> {
  let cardLocators: import('playwright').Locator[] = [];

  for (const selectors of LINKEDIN_CARD_SELECTOR_STRATEGIES) {
    const locator = page.locator(selectors.join(', '));
    const count = await locator.count();
    if (count > 0) {
      cardLocators = await locator.all();
      console.log(`[LinkedIn Scraper] Found ${count} cards using selectors: ${selectors.join(', ')}`);
      break;
    }
  }

  if (cardLocators.length === 0) {
    console.warn(
      '[LinkedIn Scraper] No job cards found with any selector strategy. ' +
      'LinkedIn may have changed their DOM structure. Update LINKEDIN_CARD_SELECTOR_STRATEGIES in src/scraper/linkedin.ts.',
    );
    return [];
  }

  const pageResults: ScraperResult[] = [];

  for (const card of cardLocators) {
    // Titles are the most reliable signal; try all known title selectors
    const titleLocator = card.locator(
      '.job-card-list__title, .job-card-container__link, .base-search-card__title, strong, [data-testid="job-title"], a[href*="/jobs/"] h3, h3, a[href*="/jobs/"]',
    ).first();
    // Prefer explicit job-posting links over generic anchors
    const linkLocator = card.locator(
      'a[href*="/jobs/view/"], a.job-card-list__title, a.job-card-container__link, a.base-card__full-link, a[href*="/jobs/"]',
    ).first();
    const companyLocator = card.locator(
      '.job-card-container__primary-description, .job-card-container__company-name, .base-search-card__subtitle, [data-testid="company-name"], .job-card-container__company-name',
    ).first();
    const locationLocator = card.locator(
      '.job-search-card__location, [data-testid="job-location"], .job-card-container__metadata-item, .job-card-container__metadata-wrapper',
    ).first();

    const title = (await titleLocator.textContent())?.trim() ?? '';
    const url = (await linkLocator.getAttribute('href')) || '';
    const company = (await companyLocator.textContent())?.trim() ?? '';
    const location = (await locationLocator.textContent())?.trim() ?? '';

    if (title && url) {
      const fullUrl = url.startsWith('http') ? url : `https://www.linkedin.com${url}`;
      pageResults.push({
        title,
        url: fullUrl,
        snippet: `${company ? `Company: ${company}. ` : ''}${location ? `Location: ${location}.` : ''}`.replace(/\. $/, '.'),
        source: 'linkedin',
        company,
      });
    }
  }

  console.log(`[LinkedIn Scraper] Extracted ${pageResults.length} jobs from ${cardLocators.length} cards`);
  return pageResults;
}

export async function scrapeLinkedIn(
  query: ScraperQuery,
  env: Record<string, string | undefined>,
): Promise<ScraperResult[]> {
  // Precondition: check state validity
  let isValid = await validateLinkedInStorageState();
  if (!isValid) {
    console.log('[LinkedIn Scraper] Storage state invalid or missing. Auto-regenerating...');
    await generateLinkedInStorageState(env);
    isValid = await validateLinkedInStorageState();
  }

  const { browser, context } = await launchStealthBrowser({
    headless: true,
    storageStatePath: fs.existsSync(STORAGE_FILE) ? STORAGE_FILE : undefined,
  });

  const baseUrl = buildLinkedInSearchUrl(query);
  const pageCount = query.pageCount ?? 3;
  const searchUrls = buildScraperSearchUrls(baseUrl, 'linkedin', pageCount);
  console.log(`[LinkedIn Scraper] Scraping ${searchUrls.length} page(s): ${searchUrls.join(', ')}`);

  const page = await context.newPage();
  const results: ScraperResult[] = [];

  try {
    for (const searchUrl of searchUrls) {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(2000, 4000);

      // Scroll down to load jobs dynamically
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await randomDelay(1500, 3000);
      }

      const pageResults = await extractLinkedInCards(page);
      console.log(`[LinkedIn Scraper] Page ${searchUrl} yielded ${pageResults.length} results`);
      results.push(...pageResults);
    }

    // Visit individual job pages to extract the full JD ("About the job" → "Set alert for similar jobs")
    if (results.length > 0) {
      console.log(`[LinkedIn Scraper] Extracting JDs for ${Math.min(results.length, MAX_JD_EXTRACTIONS)} of ${results.length} jobs...`);
      for (let i = 0; i < Math.min(results.length, MAX_JD_EXTRACTIONS); i++) {
        const result = results[i];
        const jdText = await extractLinkedInJobDescription(page, result.url);
        if (jdText) {
          // Prepend company info to the JD snippet if available
          const prefix = result.company ? `Company: ${result.company}\n\n` : '';
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
