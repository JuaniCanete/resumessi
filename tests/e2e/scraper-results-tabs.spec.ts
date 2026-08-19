import { test, expect } from '@playwright/test';

// Mirrors the ScraperRunPayload shape from public/findJob-app.ts
interface MockResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google' | 'remoterocketship';
  company?: string;
  postedDate?: string;
}

function buildPayload(source: 'linkedin' | 'google' | 'remoterocketship'): { timestamp: string; source: 'linkedin' | 'google' | 'remoterocketship'; query: Record<string, string>; totalResults: number; results: MockResult[] } {
  return {
    timestamp: new Date().toISOString(),
    source,
    query: { role: 'Software Engineer' },
    totalResults: 1,
    results: [
      {
        title: source === 'linkedin' ? 'LinkedIn Job Result' : source === 'google' ? 'Google Job Result' : 'RemoteRocketship Job Result',
        url: 'https://example.com/job',
        snippet: 'A mocked job result',
        source,
        company: 'Example Corp',
        postedDate: '2 days ago',
      },
    ],
  };
}

function buildEmptyPayload(source: 'linkedin' | 'google' | 'remoterocketship'): { timestamp: string | null; source: 'linkedin' | 'google' | 'remoterocketship'; query: Record<string, string>; totalResults: number; results: MockResult[] } {
  return {
    timestamp: null,
    source,
    query: { role: 'Software Engineer' },
    totalResults: 0,
    results: [],
  };
}

async function switchSource(page: import('@playwright/test').Page, source: 'linkedin' | 'google' | 'remoterocketship') {
  const labelMap: Record<string, string> = {
    linkedin: 'LinkedIn',
    google: 'Google',
    remoterocketship: 'Remote Rocketship',
  };
  const label = labelMap[source];
  
  // Open the actions dropdown by directly manipulating DOM
  await page.evaluate(() => {
    const dropdown = document.getElementById('findjob-actions-dropdown');
    const trigger = document.getElementById('findjob-actions-trigger');
    if (dropdown && trigger) {
      dropdown.classList.remove('hidden');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
  
  // Wait for dropdown to be visible
  await page.locator('#findjob-actions-dropdown').waitFor({ state: 'visible', timeout: 5000 });
  
  // Click the appropriate source option
  await page.locator(`.actions-option:has-text("${label}")`).click();
  
  // For Remote Rocketship, handle the confirm modal
  if (source === 'remoterocketship') {
    // Wait for confirm modal to appear
    await page.locator('#remoterocketship-confirm-modal').waitFor({ state: 'visible', timeout: 5000 });
    // Click Confirm button
    await page.locator('#remoterocketship-confirm-modal button:has-text("Confirm")').click();
    // Wait for modal to disappear
    await page.locator('#remoterocketship-confirm-modal').waitFor({ state: 'hidden', timeout: 5000 });
  }
  
  // Wait for the badge to update (polling fetches and renders results)
  const expectedLabel = label === 'remoterocketship' ? 'Remote Rocketship' : label;
  await expect(page.locator('#source-badge')).toContainText(expectedLabel, { timeout: 10000 });
}

test.describe('Scraper Results — Source Switching', () => {
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

		await page.goto('/public/findJob.html?source=linkedin', { waitUntil: 'domcontentloaded' });

		// LinkedIn shows a card and no empty state
		await expect(page.locator('#results-list')).toContainText('LinkedIn Job Result');
		await expect(page.locator('#no-results')).not.toBeVisible();

		// Switch to Google (empty) → cards must be cleared, only no-results shows
		await switchSource(page, 'google');

		await expect(page.locator('#no-results')).toBeVisible();
		await expect(page.locator('#results-list')).not.toContainText('LinkedIn Job Result');
		await expect(page.locator('#results-list')).toBeEmpty();
		await expect(page.locator('#pagination')).not.toBeVisible();

		// Header meta fields must be reset to empty-state defaults (Issue 6)
		await expect(page.locator('#meta-timestamp')).toHaveText('No results');
		await expect(page.locator('#meta-total')).toHaveText('N/A');
		await expect(page.locator('#meta-query')).toHaveText('N/A');
		await expect(page.locator('#query-link-wrapper')).not.toBeVisible();
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

		await page.goto('/public/findJob.html?source=linkedin', { waitUntil: 'domcontentloaded' });

		// LinkedIn should be active by default and show the LinkedIn result
		await expect(page.locator('#source-badge')).toContainText('LinkedIn');
		await expect(page.locator('#results-list')).toContainText('LinkedIn Job Result');

		// Click Google source via dropdown → switchResultsTab('google') must be defined
		await switchSource(page, 'google');

		await expect(page.locator('#results-list')).toContainText('Google Job Result');

		// Click LinkedIn source via dropdown → switch back
		await switchSource(page, 'linkedin');

		await expect(page.locator('#results-list')).toContainText('LinkedIn Job Result');
	});

	test('can switch to Remote Rocketship source', async ({ page }) => {
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
		await page.route('**/api/scraper/results?source=remoterocketship', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('remoterocketship')),
			});
		});

		await page.goto('/public/findJob.html?source=linkedin', { waitUntil: 'domcontentloaded' });

		await switchSource(page, 'remoterocketship');

		await expect(page.locator('#results-list')).toContainText('RemoteRocketship Job Result');
	});
});