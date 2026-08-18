import { launchStealthBrowser, randomDelay } from './browser';
import type { ScraperQuery, ScraperResult } from './types';

const REMOTEROCKETSHIP_BASE = 'https://remoterocketship.com';

function buildRemoteRocketshipUrl(query: ScraperQuery): string {
  const params = new URLSearchParams();

  if (query.country) {
    params.set('country', query.country);
  }
  if (query.keywords) {
    params.set('keyword', query.keywords);
  }
  if (query.seniority) {
    params.set('seniority', query.seniority);
  }
  if (query.employmentType) {
    params.set('employment_type', query.employmentType);
  }
  if (query.region) {
    params.set('region', query.region);
  }
  if (query.customDomains && query.customDomains.length > 0) {
    params.set('locations', query.customDomains.join(','));
  }
  if (query.role) {
    params.set('job_title', query.role);
  }
  params.set('sort', query.datePosted === 'last24h' ? 'DateAdded' : 'Relevance');
  params.set('page', '1');

  return `${REMOTEROCKETSHIP_BASE}/jobs?${params.toString()}`;
}

function buildRemoteRocketshipPageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set('page', String(page));
  return url.toString();
}

async function extractJobCards(page: import('playwright').Page): Promise<import('playwright').ElementHandle[]> {
  const cards = await page.$$('.job-card, .job-listing, [data-testid="job-card"], article.job, .position-card');
  if (cards.length > 0) {
    console.log(`[RemoteRocketship Scraper] Found ${cards.length} job cards`);
    return cards;
  }

  const fallback = await page.$$('a[href*="/job/"], a[href*="/position/"], .card a');
  console.log(`[RemoteRocketship Scraper] Fallback found ${fallback.length} potential job links`);
  return fallback;
}

async function isJobAvailable(page: import('playwright').Page): Promise<boolean> {
  const applyButton = await page.getByRole('button', { name: /apply now/i }).count();
  const applyLink = await page.getByRole('link', { name: /apply now/i }).count();
  const expiredBanner = await page.getByText(/position has been filled|expired|closed|no longer accepting/i).count();

  if (expiredBanner > 0) return false;
  if (applyButton > 0 || applyLink > 0) return true;

  const anyApply = await page.getByRole('link', { name: /apply/i }).count() > 0;
  return anyApply;
}

function extractSiteFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) hostname = hostname.slice(4);
    return hostname;
  } catch {
    return '';
  }
}

async function extractTextFromElement(card: import('playwright').ElementHandle, selector: string): Promise<string> {
  try {
    const el = await card.$(selector);
    if (el) {
      return (await el.textContent().catch(() => '') || '').trim();
    }
  } catch {
    // ignore
  }
  return '';
}

async function extractTextByRole(card: import('playwright').ElementHandle, role: string, name?: RegExp): Promise<string> {
  try {
    const elements = await card.$$('.//*');
    for (const el of elements) {
      const roleAttr = await el.getAttribute('role').catch(() => '');
      const text = (await el.textContent().catch(() => '') || '').trim();
      if (roleAttr === role && (!name || name.test(text))) {
        return text;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

export async function scrapeRemoteRocketship(
  query: ScraperQuery,
  _env: Record<string, string | undefined>
): Promise<ScraperResult[]> {
  const baseUrl = buildRemoteRocketshipUrl(query);
  const maxPages = Math.min(query.pageCount ?? 1, 10);
  const results: ScraperResult[] = [];

  console.log(`[RemoteRocketship Scraper] Starting scrape: ${baseUrl}`);

  const { browser, context } = await launchStealthBrowser({
    headless: true,
  });

  try {
    let lastPageCardCount = 0;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const pageUrl = pageNum === 1 ? baseUrl : buildRemoteRocketshipPageUrl(baseUrl, pageNum);
      console.log(`[RemoteRocketship Scraper] Scraping page ${pageNum}: ${pageUrl}`);

      let page: import('playwright').Page | null = null;
      let retries = 0;
      const maxRetries = 3;

      while (retries <= maxRetries) {
        try {
          page = await context.newPage();

          if (retries > 0) {
            const userAgents = [
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ];
            await page.setExtraHTTPHeaders({
              'User-Agent': userAgents[retries % userAgents.length],
            });
          }

          await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await randomDelay(2000, 4000);

          const cloudflareDetected = await page.getByText(/checking your browser|cloudflare|challenge|verify you are human/i).count() > 0;
          if (cloudflareDetected) {
            console.warn(`[RemoteRocketship Scraper] Cloudflare challenge detected on page ${pageNum}, retry ${retries + 1}/${maxRetries}`);
            await page.close();
            page = null;
            retries++;
            await randomDelay(5000 * retries, 10000 * retries);
            continue;
          }

          const cards = await extractJobCards(page);
          lastPageCardCount = cards.length;

          if (cards.length === 0 && pageNum === 1) {
            console.log('[RemoteRocketship Scraper] No job cards found on first page, may be blocked or no results');
          }

          for (const card of cards) {
            try {
              let title = '';
              let company = '';
              let date = '';
              let tags: string[] = [];
              let snippet = '';

              title = await extractTextByRole(card, 'heading');
              if (!title) {
                title = await extractTextFromElement(card, 'a[href*="/job/"], a[href*="/position/"]');
              }
              if (!title) {
                const text = (await card.textContent().catch(() => '') || '').trim();
                title = text.split('\n')[0].slice(0, 200);
              }

              let companyText = await extractTextFromElement(card, '.company, [data-company], .employer, .organization');
              if (!companyText) {
                companyText = await extractTextFromElement(card, '//*[contains(text(), "at ")]');
              }
              if (companyText) {
                const match = companyText.match(/at\s+(.+)/i);
                company = match ? match[1].trim() : companyText.trim();
              }

              const dateText = await extractTextFromElement(card, '//*[contains(text(), "ago") or contains(text(), "day") or contains(text(), "week") or contains(text(), "month") or contains(text(), "hour")]');
              if (dateText && /\d+\s*(day|week|month|hour)s?\s*ago/i.test(dateText)) {
                date = dateText;
              }

              const tagElements = await card.$$('.tag, .skill, .badge, [data-tag], .technology');
              for (const tagEl of tagElements.slice(0, 10)) {
                const tag = (await tagEl.textContent().catch(() => '') || '').trim();
                if (tag) tags.push(tag);
              }

              let jobUrl = '';
              const linkEl = await card.$('a[href*="/job/"], a[href*="/position/"]');
              if (linkEl) {
                jobUrl = await linkEl.getAttribute('href').catch(() => '') || '';
              }
              if (jobUrl && !jobUrl.startsWith('http')) {
                jobUrl = new URL(jobUrl, REMOTEROCKETSHIP_BASE).href;
              }

              let jd = '';

              if (jobUrl) {
                const detailPage = await context.newPage();
                try {
                  await detailPage.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  await randomDelay(1000, 2000);

                  const isAvailable = await isJobAvailable(detailPage);
                  if (!isAvailable) {
                    console.log(`[RemoteRocketship Scraper] Job no longer available: ${jobUrl}`);
                  }

                  let jdEl = null;
                  try {
                    jdEl = await detailPage.getByRole('heading', { name: /about|description|responsibilities/i }).first();
                  } catch {
                    jdEl = null;
                  }
                  if (jdEl) {
                    let jdContainer = null;
                    try {
                      jdContainer = await jdEl.locator('..');
                    } catch {
                      jdContainer = null;
                    }
                    if (jdContainer) {
                      let jdText: string | null = '';
                      try {
                        jdText = await jdContainer.textContent();
                      } catch {
                        jdText = '';
                      }
                      jd = (jdText || '').trim().slice(0, 5000);
                    }
                  }

                  let applyBtn = null;
                  try {
                    applyBtn = await detailPage.getByRole('link', { name: /apply now/i }).first();
                  } catch {
                    applyBtn = null;
                  }
                  if (applyBtn) {
                    let href: string | null = null;
                    try {
                      href = await applyBtn.getAttribute('href');
                    } catch {
                      href = null;
                    }
                    if (href) jobUrl = href.startsWith('http') ? href : new URL(href, REMOTEROCKETSHIP_BASE).href;
                  }
                } catch (err) {
                  console.warn(`[RemoteRocketship Scraper] Failed to scrape detail page ${jobUrl}:`, (err as Error).message);
                } finally {
                  await detailPage.close();
                }
              }

              if (!jobUrl) jobUrl = pageUrl;

              snippet = jd || `${title} at ${company}`.trim() || title;

              if (title && (jobUrl || snippet)) {
                results.push({
                  title: title.trim(),
                  url: jobUrl,
                  snippet: snippet.trim(),
                  source: 'remoterocketship',
                  company: company || undefined,
                  postedDate: date || undefined,
                  aiSummary: undefined,
                  parameters: tags.length > 0 ? tags : undefined,
                  site: extractSiteFromUrl(jobUrl),
                  jobDescription: jd || undefined,
                });
              }
            } catch (cardErr) {
              console.warn('[RemoteRocketship Scraper] Failed to parse card:', (cardErr as Error).message);
            }
          }

          await page.close();
          page = null;
          break;
        } catch (err) {
          if (page) {
            await page.close().catch(() => {});
            page = null;
          }
          retries++;
          if (retries > maxRetries) {
            console.error(`[RemoteRocketship Scraper] Max retries exceeded for page ${pageNum}:`, (err as Error).message);
            break;
          }
          console.warn(`[RemoteRocketship Scraper] Error on page ${pageNum}, retry ${retries}/${maxRetries}:`, (err as Error).message);
          await randomDelay(5000 * retries, 10000 * retries);
        }
      }

      if (lastPageCardCount < 10) {
        console.log('[RemoteRocketship Scraper] Fewer than 10 results, stopping pagination');
        break;
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[RemoteRocketship Scraper] Scraped ${results.length} total jobs`);
  return results;
}