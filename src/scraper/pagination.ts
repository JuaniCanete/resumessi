export function buildScraperSearchUrls(baseUrl: string, source: 'linkedin' | 'google', pageCount: number): string[] {
  const urls = [baseUrl];

  if (source === 'linkedin') {
    for (let page = 1; page < pageCount; page += 1) {
      const url = new URL(baseUrl);
      url.searchParams.set('start', String(page * 25));
      urls.push(url.toString());
    }
    return urls;
  }

  for (let page = 1; page < pageCount; page += 1) {
    const url = new URL(baseUrl);
    url.searchParams.set('start', String(page * 10));
    urls.push(url.toString());
  }

  return urls;
}
