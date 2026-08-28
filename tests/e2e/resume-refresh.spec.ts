import { test, expect } from './test-setup';

test.describe(() => {
	test('clicking refresh shows the "Applying changes" toast and auto-hides it', async ({ mainPage }) => {
		await mainPage.clickRefresh();

		await expect(mainPage.refreshMessage).toBeVisible({ timeout: 5000 });
		const text = await mainPage.getRefreshMessageText();
		expect(text).toContain('Applying changes');

		await expect(mainPage.refreshMessage).toBeHidden({ timeout: 4000 });
	});

	test('clicking refresh triggers a fetch to the resume data JSON file', async ({ mainPage, page }) => {
		let resumeFetchCount = 0;

		await page.unroute('**/src/resume/output/resume-data.json');
		await page.unroute('**/src/resume/output/resume-data-AI-polished.json');

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

		await page.route('**/src/resume/output/resume-data-AI-polished.json', async route => {
			resumeFetchCount++;
			await route.fulfill({
				status: 404,
				contentType: 'application/json',
				body: '{}',
			});
		});

		const before = resumeFetchCount;
		await mainPage.clickRefresh();

		expect(resumeFetchCount).toBeGreaterThan(before);
		await expect(mainPage.refreshMessage).toBeVisible({ timeout: 5000 });
	});
});
