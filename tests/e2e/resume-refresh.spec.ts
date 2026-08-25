import { test, expect } from './test-setup';

// Refresh button: shows a toast on click AND triggers a fetch to the
// resume data JSON file (the "API call" that reloads manual JSON edits).
test.describe('Resume Refresh Button', () => {
	// ─── Toast Feedback ───────────────────────────────────────────────

	test('clicking refresh shows the "Applying changes" toast and auto-hides it', async ({ mainPage }) => {
		await mainPage.clickRefresh();

		// Toast appears with the expected message
		await expect(mainPage.refreshMessage).toBeVisible({ timeout: 5000 });
		const text = await mainPage.getRefreshMessageText();
		expect(text).toContain('Applying changes');

		// It auto-hides after ~2s
		await expect(mainPage.refreshMessage).toBeHidden({ timeout: 4000 });
	});

	// ─── API Call (resume JSON fetch) ──────────────────────────────────

	test('clicking refresh triggers a fetch to the resume data JSON file', async ({ mainPage, page }) => {
		let resumeFetchCount = 0;

		await page.route('**/src/resume/output/resume-data.json', async route => {
			resumeFetchCount++;
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					basics: {
						name: 'Refreshed User',
						title: 'Software Engineer',
						email: 'refreshed@example.com',
						phone: '+1-555-000-0000',
						location: 'Remote',
						linkedin: 'https://www.linkedin.com/in/refreshed/',
						github: 'https://github.com/refreshed',
						photo: null,
					},
					summary: 'Refreshed summary',
					experience: [],
					education: [],
					skills: { 'Core Skills': [{ name: 'TypeScript', expert: true }] },
				}),
			});
		});

		// The initial page load already fetched the file; count starts at 0 for our route.
		const before = resumeFetchCount;
		await mainPage.clickRefresh();

		// The refresh click must have issued a fresh fetch to the resume JSON
		expect(resumeFetchCount).toBeGreaterThan(before);

		// And the toast should be visible as feedback for that refresh
		await expect(mainPage.refreshMessage).toBeVisible({ timeout: 5000 });
	});
});
