import { test, expect } from './test-setup';

const source = 'linkedin' as const;

const MOCK_RESULT = {
	title: 'LinkedIn Job Result',
	url: 'https://example.com/job/result-card',
	snippet: 'A mocked job result',
	source,
	company: 'Example Corp',
	postedDate: '2 days ago',
};

test.describe('result-card action buttons', () => {
	test('Run ATS opens the JD review modal with an editable, populated textarea', async ({ findJobPage }) => {
		await findJobPage.mockResults(source, [MOCK_RESULT]);
		await findJobPage.mockJd('Mocked job description text');

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		await findJobPage.getCardAction(0, 'runATS').click();

		await expect(findJobPage.jdEditModal).toBeVisible();
		// The fetched JD is loaded from the API and the field must stay editable
		await expect(findJobPage.jdEditTextarea).toBeEnabled();
		await expect(findJobPage.jdEditTextarea).toHaveValue(/Mocked job description text/);
	});

	test('Run ATS preserves user edits made while the saved JD request is pending', async ({ findJobPage }) => {
		await findJobPage.mockResults(source, [MOCK_RESULT]);
		// Delay the saved-JD response so there is time to edit before it resolves
		await findJobPage.mockJd('Saved JD from database', 1500);

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		await findJobPage.getCardAction(0, 'runATS').click();
		await expect(findJobPage.jdEditModal).toBeVisible();

		// Type while the request is still pending
		await findJobPage.jdEditTextarea.fill('My custom edit while loading');

		// Once the saved JD resolves, the user edit must NOT be overwritten
		await expect(findJobPage.jdEditTextarea).toHaveValue('My custom edit while loading', { timeout: 5000 });
		await expect(findJobPage.jdEditTextarea).not.toHaveValue('Saved JD from database');
	});

	test('Show JD opens the JD view modal with the saved description', async ({ findJobPage }) => {
		await findJobPage.mockResults(source, [MOCK_RESULT]);
		await findJobPage.mockJd('Saved JD from database');

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		await findJobPage.getCardAction(0, 'showJD').click();

		await expect(findJobPage.jdViewModal).toBeVisible();
		await expect(findJobPage.jdViewBody).toContainText('Saved JD from database');
	});

	test('Save posts to /api/job-data/save and shows a success toast', async ({ findJobPage }) => {
		await findJobPage.mockResults(source, [MOCK_RESULT]);

		const saveRequest = findJobPage.page.waitForRequest(
			req => req.url().includes('/api/job-data/save') && req.method() === 'POST'
		);
		await findJobPage.page.route('**/api/job-data/save', async route => {
			if (route.request().method() === 'POST') {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
				return;
			}
			await route.continue();
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		await findJobPage.getCardAction(0, 'save').click();

		const req = await saveRequest;
		const body = JSON.parse(req.postData() || '{}');
		expect(body.item.url).toBe('https://example.com/job/result-card');
		expect(body.source).toBe(source);

		await findJobPage.waitForToast('Job saved successfully');
	});

	test('Remove confirms then posts to /api/job-data/remove and drops the card', async ({ findJobPage }) => {
		await findJobPage.mockResults(source, [MOCK_RESULT]);

		const removeRequest = findJobPage.page.waitForRequest(
			req => req.url().includes('/api/job-data/remove') && req.method() === 'POST'
		);
		await findJobPage.page.route('**/api/job-data/remove', async route => {
			if (route.request().method() === 'POST') {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
				return;
			}
			await route.continue();
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		await findJobPage.getCardAction(0, 'remove').click();

		// Confirmation modal appears before any delete call
		await expect(findJobPage.sharedModal).toBeVisible();
		await expect(findJobPage.sharedModal).toContainText('Remove Item');
		await findJobPage.getSharedModalConfirmBtn().click();

		const req = await removeRequest;
		const body = JSON.parse(req.postData() || '{}');
		expect(body.url).toBe('https://example.com/job/result-card');
		expect(body.source).toBe(source);

		await expect(findJobPage.resultsList).not.toContainText('LinkedIn Job Result');
	});

	test('Applied? opens the Add to Dashboard modal and posts to /api/job-data/apply', async ({ findJobPage }) => {
		await findJobPage.mockResults(source, [MOCK_RESULT]);

		const applyRequest = findJobPage.page.waitForRequest(
			req => req.url().includes('/api/job-data/apply') && req.method() === 'POST'
		);
		await findJobPage.page.route('**/api/job-data/apply', async route => {
			if (route.request().method() === 'POST') {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
				return;
			}
			await route.continue();
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		await findJobPage.getCardAction(0, 'apply').click();

		await expect(findJobPage.sharedModal).toBeVisible();
		await expect(findJobPage.sharedModal).toContainText('Add to Dashboard');

		// Suggested card name is prefilled from company + title
		await expect(findJobPage.getApplyNameInput()).toHaveValue('Example Corp - LinkedIn Job Result');
		await findJobPage.getSharedModalConfirmBtn().click();

		const req = await applyRequest;
		const body = JSON.parse(req.postData() || '{}');
		expect(body.item.url).toBe('https://example.com/job/result-card');
		expect(body.source).toBe(source);

		await findJobPage.waitForToast('Job moved to dashboard');
	});

	test('Apply link opens the job URL in a new tab', async ({ findJobPage }) => {
		await findJobPage.mockResults(source, [MOCK_RESULT]);

		// Stub the external job URL so the popup loads deterministically offline.
		// Route on the browser context so the new popup page is intercepted too.
		await findJobPage.page.context().route('**/job/result-card', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'text/html',
				body: '<title>Job</title>',
			});
		});

		await findJobPage.goto();
		await findJobPage.page.waitForURL('**/findJob.html?source=linkedin*');

		const applyLink = findJobPage.getApplyLink();
		await expect(applyLink).toBeVisible();
		await expect(applyLink).toHaveAttribute('href', 'https://example.com/job/result-card');
		await expect(applyLink).toHaveAttribute('target', '_blank');
		await expect(applyLink).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(applyLink).toHaveText('Apply ↗');

		// Clicking opens a new browser page pointing at the job URL
		const [popup] = await Promise.all([
			findJobPage.page.waitForEvent('popup'),
			applyLink.click(),
		]);
		await popup.waitForURL('**/job/result-card');
		expect(popup.url()).toBe('https://example.com/job/result-card');
		await popup.close();
	});
});
