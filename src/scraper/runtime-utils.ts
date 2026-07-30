export function getRequestPath(requestUrl: string): string {
  const url = requestUrl.startsWith('http') ? new URL(requestUrl) : new URL(requestUrl, 'http://localhost');
  return url.pathname;
}

export function getScraperResultsStorageKey(source: 'linkedin' | 'google'): string {
  return `scraper-results:${source}`;
}
