import { test, expect } from './test-setup';

interface MockResult {
	title: string;
	url: string;
	snippet: string;
	source: 'linkedin' | 'google' | 'remoterocketship';
	company?: string;
	postedDate?: string;
}

function buildPayload(source: 'linkedin' | 'google' | 'remoterocketship'): {
	timestamp: string;
	source: 'linkedin' | 'google' | 'remoterocketship';
	query: Record<string, string>;
	totalResults: number;
	results: MockResult[];
} {
	return {
		timestamp: new Date().toISOString(),
		source,
		query: { role: 'Software Engineer' },
		totalResults: 1,
		results: [
			{
				title:
					source === 'linkedin'
						? 'LinkedIn Job Result'
						: source === 'google'
							? 'Google Job Result'
							: 'RemoteRocketship Job Result',
				url: 'https://example.com/job',
				snippet: 'A mocked job result',
				source,
				company: 'Example Corp',
				postedDate: '2 days ago',
			},
		],
	};
}

function buildEmptyPayload(source: 'linkedin' | 'google' | 'remoterocketship'): {
	timestamp: string | null;
	source: 'linkedin' | 'google' | 'remoterocketship';
	query: Record<string, string>;
	totalResults: number;
	results: MockResult[];
} {
	return {
		timestamp: null,
		source,
		query: { role: 'Software Engineer' },
		totalResults: 0,
		results: [],
	};
}

test.describe('Scraper Results — Source Switching', () => {
	test('empty results show only no-results state and clear previously rendered cards', async ({ findJobPage }) => {
		await findJobPage.page.route('**/api/scraper/results?source=linkedin', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('linkedin')),
			});
		});
		await findJobPage.page.route('**/api/scraper/results?source=google', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildEmptyPayload('google')),
			});
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		// LinkedIn shows a card and no empty state
		await expect(findJobPage.resultsList).toContainText('LinkedIn Job Result');
		await expect(findJobPage.noResults).not.toBeVisible();

		// Switch to Google (empty) → cards must be cleared, only no-results shows
		await findJobPage.switchSource(findJobPage.googleSourceValue);

		await expect(findJobPage.noResults).toBeVisible();
		await expect(findJobPage.resultsList).not.toContainText('LinkedIn Job Result');
		await expect(findJobPage.resultsList).toBeEmpty();
		await expect(findJobPage.pagination).not.toBeVisible();

		// Header meta fields must be reset to empty-state defaults (Issue 6)
		await expect(findJobPage.metaTimestamp).toHaveText('No results');
		await expect(findJobPage.metaTotal).toHaveText('N/A');
		await expect(findJobPage.metaQuery).toHaveText('N/A');
		await expect(findJobPage.queryLinkWrapper).not.toBeVisible();
	});

	test('switchResultsTab is wired and toggles between LinkedIn and Google results', async ({ findJobPage }) => {
		await findJobPage.page.route('**/api/scraper/results?source=linkedin', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('linkedin')),
			});
		});
		await findJobPage.page.route('**/api/scraper/results?source=google', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('google')),
			});
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		// LinkedIn should be active by default and show the LinkedIn result
		await expect(findJobPage.metaSource).toContainText(findJobPage.linkedinSourceValue);
		await expect(findJobPage.resultsList).toContainText('LinkedIn Job Result');

		// Click Google source via dropdown → switchResultsTab('google') must be defined
		await findJobPage.switchSource(findJobPage.googleSourceValue);
		await expect(findJobPage.metaSource).toContainText(findJobPage.googleSourceValue);
		await expect(findJobPage.resultsList).toContainText('Google Job Result');

		// Click LinkedIn source via dropdown → switch back
		await findJobPage.switchSource(findJobPage.linkedinSourceValue);
		await expect(findJobPage.metaSource).toContainText(findJobPage.linkedinSourceValue);
		await expect(findJobPage.resultsList).toContainText('LinkedIn Job Result');
	});

	test('can switch to Remote Rocketship source', async ({ findJobPage }) => {
		await findJobPage.page.route('**/api/scraper/results?source=linkedin', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('linkedin')),
			});
		});
		await findJobPage.page.route('**/api/scraper/results?source=google', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('google')),
			});
		});
		await findJobPage.page.route('**/api/scraper/results?source=remoterocketship', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('remoterocketship')),
			});
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		await findJobPage.switchSource(findJobPage.remoteRocketshipSourceValue);
		await expect(findJobPage.metaSource).toContainText(findJobPage.remoteRocketshipSourceValue);
		await expect(findJobPage.resultsList).toContainText('RemoteRocketship Job Result');
	});

	test('dropdown closes after selecting a source option', async ({ findJobPage }) => {
		await findJobPage.page.route('**/api/scraper/results?source=linkedin', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('linkedin')),
			});
		});
		await findJobPage.page.route('**/api/scraper/results?source=google', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(buildPayload('google')),
			});
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		// Verify dropdown is initially closed
		await expect(findJobPage.isDropdownClosed()).resolves.toBe(true);

		// Open dropdown using the page object method
		await findJobPage.findJobActionsTrigger.click({ force: true });
		await findJobPage.page.evaluate(() => {
			const dropdown = document.getElementById('findjob-actions-dropdown');
			if (dropdown) dropdown.classList.remove('hidden');
		});
		await findJobPage.findJobActionsDropdown.waitFor({ state: 'visible', timeout: 5000 });

		// Verify dropdown is open
		await expect(findJobPage.isDropdownClosed()).resolves.toBe(false);

		// Select Google source
		await findJobPage.sourceOptionGoogle.click();

		// Verify dropdown closes after selection
		await expect(findJobPage.isDropdownClosed()).resolves.toBe(true);

		// Verify source changed
		await expect(findJobPage.metaSource).toContainText(findJobPage.googleSourceValue);
	});
});
