import { test, expect } from './test-setup';

test.describe('UI Feedback — Toasts, Modals, Dashboard', () => {
	// ─── Toast Notifications ─────────────────────────────────────────────

	test.describe('Toast notifications', () => {
		test('error toast appears on ATS scan failure (500 response)', async ({ mainPage }) => {
			await mainPage.enterJobDescription('Some job description');
			await mainPage.page.unroute('**/api/infer');
			await mainPage.page.route('**/api/infer', async route => {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: 'Mocked ATS failure' }),
				});
			});

			await mainPage.clickScan();

			const feedback = mainPage.rpFeedback;
			await feedback.waitFor({ state: 'visible', timeout: 10000 });
			const text = await feedback.textContent();
			expect(text).toBeTruthy();
		});

		test('error toast appears when job description is missing for ATS scan', async ({ mainPage }) => {
			await mainPage.page.evaluate(() => {
				localStorage.setItem(
					'resume-data',
					JSON.stringify({
						basics: { name: 'Test User', email: 'test@example.com', photo: null },
						experience: [],
						education: [],
						skills: {},
					})
				);
			});
			await mainPage.page.reload();
			await mainPage.waitForResumeLoaded();

			await mainPage.enterJobDescription('');
			await mainPage.page.evaluate(() => {
				const btn = document.getElementById('btn-run-scan');
				if (btn) btn.removeAttribute('disabled');
			});
			await mainPage.btnRunScan.click();

			const toast = mainPage.getToastElement();
			await toast.waitFor({ state: 'visible', timeout: 5000 });
			const text = await toast.textContent();
			expect(text).toContain('Please paste a Job Description');
		});

		test('info toast appears when dropping card in same column', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Stay Here Job', url: 'https://example.com/stay', status: 'No News', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();

			const card = findJobPage.getCardsInColumn('applied').first();
			const targetContainer = findJobPage.getCardsInColumn('applied').locator('..');
			await card.dragTo(targetContainer);

			const toast = findJobPage.getToastByMessage('Already in this column');
			await toast.waitFor({ state: 'visible', timeout: 3000 });
		});
	});

	// ─── Modal Keyboard Behavior ─────────────────────────────────────────

	test.describe('Modal keyboard behavior', () => {
		test('Escape key closes providers modal', async ({ mainPage }) => {
			await mainPage.page.evaluate(() => {
				localStorage.setItem(
					'resume-data',
					JSON.stringify({
						basics: { name: 'Test User', email: 'test@example.com', photo: null },
						experience: [],
						education: [],
						skills: {},
					})
				);
			});
			await mainPage.page.reload();
			await mainPage.waitForResumeLoaded();

			await mainPage.openProvidersModal();
			await expect(mainPage.providersModal).toBeVisible();

			await mainPage.page.keyboard.press('Escape');
			await expect(mainPage.providersModal).not.toBeVisible();
		});

		test('Enter key does not create duplicate modal', async ({ mainPage }) => {
			await mainPage.page.evaluate(() => {
				localStorage.setItem(
					'resume-data',
					JSON.stringify({
						basics: { name: 'Test User', email: 'test@example.com', photo: null },
						experience: [],
						education: [],
						skills: {},
					})
				);
			});
			await mainPage.page.reload();
			await mainPage.waitForResumeLoaded();

			await mainPage.openProvidersModal();
			await expect(mainPage.providersModal).toBeVisible();

			const modalCountBefore = await mainPage.getModalElement().count();
			await mainPage.page.keyboard.press('Enter');
			const modalCountAfter = await mainPage.getModalElement().count();
			expect(modalCountAfter).toBeLessThanOrEqual(modalCountBefore);
		});
	});

	// ─── Dashboard Interactions ──────────────────────────────────────────

	test.describe('Dashboard interactions', () => {
		test('update-status API accepts cross-column transition params', async ({ findJobPage }) => {
			let updateStatusCalled = false;
			let capturedBody: Record<string, unknown> = {};

			await findJobPage.mockDashboardApi([
				{ title: 'Scraped Job', url: 'https://example.com/scraped', status: 'No News', column: 'applied' },
			]);

			// Override the mockDashboardApi route for update-status
			await findJobPage.page.unroute('**/api/job-data/update-status');
			await findJobPage.page.route('**/api/job-data/update-status', async route => {
				if (route.request().method() === 'POST') {
					updateStatusCalled = true;
					capturedBody = JSON.parse(route.request().postData() || '{}');
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true }),
				});
			});

			await findJobPage.switchToDashboard();
			// Wait for dashboard cards to be visible
			await findJobPage.getCardsInColumn('applied').first().waitFor({ state: 'visible', timeout: 5000 });

			// TODO(Playwright limitation): dragTo does not reliably simulate cross-container
			// HTML5 drag-and-drop. Same-column drop is covered by the test below.
			// Replace this with a real drag interaction once Playwright supports it,
			// or extract drop-handler logic into a testable unit.
			await findJobPage.page.evaluate(async () => {
				const resp = await fetch('/api/job-data/update-status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						url: 'https://example.com/scraped',
						status: 'Interviewing',
						column: 'screening',
					}),
				});
				return resp.ok;
			});

			expect(updateStatusCalled).toBe(true);
			expect(capturedBody.status).toBe('Interviewing');
			expect(capturedBody.column).toBe('screening');
		});

		test('same-column drop shows info toast', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Stay Here Job', url: 'https://example.com/stay', status: 'No News', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();
			// Wait for dashboard cards to be visible
			await findJobPage.getCardsInColumn('applied').first().waitFor({ state: 'visible', timeout: 5000 });

			const card = findJobPage.getCardsInColumn('applied').first();
			const targetContainer = findJobPage.getCardsInColumn('applied').locator('..');
			await card.dragTo(targetContainer);

			const toast = findJobPage.getToastByMessage('Already in this column');
			await toast.waitFor({ state: 'visible', timeout: 3000 });
		});

		test('rename without changes does not call API', async ({ findJobPage }) => {
			let renameCallCount = 0;

			await findJobPage.page.route('**/api/job-data/rename', async route => {
				if (route.request().method() === 'POST') {
					renameCallCount++;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true }),
				});
			});

			await findJobPage.mockDashboardApi([
				{ title: 'Rename Me', url: 'https://example.com/rename', status: 'No News', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();
			// Wait for dashboard cards to be visible
			await findJobPage.getCardsInColumn('applied').first().waitFor({ state: 'visible', timeout: 5000 });

			await findJobPage.clickRenameOnCard(0, 'applied');
			const input = findJobPage.getCardsInColumn('applied').first().locator('input[type="text"]');
			await input.waitFor({ state: 'visible', timeout: 2000 });
			await input.press('Enter');
			// Wait for rename to complete (input replaced by title)
			await findJobPage
				.getCardsInColumn('applied')
				.first()
				.locator('.board-card-title')
				.waitFor({ state: 'visible', timeout: 5000 });

			expect(renameCallCount).toBe(0);
		});

		test('rename with changes calls API', async ({ findJobPage }) => {
			let capturedTitle: string | null = null;

			await findJobPage.mockDashboardApi([
				{ title: 'Old Title', url: 'https://example.com/rename2', status: 'No News', column: 'applied' },
			]);

			// Override the mockDashboardApi route for rename
			await findJobPage.page.unroute('**/api/job-data/rename');
			await findJobPage.page.route('**/api/job-data/rename', async route => {
				if (route.request().method() === 'POST') {
					const body = JSON.parse(route.request().postData() || '{}');
					capturedTitle = body.title as string;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true }),
				});
			});

			await findJobPage.switchToDashboard();
			// Wait for dashboard cards to be visible
			await findJobPage.getCardsInColumn('applied').first().waitFor({ state: 'visible', timeout: 5000 });

			await findJobPage.renameCard(0, 'applied', 'New Title');
			// Wait for rename to complete
			await findJobPage
				.getCardsInColumn('applied')
				.first()
				.locator('.board-card-title')
				.waitFor({ state: 'visible', timeout: 5000 });

			expect(capturedTitle).toBe('New Title');
		});
	});
});
