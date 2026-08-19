import { launchStealthBrowser, randomDelay } from './browser';
import { buildScraperSearchUrl, buildScraperSearchUrls } from './pagination';
import type { ScraperQuery, ScraperResult } from './types';

/**
 * Scrape Remote Rocketship job listings.
 */
export async function scrapeRemoteRocketship(query: ScraperQuery, _env?: Record<string, string | undefined>): Promise<ScraperResult[]> {
  const { browser, context } = await launchStealthBrowser({
    headless: true,
  });

  const baseUrl = buildScraperSearchUrl('remoterocketship', query);
  const pageCount = query.pageCount ?? 1;
  const startPage = query.startPage ?? 1;
  const searchUrls = buildScraperSearchUrls(baseUrl, 'remoterocketship', pageCount, startPage);

  console.log(`[RemoteRocketship Scraper] Scraping ${searchUrls.length} page(s) starting from page ${startPage}`);

  const page = await context.newPage();
  const results: ScraperResult[] = [];

  try {
    for (let pageIndex = 0; pageIndex < searchUrls.length; pageIndex++) {
      const searchUrl = searchUrls[pageIndex];
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(2000, 4000);

      // Extract job cards using the card container selector
      const cards = await extractJobCards(page);
      console.log(`[RemoteRocketship Scraper] Found ${cards.length} cards on page ${pageIndex + 1}`);

      for (const card of cards) {
        const job = await extractJobFromCard(page, card);
        if (job) {
          results.push(job);
        }
      }

      console.log(`[RemoteRocketship Scraper] Page ${searchUrl} yielded ${results.length} results so far`);
    }
  } catch (err: unknown) {
    console.error('[RemoteRocketship Scraper] Error during scraping:', (err as Error).message);
  } finally {
    await browser.close();
  }

  return results;
}

async function extractJobCards(page: import('playwright').Page): Promise<import('playwright').ElementHandle[]> {
  // Card container: div[role="button"] with the job content
  // The View Job link is inside the hover area but href is always in DOM
  const selectors = [
    'div[role="button"][tabindex="0"]', // Main card container
    'div.relative.cursor-pointer[role="button"]',
    'div:has(h3 a[href*="/publicjobs/"])', // Cards with job title link
  ];

  for (const selector of selectors) {
    try {
      const cards = await page.$$(selector);
      if (cards.length > 0) {
        console.log(`[RemoteRocketship Scraper] Found ${cards.length} cards using selector: ${selector}`);
        return cards;
      }
    } catch {
      continue;
    }
  }

  console.warn('[RemoteRocketship Scraper] No cards found with any selector strategy');
  return [];
}

async function extractJobFromCard(page: import('playwright').Page, card: import('playwright').ElementHandle): Promise<ScraperResult | null> {
  try {
    // Extract title from h3 a[href*="/publicjobs/"]
    const titleEl = await card.$('h3 a[href*="/publicjobs/"]');
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
      const viewJobEl = await card.$('a:has-text("View Job")[href*="/publicjobs/"]');
      if (viewJobEl) {
        const href = await viewJobEl.getAttribute('href');
        if (href) {
          jobUrl = href.startsWith('http') ? href : `https://www.remoterocketship.com${href}`;
        }
      }
    }

    // Extract company from h4 a[href*="/company/"]
    const companyEl = await card.$('h4 a[href*="/company/"]');
    const company = companyEl ? (await companyEl.textContent())?.trim() || '' : '';

    // Extract date from p.notranslate with 🕒
    const dateEl = await card.$('p.notranslate:has-text("🕒")');
    const postedDate = dateEl ? (await dateEl.textContent())?.trim() || '' : '';

    // Extract all pill tags
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
        } else if (text.includes('⏰') || text.includes('Full Time') || text.includes('Part Time') || text.includes('Contract')) {
          employmentType = text.replace('⏰', '').trim();
        } else if (text.includes('🟡') || text.includes('🟠') || text.includes('Mid') || text.includes('Senior') || text.includes('Junior') || text.includes('Lead')) {
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