import fs from 'fs';
import path from 'path';
import { launchStealthBrowser, randomDelay } from './browser';
import type { ScraperQuery, ScraperResult } from './types';
import { generateLinkedInStorageState } from '../../scripts/linkedin-auth';

const STORAGE_FILE = path.join(process.cwd(), 'data', 'storage-state', 'linkedin.json');

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
  if (query.keywords) parts.push(query.keywords);
  if (query.role) parts.push(query.role);
  if (query.stack) parts.push(query.stack);
  if (query.employmentType) parts.push(query.employmentType);
  if (query.region) parts.push(query.region);
  if (query.currency) parts.push(query.currency);

  const fullQuery = parts.join(' ');
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(fullQuery)}`;
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

  const searchUrl = buildLinkedInSearchUrl(query);
  console.log(`[LinkedIn Scraper] Scraping URL: ${searchUrl}`);

  const page = await context.newPage();
  const results: ScraperResult[] = [];

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 4000);

    // Scroll down to load jobs dynamically
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await randomDelay(1500, 3000);
    }

    // Extract job card postings from LinkedIn
    const cards = await page.$$('.job-card-container, .base-card, .jobs-search-results__list-item, .job-card-list');

    if (cards.length === 0) {
      // Fallback selector for unauthenticated/guest layout
      const guestCards = await page.$$('ul.jobs-search__results-list > li');
      for (const card of guestCards) {
        const titleElem = await card.$('.base-search-card__title, .job-card-list__title');
        const linkElem = await card.$('a.base-card__full-link, a.job-card-list__title, a[href*="/jobs/"]');
        const companyElem = await card.$('.base-search-card__subtitle, .job-card-container__company-name');
        const locationElem = await card.$('.job-search-card__location');

        const title = titleElem ? (await titleElem.textContent())?.trim() : '';
        const url = linkElem ? (await linkElem.getAttribute('href')) || '' : '';
        const company = companyElem ? (await companyElem.textContent())?.trim() : '';
        const location = locationElem ? (await locationElem.textContent())?.trim() : '';

        if (title && url) {
          results.push({
            title,
            url: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
            snippet: `${company ? `Company: ${company}. ` : ''}${location ? `Location: ${location}.` : ''}`,
            source: 'linkedin',
            company,
          });
        }
      }
    } else {
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
  } catch (err: unknown) {
    console.error('[LinkedIn Scraper] Error during scraping:', (err as Error).message);
  } finally {
    await browser.close();
  }

  return results;
}
