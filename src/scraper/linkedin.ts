import fs from 'fs';
import path from 'path';
import { launchStealthBrowser, randomDelay } from './browser';
import { buildScraperSearchUrls, buildScraperSearchUrl } from './pagination';
import type { ScraperQuery, ScraperResult } from './types';
import { generateLinkedInStorageState } from '../../scripts/linkedin-auth';

const STORAGE_FILE = path.join(process.cwd(), 'data', 'storage-state', 'linkedin.json');

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
  // Primary: current LinkedIn job card containers
  '.job-card-container, .base-card, .jobs-search-results__list-item, .job-card-list',
  // Unauthenticated/guest layout list items
  'ul.jobs-search__results-list > li',
  // Generic fallbacks: any list item that contains a job link
  'li[data-occludable-job-id]',
  'article.job-card, div.job-card',
];

/**
 * Extract LinkedIn job card blocks from the current page.
 * Tries multiple selector strategies in order and returns results from the
 * first strategy that yields any blocks.
 */
async function extractLinkedInJobCards(page: import('playwright').Page): Promise<import('playwright').ElementHandle[]> {
  let triedSelectors: string[] = [];

  for (const selector of LINKEDIN_RESULT_SELECTOR_STRATEGIES) {
    triedSelectors.push(selector);
    try {
      const cards = await page.$$(selector);
      if (cards.length > 0) {
        console.log(`[LinkedIn Scraper] Found ${cards.length} cards using selector: ${selector}`);
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
      'Update LINKEDIN_RESULT_SELECTOR_STRATEGIES in src/scraper/linkedin.ts.',
  );
  return [];
}

/**
 * Extract job card postings from LinkedIn with failure diagnostics.
 */
async function extractLinkedInCards(
  page: import('playwright').Page,
  results: ScraperResult[],
): Promise<void> {
  const cards = await extractLinkedInJobCards(page);

  if (cards.length === 0) {
    console.warn('[LinkedIn Scraper] Zero cards extracted from page.');
    try {
      console.log('[LinkedIn Scraper] Page title:', await page.title());
      console.log('[LinkedIn Scraper] Current URL:', page.url());
      const bodyText = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 500) : '');
      console.log('[LinkedIn Scraper] Body text preview:', JSON.stringify(bodyText));
    } catch {
      // ignore diagnostics errors
    }
    const screenshotPath = path.join(process.cwd(), 'data', 'scraper-results', 'linkedin-debug.png');
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[LinkedIn Scraper] Saved debug screenshot to:', screenshotPath);
    } catch {
      // ignore screenshot errors
    }
    return;
  }

  for (const card of cards) {
    const titleElem = await card.$('.job-card-list__title, .job-card-container__link, strong');
    const linkElem = await card.$('a[href*="/jobs/"]');
    const companyElem = await card.$('.job-card-container__primary-description, .job-card-container__company-name');

    const title = titleElem ? (await titleElem.textContent())?.trim() : '';
    const url = linkElem ? (await linkElem.getAttribute('href')) || '' : '';
    const company = companyElem ? (await companyElem.textContent())?.trim() : '';

    if (title && url) {
      results.push({
        title,
        url: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
        snippet: company ? `Company: ${company}` : '',
        source: 'linkedin',
        company,
      });
    }
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

export async function scrapeLinkedIn(query: ScraperQuery): Promise<ScraperResult[]> {
  // Precondition: check state validity
  let isValid = await validateLinkedInStorageState();
  if (!isValid) {
    console.log('[LinkedIn Scraper] Storage state invalid or missing. Auto-regenerating...');
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
  console.log(`[LinkedIn Scraper] Scraping ${searchUrls.length} page(s) starting from page ${startPage}: ${searchUrls.join(', ')}`);

  const page = await context.newPage();
  const results: ScraperResult[] = [];

    try {
      for (let pageIndex = 0; pageIndex < searchUrls.length; pageIndex++) {
        const searchUrl = searchUrls[pageIndex];
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(2000, 4000);

        // Scroll down to load jobs dynamically
        const maxScrolls = 12;
        for (let i = 0; i < maxScrolls; i++) {
          await page.evaluate(() => window.scrollBy(0, 800));
          await randomDelay(1500, 3000);

          const atBottom = await page.evaluate(() => {
            return window.innerHeight + window.scrollY >= document.body.scrollHeight - 300;
          });
          if (atBottom) break;
        }

        // Save page HTML for debugging pagination/scroll behavior
        try {
          const debugDir = path.join(process.cwd(), 'data', 'scraper-debug');
          if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
          const html = await page.content();
          const debugFile = path.join(debugDir, `linkedin-page-${startPage + pageIndex}.html`);
          fs.writeFileSync(debugFile, html);
          console.log(`[LinkedIn Scraper] Saved debug HTML to ${debugFile}`);
        } catch (debugErr: unknown) {
          console.warn('[LinkedIn Scraper] Failed to save debug HTML:', (debugErr as Error).message);
        }

        // Extract job card postings from LinkedIn with selector strategies and failure diagnostics
        await extractLinkedInCards(page, results);

        console.log(`[LinkedIn Scraper] Page ${searchUrl} yielded ${results.length} results so far`);
      }

    // Visit individual job pages to extract the full JD
    if (results.length > 0) {
      console.log(`[LinkedIn Scraper] Extracting JDs for ${Math.min(results.length, MAX_JD_EXTRACTIONS)} of ${results.length} jobs...`);
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