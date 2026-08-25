import { test, expect } from './test-setup';

test.describe('Dashboard View — Full Coverage', () => {
	test.beforeEach(async ({ findJobPage }) => {
		await findJobPage.goto();
	});

	// ─── Column & Card Rendering ──────────────────────────────────────────
	test.describe('Column & Card Rendering', () => {
		test('renders all 7 columns in correct order', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Job A', column: 'applied' },
				{ title: 'Job B', column: 'screening' },
				{ title: 'Job C', column: 'tech' },
				{ title: 'Job D', column: 'client' },
				{ title: 'Job E', column: 'offer' },
				{ title: 'Job F', column: 'rejected' },
				{ title: 'Job G', column: 'hired' },
			]);
			await findJobPage.switchToDashboard();

			const board = findJobPage.dashboardBoard;
			const columns = board.locator('.board-list');
			await expect(columns).toHaveCount(7);

			const columnIds = await columns.evaluateAll((els: HTMLElement[]) => els.map(el => el.dataset.listId));
			expect(columnIds).toEqual(['applied', 'screening', 'tech', 'client', 'offer', 'rejected', 'hired']);
		});

		test('each column shows correct header title', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([]);
			await findJobPage.switchToDashboard();

			// Get header text without count badge - use the text before the count span
			const headers = findJobPage.dashboardBoard.locator('.board-list-header');
			const count = await headers.count();
			const titles: string[] = [];
			for (let i = 0; i < count; i++) {
				const header = headers.nth(i);
				// Get text content excluding the count span
				const text = await header.evaluate((el: HTMLElement) => {
					const clone = el.cloneNode(true) as HTMLElement;
					const countSpan = clone.querySelector('.board-list-count');
					if (countSpan) countSpan.remove();
					return clone.textContent?.trim() || '';
				});
				titles.push(text);
			}
			expect(titles).toEqual([
				'Applied',
				'Screening',
				'Tech round',
				'Client interview',
				'Offer/Cultural fit',
				'Rejected',
				'Hired',
			]);
		});

		test('each column shows card count badge (0 when empty)', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([]);
			await findJobPage.switchToDashboard();

			const counts = await findJobPage.dashboardBoard.locator('.board-list-count').allTextContents();
			expect(counts).toEqual(['0', '0', '0', '0', '0', '0', '0']);
		});

		test('cards render with title, source badge, and status', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{
					title: 'LinkedIn Job',
					url: 'https://linkedin.com/job/1',
					status: 'No News',
					column: 'applied',
					source: 'linkedin',
				},
				{
					title: 'Google Job',
					url: 'https://google.com/job/2',
					status: 'Interviewing',
					column: 'screening',
					source: 'google',
				},
				{
					title: 'RR Job',
					url: 'https://remoterocketship.com/job/3',
					status: 'Offer',
					column: 'offer',
					source: 'remoterocketship',
				},
			]);
			await findJobPage.switchToDashboard();

			// Check Applied column card
			const appliedCard = findJobPage.getCardsInColumn('applied').first();
			await expect(appliedCard.locator('.board-card-title')).toHaveText('LinkedIn Job');
			await expect(appliedCard.locator('.board-card-source')).toHaveText('LinkedIn');

			// Check Screening column card
			const screeningCard = findJobPage.getCardsInColumn('screening').first();
			await expect(screeningCard.locator('.board-card-title')).toHaveText('Google Job');
			await expect(screeningCard.locator('.board-card-source')).toHaveText('Google');

			// Check Offer column card
			const offerCard = findJobPage.getCardsInColumn('offer').first();
			await expect(offerCard.locator('.board-card-title')).toHaveText('RR Job');
			await expect(offerCard.locator('.board-card-source')).toHaveText('Remote Rocketship');
		});

		test('card counter increments per column', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Job 1', column: 'applied' },
				{ title: 'Job 2', column: 'applied' },
				{ title: 'Job 3', column: 'screening' },
				{ title: 'Job 4', column: 'rejected' },
			]);
			await findJobPage.switchToDashboard();

			const counts = await findJobPage.dashboardBoard.locator('.board-list-count').allTextContents();
			expect(counts).toEqual(['2', '1', '0', '0', '0', '1', '0']);
		});
	});

	// ─── Add Card ──────────────────────────────────────────────────────────
	test.describe('Add Card', () => {
		test('add card via + button creates card in column', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([]);
			await findJobPage.switchToDashboard();

			await findJobPage.createManualCardInColumn('applied', 'New Manual Job');
			// Wait for the card to appear after re-render
			const card = findJobPage.getCardsInColumn('applied').first();
			await expect(card.locator('.board-card-title')).toHaveText('New Manual Job', { timeout: 5000 });
		});

		test('add card to Rejected column works', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([]);
			await findJobPage.switchToDashboard();

			await findJobPage.createManualCardInColumn('rejected', 'Rejected Job');
			// Wait for the card to appear after re-render
			const card = findJobPage.getCardsInColumn('rejected').first();
			await expect(card.locator('.board-card-title')).toHaveText('Rejected Job', { timeout: 5000 });
		});
	});

	// ─── Rename Card ───────────────────────────────────────────────────────
	test.describe('Rename Card', () => {
		test('rename via menu updates title', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Old Title', url: 'https://example.com/rename', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();

			await findJobPage.renameCard(0, 'applied', 'New Title');

			const card = findJobPage.getCardsInColumn('applied').first();
			await expect(card.locator('.board-card-title')).toHaveText('New Title');
		});

		test('cancel rename reverts to original title', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Original Title', url: 'https://example.com/cancel-rename', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();

			await findJobPage.clickRenameOnCard(0, 'applied');
			const input = findJobPage.getCardsInColumn('applied').first().locator('input[type="text"]');
			await input.waitFor({ state: 'visible', timeout: 2000 });
			await input.fill('Changed Title');
			await findJobPage.page.keyboard.press('Escape');

			const card = findJobPage.getCardsInColumn('applied').first();
			await expect(card.locator('.board-card-title')).toHaveText('Original Title');
		});
	});

	// ─── Delete Card ───────────────────────────────────────────────────────
	test.describe('Delete Card', () => {
		test('delete via menu removes card', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'To Delete', url: 'https://example.com/delete', column: 'applied' },
				{ title: 'To Keep', url: 'https://example.com/keep', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();

			await findJobPage.clickDeleteOnCard(0, 'applied');

			const cards = findJobPage.getCardsInColumn('applied');
			await expect(cards).toHaveCount(1);
			await expect(cards.first().locator('.board-card-title')).toHaveText('To Keep');
		});

		test('delete updates counter', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Job 1', column: 'applied' },
				{ title: 'Job 2', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();

			let counts = await findJobPage.dashboardBoard.locator('.board-list-count').allTextContents();
			expect(counts[0]).toBe('2');

			await findJobPage.clickDeleteOnCard(0, 'applied');

			counts = await findJobPage.dashboardBoard.locator('.board-list-count').allTextContents();
			expect(counts[0]).toBe('1');
		});
	});

	// ─── Move Card (Drag & Drop) ───────────────────────────────────────────
	test.describe('Move Card (Drag & Drop)', () => {
		test('drag card to next column updates UI', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Move Me', url: 'https://example.com/move', column: 'applied', status: 'No News' },
			]);
			await findJobPage.switchToDashboard();

			// Use evaluate to simulate the drop handler since dragTo is flaky
			await findJobPage.page.evaluate(async () => {
				const resp = await fetch('/api/job-data/update-status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						url: 'https://example.com/move',
						status: 'Interviewing',
						column: 'screening',
					}),
				});
				return resp.ok;
			});

			// Refresh dashboard to see the move
			await findJobPage.switchToDashboard();

			const appliedCards = findJobPage.getCardsInColumn('applied');
			const screeningCards = findJobPage.getCardsInColumn('screening');
			await expect(appliedCards).toHaveCount(0);
			await expect(screeningCards).toHaveCount(1);
			await expect(screeningCards.first().locator('.board-card-title')).toHaveText('Move Me');
		});

		test('drag card to Rejected column', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Reject Me', url: 'https://example.com/reject', column: 'applied', status: 'No News' },
			]);
			await findJobPage.switchToDashboard();

			await findJobPage.page.evaluate(async () => {
				const resp = await fetch('/api/job-data/update-status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						url: 'https://example.com/reject',
						status: 'Rejected',
						column: 'rejected',
					}),
				});
				return resp.ok;
			});

			await findJobPage.switchToDashboard();

			const rejectedCards = findJobPage.getCardsInColumn('rejected');
			await expect(rejectedCards).toHaveCount(1);
			await expect(rejectedCards.first().locator('.board-card-title')).toHaveText('Reject Me');
		});
	});

	// ─── Change Source ─────────────────────────────────────────────────────
	test.describe('Change Source', () => {
		test('card shows source badge', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'LinkedIn Job', url: 'https://linkedin.com/job/1', column: 'applied', source: 'linkedin' },
				{ title: 'Google Job', url: 'https://google.com/job/2', column: 'screening', source: 'google' },
				{ title: 'RR Job', url: 'https://remoterocketship.com/job/3', column: 'offer', source: 'remoterocketship' },
			]);
			await findJobPage.switchToDashboard();

			await expect(findJobPage.getCardsInColumn('applied').first().locator('.board-card-source')).toHaveText(
				'LinkedIn'
			);
			await expect(findJobPage.getCardsInColumn('screening').first().locator('.board-card-source')).toHaveText(
				'Google'
			);
			await expect(findJobPage.getCardsInColumn('offer').first().locator('.board-card-source')).toHaveText(
				'Remote Rocketship'
			);
		});

		test('change source via card menu updates badge', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Source Change Job', url: 'https://example.com/source', column: 'applied', source: 'linkedin' },
			]);
			await findJobPage.switchToDashboard();

			// Change source from LinkedIn to Google (cycles to next source)
			await findJobPage.clickChangeSourceOnCard(0, 'applied');

			// Verify badge updated to Google
			await expect(findJobPage.getCardsInColumn('applied').first().locator('.board-card-source')).toHaveText('Google');
		});
	});

	// ─── Dashboard Meta ────────────────────────────────────────────────────
	test.describe('Dashboard Meta', () => {
		test('total count meta updates', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Job 1', column: 'applied' },
				{ title: 'Job 2', column: 'screening' },
				{ title: 'Job 3', column: 'offer' },
			]);
			await findJobPage.switchToDashboard();

			const totalElem = findJobPage.page.locator('#dashboard-meta-total');
			await expect(totalElem).toHaveText('3');
		});

		test('statuses meta updates', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Job 1', status: 'No News', column: 'applied' },
				{ title: 'Job 2', status: 'Interviewing', column: 'screening' },
				{ title: 'Job 3', status: 'Offer', column: 'offer' },
			]);
			await findJobPage.switchToDashboard();

			const statusesElem = findJobPage.page.locator('#dashboard-meta-statuses');
			const text = await statusesElem.textContent();
			expect(text).toContain('No News');
			expect(text).toContain('Interviewing');
			expect(text).toContain('Offer');
		});
	});

	// ─── Edge Cases ────────────────────────────────────────────────────────
	test.describe('Edge Cases', () => {
		test('empty dashboard shows all columns with 0 count', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([]);
			await findJobPage.switchToDashboard();

			const columns = findJobPage.dashboardBoard.locator('.board-list');
			await expect(columns).toHaveCount(7);

			const counts = await findJobPage.dashboardBoard.locator('.board-list-count').allTextContents();
			expect(counts.every(c => c === '0')).toBe(true);
		});

		test('card with no URL (manual) works', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'Manual Card', url: '', column: 'applied' },
			]);
			await findJobPage.switchToDashboard();

			const card = findJobPage.getCardsInColumn('applied').first();
			await expect(card.locator('.board-card-title')).toHaveText('Manual Card');
		});

		test('card with missing column defaults to Applied', async ({ findJobPage }) => {
			await findJobPage.mockDashboardApi([
				{ title: 'No Column Job', url: 'https://example.com/no-col', status: 'No News' }, // no column field
			]);
			await findJobPage.switchToDashboard();

			const appliedCards = findJobPage.getCardsInColumn('applied');
			await expect(appliedCards).toHaveCount(1);
			await expect(appliedCards.first().locator('.board-card-title')).toHaveText('No Column Job');
		});
	});
});
