import { test, expect } from './test-setup';

test.describe('Job Scraper — Select All Domains', () => {
	test('select all toggles every domain checkbox and updates query preview', async ({ mainPage }) => {
		// Open the Job Scraper modal from the Actions dropdown
		await mainPage.openActions();
		await mainPage.page.getByTestId('find-job-button').click();
		await mainPage.page.getByTestId('job-scraper-modal').waitFor({ state: 'visible' });

		// Switch to Google platform to reveal the domains checklist
		await mainPage.page.getByRole('button', { name: /google/i }).click();

		const checklist = mainPage.page.locator('#domains-checklist');
		await expect(checklist).toBeVisible();

		const domainCheckboxes = checklist.locator('input[type="checkbox"]:not(#select-all-domains)');
		const selectAll = checklist.locator('#select-all-domains');
		const domainCount = await domainCheckboxes.count();
		expect(domainCount).toBeGreaterThan(0);

		// Initially all domain checkboxes should be unchecked
		for (let i = 0; i < domainCount; i++) {
			await expect(domainCheckboxes.nth(i)).not.toBeChecked();
		}

		// Check "Select All" → every domain checkbox becomes checked
		await selectAll.check();
		for (let i = 0; i < domainCount; i++) {
			await expect(domainCheckboxes.nth(i)).toBeChecked();
		}

		// Uncheck "Select All" → every domain checkbox becomes unchecked
		await selectAll.uncheck();
		for (let i = 0; i < domainCount; i++) {
			await expect(domainCheckboxes.nth(i)).not.toBeChecked();
		}

		// Re-check → query preview should include site: filters for each domain
		await selectAll.check();
		const preview = await mainPage.page.locator('#query-url-preview').textContent();
		// The preview displays a URL-encoded query, so decode before asserting
		const decodedPreview = decodeURIComponent(preview || '');
		expect(decodedPreview).toContain('site:teamtailor.com');
		expect(decodedPreview).toContain('site:greenhouse.io');
	});
});