import { test, expect } from './test-setup';

function savedJobsPayload(count: number = 3) {
	const jobs = [];
	for (let i = 1; i <= count; i++) {
		jobs.push({
			title: `Saved Job ${i}`,
			url: `https://example.com/saved-${i}`,
			snippet: `Saved job snippet ${i}`,
			source: i % 2 === 1 ? 'linkedin' : 'google',
			company: `Company ${i}`,
			savedAt: new Date().toISOString(),
			applied: i % 3 === 0,
			saved: true,
		});
	}
	return jobs;
}

function emptySavedJobsPayload() {
	return [];
}

test.describe('Saved Jobs list rendering', () => {
	test('multi-card render: shows 3 cards with title/company/location', async ({ findJobPage }) => {
		await findJobPage.mockSavedJobs(savedJobsPayload(3));

		await findJobPage.page.route('**/api/scraper/results*', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ timestamp: null, source: 'linkedin', totalResults: 0, results: [] }),
			});
		});

		await findJobPage.goto();
		await findJobPage.gotoSaved();

		const cards = findJobPage.getAllSavedCards();
		await expect(cards).toHaveCount(3);

		await expect(cards.nth(0)).toContainText('Saved Job 1');
		await expect(cards.nth(0)).toContainText('Company 1');
		await expect(cards.nth(1)).toContainText('Saved Job 2');
		await expect(cards.nth(1)).toContainText('Company 2');
		await expect(cards.nth(2)).toContainText('Saved Job 3');
		await expect(cards.nth(2)).toContainText('Company 3');
	});

	test('empty state: no cards, empty-state message renders, no crash', async ({ findJobPage }) => {
		await findJobPage.mockSavedJobs(emptySavedJobsPayload());

		await findJobPage.page.route('**/api/scraper/results*', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ timestamp: null, source: 'linkedin', totalResults: 0, results: [] }),
			});
		});

		await findJobPage.goto();
		await findJobPage.gotoSaved();

		const cards = findJobPage.getAllSavedCards();
		await expect(cards).toHaveCount(0);

		const noResults = findJobPage.page.locator('#saved-no-results');
		await expect(noResults).toBeVisible();
	});

	test('real persistence: state survives reload via localStorage (not re-mocked API)', async ({ findJobPage }) => {
		const jobs = savedJobsPayload(2);

		await findJobPage.seedSavedStorage(jobs);

		// Mock config.json for page initialization
		await findJobPage.page.route('**/config.json', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					availableProviders: ['cohere', 'mistral', 'gemini'],
					primaryProvider: 'cohere',
					AI_INFERENCE_ORDER: 'cohere,mistral,gemini',
				}),
			});
		});

		await findJobPage.page.route('**/api/scraper/results*', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ timestamp: null, source: 'linkedin', totalResults: 0, results: [] }),
			});
		});

		await findJobPage.goto();
		await findJobPage.gotoSaved();

		let cards = findJobPage.getAllSavedCards();
		await expect(cards).toHaveCount(2);
		await expect(cards.nth(0)).toContainText('Saved Job 1');
		await expect(cards.nth(1)).toContainText('Saved Job 2');

		await findJobPage.page.unroute('**/api/job-data/saved');

		let apiCalled = false;
		await findJobPage.page.route('**/api/job-data/saved', async route => {
			apiCalled = true;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([]),
			});
		});

		await findJobPage.page.reload({ waitUntil: 'domcontentloaded' });
		// Wait for page to fully initialize - the trigger might be hidden initially
		await findJobPage.page.waitForFunction(
			() => {
				const el = document.getElementById('findjob-actions-trigger');
				return (
					el && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden'
				);
			},
			{ timeout: 15000 }
		);
		await findJobPage.gotoSaved();

		cards = findJobPage.getAllSavedCards();
		await expect(cards).toHaveCount(2);
		await expect(cards.nth(0)).toContainText('Saved Job 1');
		await expect(cards.nth(1)).toContainText('Saved Job 2');
		// API was hit but UI used localStorage fallback
		expect(apiCalled).toBe(true);
	});
});
