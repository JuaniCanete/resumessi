import { test, expect } from './test-setup';

function scraperPayload(source: string, hasResults: boolean) {
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

function savedJobsPayload() {
	return [
		{
			title: 'Saved Job 1',
			url: 'https://example.com/saved-1',
			snippet: 'Saved job snippet',
			source: 'linkedin',
			company: 'Saved Corp',
			savedAt: new Date().toISOString(),
			applied: false,
			saved: true,
		},
		{
			title: 'Saved Job 2',
			url: 'https://example.com/saved-2',
			snippet: 'Another saved job',
			source: 'google',
			company: 'Another Corp',
			savedAt: new Date().toISOString(),
			applied: true,
			saved: true,
		},
	];
}

test.describe('Clear results regression - progress preserved', () => {
	test('clears scraper results for a source, reload shows empty state, no stale cards from storage', async ({
		findJobPage,
	}) => {
		let cleared = false;

		await findJobPage.page.route('**/api/scraper/results?source=linkedin', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(scraperPayload('linkedin', !cleared)),
			});
		});

		const clearRequest = findJobPage.page.waitForRequest(
			req => req.url().includes('/api/scraper/clear-source') && req.method() === 'POST'
		);
		await findJobPage.page.route('**/api/scraper/clear-source', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true }),
			});
		});

		// Clear sessionStorage so the page reload fetches from mocked API instead of cached session data
		await findJobPage.page.evaluate(() => {
			sessionStorage.removeItem('scraper-results');
			localStorage.removeItem('scraper-results:linkedin');
		});

		await findJobPage.goto();
		await expect(findJobPage.resultsList).toContainText('Job Result');

		await findJobPage.clearAllResultsBtn.click();
		await expect(findJobPage.sharedModal).toContainText('Remove Item');
		await expect(findJobPage.sharedModal).toContainText('Remove All');
		await findJobPage.getSharedModalConfirmBtn().click();

		const req = await clearRequest;
		const body = JSON.parse(req.postData() || '{}');
		expect(body.source).toBe('linkedin');
		cleared = true;

		await expect(findJobPage.noResults).toBeVisible();
		await expect(findJobPage.resultsList).toBeEmpty();

		await findJobPage.page.reload({ waitUntil: 'domcontentloaded' });
		await findJobPage.findJobActionsTrigger.waitFor({ state: 'visible' });

		await expect(findJobPage.noResults).toBeVisible();
		await expect(findJobPage.resultsList).toBeEmpty();
	});

	test('after clearing scraper results, saved jobs remain intact on Saved tab', async ({ findJobPage }) => {
		let cleared = false;

		await findJobPage.mockSavedJobs(savedJobsPayload());

		await findJobPage.page.route('**/api/scraper/results?source=linkedin', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(scraperPayload('linkedin', !cleared)),
			});
		});

		const clearRequest = findJobPage.page.waitForRequest(
			req => req.url().includes('/api/scraper/clear-source') && req.method() === 'POST'
		);
		await findJobPage.page.route('**/api/scraper/clear-source', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true }),
			});
		});

		await findJobPage.goto();
		await expect(findJobPage.resultsList).toContainText('Job Result');

		await findJobPage.clearAllResultsBtn.click();
		await expect(findJobPage.sharedModal).toContainText('Remove Item');
		await expect(findJobPage.sharedModal).toContainText('Remove All');
		await findJobPage.getSharedModalConfirmBtn().click();

		const req = await clearRequest;
		const body = JSON.parse(req.postData() || '{}');
		expect(body.source).toBe('linkedin');
		cleared = true;

		await findJobPage.gotoSaved();

		const cards = findJobPage.savedResultsList.locator('.result-card');
		await expect(cards).toHaveCount(2);
		await expect(cards.nth(0)).toContainText('Saved Job 1');
		await expect(cards.nth(1)).toContainText('Saved Job 2');
	});
});
