import { buildScraperSearchUrl, DEFAULT_TARGET_DOMAINS } from './pagination';
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

export async function scrapeGoogle(
  query: ScraperQuery,
  env: Record<string, string | undefined>
): Promise<ScraperResult[]> {
  const apiKey = env.GOOGLE_API_KEY;
  const cxId = env.GOOGLE_CX_ID;

  if (!apiKey || !cxId) {
    console.error('[Google Scraper] Error: GOOGLE_API_KEY or GOOGLE_CX_ID is missing in env.');
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

  console.log(`[Google Scraper] Scraping up to ${pageCount} page(s) of Google Custom Search API for query: "${searchQuery}"`);

  for (let page = 0; page < pageCount; page++) {
    const startParam = page * 10 + 1; // API is 1-indexed for the 'start' param
    const apiUrl = new URL('https://www.googleapis.com/customsearch/v1');
    apiUrl.searchParams.set('key', apiKey);
    apiUrl.searchParams.set('cx', cxId);
    apiUrl.searchParams.set('q', searchQuery);
    apiUrl.searchParams.set('start', String(startParam));

    // Optional date restrict to 7 days if requested
    // apiUrl.searchParams.set('dateRestrict', 'd7');

    try {
      console.log(apiUrl.toString());
      const response = await fetch(apiUrl.toString());
      if (response.status === 429) {
        console.error('[Google Scraper] Google API quota exceeded (HTTP 429).');
        return results; // Return whatever results we gathered so far
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Google Scraper] Google API error (HTTP ${response.status}):`, errorText);
        break;
      }

      const data = await response.json();
      const items = data.items || [];
      console.log(`[Google Scraper] Received ${items.length} items from Google API for page ${page + 1}`);

      for (const item of items) {
        const title = item.title || '';
        const rawUrl = item.link || '';
        const snippet = item.snippet || '';

        const url = extractGoogleResultUrl(rawUrl);

        if (title && url && !url.includes('google.com/search') && !url.includes('accounts.google')) {
          results.push({
            title,
            url,
            snippet: snippet || title,
            source: 'google',
          });
        }
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
