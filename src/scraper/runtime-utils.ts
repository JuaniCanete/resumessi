export function getRequestPath(requestUrl: string): string {
	const url = requestUrl.startsWith('http') ? new URL(requestUrl) : new URL(requestUrl, 'http://localhost');
	return url.pathname;
}

export function isCollectionUrl(url: unknown): boolean {
	if (url === null || typeof url !== 'string') return false;

	try {
		let normalizedPath = '';
		let hostname = '';
		if (url.startsWith('http')) {
			const parsed = new URL(url);
			normalizedPath = parsed.pathname;
			hostname = parsed.hostname;
		} else {
			const parsed = new URL(url, 'http://localhost');
			normalizedPath = parsed.pathname;
			hostname = parsed.hostname;
		}
		// Only treat as collection on LinkedIn hosts
		if (!hostname.endsWith('linkedin.com')) return false;
		return (
			normalizedPath.startsWith('/jobs/collections/') ||
			normalizedPath === '/jobs/search' ||
			normalizedPath.startsWith('/jobs/search/')
		);
	} catch {
		return false;
	}
}

export function getScraperResultsStorageKey(source: 'linkedin' | 'google' | 'remoterocketship'): string {
	return `scraper-results:${source}`;
}
