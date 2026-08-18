export function getRequestPath(requestUrl: string): string {
  const url = requestUrl.startsWith('http') ? new URL(requestUrl) : new URL(requestUrl, 'http://localhost');
  return url.pathname;
}

export function isCollectionUrl(url: unknown): boolean {
  if (url == null || typeof url !== 'string') return false;

  try {
    let normalizedPath = '';
    if (url.startsWith('http')) {
      normalizedPath = new URL(url).pathname;
    } else {
      normalizedPath = new URL(url, 'http://localhost').pathname;
    }
    return normalizedPath.startsWith('/jobs/collections/') || normalizedPath === '/jobs/search' || normalizedPath.startsWith('/jobs/search/');
  } catch {
    return false;
  }
}

export function getScraperResultsStorageKey(source: 'linkedin' | 'google' | 'remoterocketship'): string {
  return `scraper-results:${source}`;
}
