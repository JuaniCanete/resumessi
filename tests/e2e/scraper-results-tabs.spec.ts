import { test, expect } from '@playwright/test';

// Mirrors the ScraperRunPayload shape from public/results-app.ts
interface MockResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  company?: string;
  postedDate?: string;
}

function buildPayload(source: 'linkedin' | 'google'): { timestamp: string; source: 'linkedin' | 'google'; query: Record<string, string>; totalResults: number; results: MockResult[] } {
  return {
    timestamp: new Date().toISOString(),
    source,
    query: { role: 'Software Engineer' },
    totalResults: 1,
    results: [
      {
        title: source === 'linkedin' ? 'LinkedIn Job Result' : 'Google Job Result',
        url: 'https://example.com/job',
        snippet: 'A mocked job result',
        source,
        company: 'Example Corp',
        postedDate: '2 days ago',
      },
    ],
  };
}

function buildEmptyPayload(source: 'linkedin' | 'google'): { timestamp: string | null; source: 'linkedin' | 'google'; query: Record<string, string>; totalResults: number; results: MockResult[] } {
  return {
    timestamp: null,
    source,
    query: { role: 'Software Engineer' },
    totalResults: 0,
    results: [],
  };
}

test.describe('Scraper Results — Tab Switching', () => {
	test('empty results show only no-results state and clear previously rendered cards', async ({ page }) => {
		// Mock LinkedIn with results, Google with no results
		await page.route('**/api/scraper/results?source=linkedin', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('linkedin')),
			});
		});
		await page.route('**/api/scraper/results?source=google', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildEmptyPayload('google')),
			});
		});

		await page.goto('/public/results.html?source=linkedin', { waitUntil: 'domcontentloaded' });

		// LinkedIn shows a card and no empty state
		await expect(page.locator('#results-list')).toContainText('LinkedIn Job Result');
		await expect(page.locator('#no-results')).not.toBeVisible();

		// Switch to Google (empty) → cards must be cleared, only no-results shows
		await page.locator('#tab-google').click();

		await expect(page.locator('#no-results')).toBeVisible();
		await expect(page.locator('#results-list')).not.toContainText('LinkedIn Job Result');
		await expect(page.locator('#results-list')).toBeEmpty();
		await expect(page.locator('#pagination')).not.toBeVisible();
	});

	test('switchResultsTab is wired and toggles between LinkedIn and Google results', async ({ page }) => {
		// Mock the scraper results API per source
		await page.route('**/api/scraper/results?source=linkedin', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('linkedin')),
			});
		});
		await page.route('**/api/scraper/results?source=google', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('google')),
			});
		});

		await page.goto('/public/results.html?source=linkedin', { waitUntil: 'domcontentloaded' });

		// LinkedIn should be active by default and show the LinkedIn result
		await expect(page.locator('#tab-linkedin')).toHaveClass(/active/);
		await expect(page.locator('#results-list')).toContainText('LinkedIn Job Result');
		await expect(page.locator('#tab-google')).not.toHaveClass(/active/);

		// Click Google tab → switchResultsTab('google') must be defined (was ReferenceError before fix)
		await page.locator('#tab-google').click();

		await expect(page.locator('#tab-google')).toHaveClass(/active/);
		await expect(page.locator('#tab-linkedin')).not.toHaveClass(/active/);
		await expect(page.locator('#results-list')).toContainText('Google Job Result');
		await expect(page.locator('#source-badge')).toContainText('Google');

		// Click LinkedIn tab → switch back
		await page.locator('#tab-linkedin').click();

		await expect(page.locator('#tab-linkedin')).toHaveClass(/active/);
		await expect(page.locator('#tab-google')).not.toHaveClass(/active/);
		await expect(page.locator('#results-list')).toContainText('LinkedIn Job Result');
	});
});