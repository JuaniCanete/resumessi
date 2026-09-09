import { test, expect } from './test-setup';

const SOURCES: Array<{ source: 'linkedin' | 'google' | 'remoterocketship'; value: string }> = [
	{ source: 'linkedin', value: 'LinkedIn' },
	{ source: 'google', value: 'Google' },
	{ source: 'remoterocketship', value: 'Remote Rocketship' },
];

function payloadFor(source: string, hasResults: boolean) {
	if (!hasResults) {
		return { timestamp: null, source, query: {}, totalResults: 0, results: [] };
	}
	return {
		timestamp: new Date().toISOString(),
		source,
		query: { role: 'Software Engineer' },
		totalResults: 1,
		results: [
			{
				title: `${source} Job Result`,
				url: 'https://example.com/job',
				snippet: 'A mocked job result',
				source,
				company: 'Example Corp',
				postedDate: '2 days ago',
			},
		],
	};
}

test.describe('Remove all results button', () => {
	for (const { source, value } of SOURCES) {
		test(`clears all results for ${source} view and posts the right source parameter`, async ({ findJobPage }) => {
			let cleared = false;

			await findJobPage.page.route(`**/api/scraper/results?source=${source}`, async route => {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(payloadFor(source, !cleared)),
				});
			});

			const clearRequest = findJobPage.page.waitForRequest(
				req => req.url().includes('/api/scraper/clear-source') && req.method() === 'POST'
			);
			await findJobPage.page.route('**/api/scraper/clear-source', async route => {
				cleared = true;
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true }),
				});
			});

			// clearScraperSource now uses the shared confirmation modal
			await findJobPage.goto();
			if (source !== 'linkedin') {
				await findJobPage.switchSource(value);
			}
			await expect(findJobPage.resultsList).toContainText('Job Result');

			// Trigger the "Remove all results" button, confirm via the shared modal
			await findJobPage.clearAllResultsBtn.click();
			await expect(findJobPage.sharedModal).toContainText('Remove Item');
			await expect(findJobPage.sharedModal).toContainText('Remove All');
			await findJobPage.getSharedModalConfirmBtn().click();

			const req = await clearRequest;
			const body = JSON.parse(req.postData() || '{}');
			expect(body.source).toBe(source);

			// UI re-renders to the empty state after the clear
			await expect(findJobPage.noResults).toBeVisible();
			await expect(findJobPage.resultsList).toBeEmpty();
		});
	}

	test('clear-all-results is disabled when source has no results (does not fire API request)', async ({
		findJobPage,
	}) => {
		const source = 'linkedin';

		// Clear any sessionStorage cache so the page reads from the mocked API
		await findJobPage.page.evaluate(() => {
			sessionStorage.removeItem('scraper-results');
			localStorage.removeItem('scraper-results:linkedin');
		});

		// Mock empty results payload for the source
		await findJobPage.page.route(`**/api/scraper/results?source=${source}`, async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(payloadFor(source, false)),
			});
		});

		await findJobPage.goto();

		// Button should be disabled (has the disabled class)
		await expect(findJobPage.clearAllResultsBtn).toHaveClass(/card-action-btn--disabled/);

		// Set up a request listener to catch any clear-source POST
		let clearRequestFired = false;
		await findJobPage.page.route('**/api/scraper/clear-source', async route => {
			clearRequestFired = true;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true }),
			});
		});

		// Click the disabled button - it should NOT fire the API request
		// Using force: true because a disabled button is not actionable normally
		await findJobPage.clearAllResultsBtn.click({ force: true });

		// Wait a bit to ensure no async request fires
		await findJobPage.page.waitForLoadState('networkidle');

		expect(clearRequestFired).toBe(false);
	});
});
