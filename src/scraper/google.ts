import { buildScraperSearchUrl, DEFAULT_TARGET_DOMAINS } from './pagination';
import type { ScraperQuery, ScraperResult } from './types';
import fs from 'fs';
import path from 'path';

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

export async function scrapeGoogle(
  query: ScraperQuery,
  env: Record<string, string | undefined>
): Promise<ScraperResult[]> {
  const apiKey = env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error('[Google Scraper] Error: GOOGLE_API_KEY is missing in env.');
    return [];
  }

  // Build the search query string using the existing single source of truth URL builder
  const googleSearchUrl = buildGoogleSearchUrl(query);
  let searchQuery = '';
  try {
    const parsedUrl = new URL(googleSearchUrl);
    searchQuery = parsedUrl.searchParams.get('q') || '';
  } catch (err: unknown) {
    console.error('[Google Scraper] Failed to parse search query string:', (err as Error).message);
    return [];
  }

  if (!searchQuery) {
    console.warn('[Google Scraper] Warning: Empty search query compiled.');
    return [];
  }

  const results: ScraperResult[] = [];
  const pageCount = query.pageCount ?? 1;
  const startPage = query.startPage ?? 1;

  console.log(`[Google Scraper] Scraping up to ${pageCount} page(s) starting from page ${startPage} of SerpAPI for query: "${searchQuery}"`);

  for (let page = 0; page < pageCount; page++) {
    const startParam = ((startPage - 1) + page) * 10;
    const apiUrl = new URL('https://serpapi.com/search.json?engine=google');
    apiUrl.searchParams.set('api_key', apiKey);
    apiUrl.searchParams.set('q', searchQuery);
    apiUrl.searchParams.set('start', String(startParam));

    // Optional date restrict to 7 days if requested
    // apiUrl.searchParams.set('dateRestrict', 'd7');

    try {
      const response = await fetch(apiUrl.toString());
      if (response.status === 429) {
        console.error('[Google Scraper] SerpAPI quota exceeded (HTTP 429).');
        return results; // Return whatever results we gathered so far
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Google Scraper] SerpAPI error (HTTP ${response.status}):`, errorText);
        break;
      }

      const data = await response.json();
      const items = data.organic_results || [];
      console.log(`[Google Scraper] Received ${items.length} items from SerpAPI for page ${page + 1}`);

      // Save SerpAPI response for debugging pagination behavior
      try {
        const debugDir = path.join(process.cwd(), 'data', 'scraper-debug');
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        const debugFile = path.join(debugDir, `google-page-${startPage + page}.json`);
        fs.writeFileSync(debugFile, JSON.stringify(data, null, 2));
        console.log(`[Google Scraper] Saved debug response to ${debugFile}`);
      } catch (debugErr: unknown) {
        console.warn('[Google Scraper] Failed to save debug response:', (debugErr as Error).message);
      }

      // Only keep results whose hostname is one of the targeted ATS domains
      // AND whose URL path looks like an actual job posting.
      const allowedDomains = (query.customDomains !== undefined && query.customDomains !== null
        ? query.customDomains
        : DEFAULT_TARGET_DOMAINS).map(d => d.trim().toLowerCase());

      const JOB_PATH_PATTERNS = [
        '/jobs/', '/job/', '/careers', '/positions', '/position/',
        '/job-board', '/openings', '/listing', '/joblist',
      ];

      for (const item of items) {
        const title = item.title || '';
        const rawUrl = item.link || '';
        const snippet = item.snippet || '';

        const url = extractGoogleResultUrl(rawUrl);

        if (!title || !url || url.includes('google.com/search') || url.includes('accounts.google')) {
          continue;
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(url);
        } catch {
          continue;
        }
        const hostname = parsedUrl.hostname.toLowerCase();
        // Strip leading "www." for comparison
        const bareHost = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
        const isAllowed = allowedDomains.some(d => bareHost === d || bareHost.endsWith('.' + d));
        if (!isAllowed) continue;

        const pathname = parsedUrl.pathname.toLowerCase();
        const looksLikeJob = JOB_PATH_PATTERNS.some(p => pathname.includes(p));
        if (!looksLikeJob) {
          console.log(`[Google Scraper] Skipping non-listing result (${url})`);
          continue;
        }

        results.push({
          title,
          url,
          snippet: snippet || title,
          source: 'google',
        });
      }

      // If we got fewer than 10 results, there is no next page
      if (items.length < 10) {
        break;
      }
    } catch (err: unknown) {
      console.error('[Google Scraper] Network or parsing error:', (err as Error).message);
      break;
    }
  }

  return results;
}
