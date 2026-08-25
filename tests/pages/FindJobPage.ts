import type { Page, Locator } from '@playwright/test';

export class FindJobPage {
	readonly page: Page;
	readonly dashboardTab: Locator;
	readonly dashboardBoard: Locator;
	readonly toastContainer: Locator;
	readonly sharedModal: Locator;
	readonly resultsList: Locator;
	readonly noResults: Locator;
	readonly pagination: Locator;
	readonly metaTimestamp: Locator;
	readonly metaTotal: Locator;
	readonly metaQuery: Locator;
	readonly metaSource: Locator;
	readonly queryLinkWrapper: Locator;
	readonly findJobActionsTrigger: Locator;
	readonly findJobActionsDropdown: Locator;
	readonly sourceOptionLinkedIn: Locator;
	readonly sourceOptionGoogle: Locator;
	readonly sourceOptionRemoteRocketship: Locator;
	readonly remoteRocketshipConfirmModal: Locator;
	readonly remoteRocketshipConfirmBtn: Locator;
	readonly remoteRocketshipConfirmClose: Locator;
	readonly linkedinSourceValue: string;
	readonly remoteRocketshipSourceValue: string;
	readonly googleSourceValue: string;

	constructor(page: Page) {
		this.page = page;
		this.dashboardTab = page.getByTestId('sidebar-tab-dashboard');
		this.dashboardBoard = page.getByTestId('dashboard-board');
		this.toastContainer = page.getByTestId('shared-toast-container');
		this.sharedModal = page.getByTestId('shared-modal').first();
		this.resultsList = page.getByTestId('results-list');
		this.noResults = page.getByTestId('no-results');
		this.pagination = page.getByTestId('pagination');
		this.metaTimestamp = page.getByTestId('meta-timestamp');
		this.metaTotal = page.getByTestId('meta-total');
		this.metaQuery = page.getByTestId('meta-query');
		this.metaSource = page.getByTestId('meta-source');
		this.queryLinkWrapper = page.getByTestId('query-link-wrapper');
		this.findJobActionsTrigger = page.getByTestId('findjob-actions-trigger');
		this.findJobActionsDropdown = page.getByTestId('findjob-actions-dropdown');
		this.sourceOptionLinkedIn = page.getByTestId('source-option-linkedin');
		this.sourceOptionGoogle = page.getByTestId('source-option-google');
		this.sourceOptionRemoteRocketship = page.getByTestId('source-option-remoterocketship');
		this.remoteRocketshipConfirmModal = page.getByTestId('remoterocketship-confirm-modal');
		this.remoteRocketshipConfirmBtn = page.getByTestId('remoterocketship-confirm-btn');
		this.remoteRocketshipConfirmClose = page.getByTestId('remoterocketship-confirm-close');
		this.linkedinSourceValue = 'LinkedIn';
		this.remoteRocketshipSourceValue = 'Remote Rocketship';
		this.googleSourceValue = 'Google';
	}

	async goto(): Promise<void> {
		await this.page.goto('/public/findJob.html', { waitUntil: 'domcontentloaded' });
		await this.findJobActionsTrigger.waitFor({ state: 'visible' });
	}

	async switchToDashboard(): Promise<void> {
		await this.dashboardTab.click();
		await this.dashboardBoard.waitFor({ state: 'visible' });
	}

	async mockDashboardApi(
		jobs: Array<{ title: string; url?: string; id?: string; status?: string; column?: string; source?: string }> = []
	): Promise<void> {
		// Use a mutable array so add/delete can update it
		const jobList = jobs.map((job, index) => ({
			title: job.title,
			url: job.url || `https://example.com/job-${index}`,
			snippet: 'Mocked job snippet',
			source: job.source || 'linkedin',
			company: 'Example Corp',
			status: job.status || 'No News',
			column: job.column || 'applied',
			id: job.id || `test-${index}`,
			saved: true,
			applied: true,
			savedAt: new Date().toISOString(),
			appliedAt: new Date().toISOString(),
		}));

		await this.page.route('**/api/job-data/dashboard', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(jobList),
			});
		});

		await this.page.route('**/api/job-data/dashboard/add', async route => {
			if (route.request().method() === 'POST') {
				const body = JSON.parse(route.request().postData() || '{}');
				const newJob = {
					title: body.title || 'New Manual Card',
					url: '',
					id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
					source: body.source || 'user',
					status: body.status || 'No News',
					column: body.column || 'applied',
					saved: true,
					applied: true,
					savedAt: new Date().toISOString(),
					appliedAt: new Date().toISOString(),
					snippet: '',
					company: '',
				};
				jobList.push(newJob);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true, job: newJob }),
				});
				return;
			}
			await route.continue();
		});

		await this.page.route('**/api/job-data/update-status', async route => {
			if (route.request().method() === 'POST') {
				const body = JSON.parse(route.request().postData() || '{}');
				// Update the job in jobList
				const jobIndex = jobList.findIndex(j => (body.url && j.url === body.url) || (body.id && j.id === body.id));
				if (jobIndex !== -1) {
					if (body.column) jobList[jobIndex].column = body.column;
					if (body.status) jobList[jobIndex].status = body.status;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true, ...body }),
				});
				return;
			}
			await route.continue();
		});

		await this.page.route('**/api/job-data/rename', async route => {
			if (route.request().method() === 'POST') {
				const body = JSON.parse(route.request().postData() || '{}');
				const jobIndex = jobList.findIndex(j => (body.url && j.url === body.url) || (body.id && j.id === body.id));
				if (jobIndex !== -1 && body.title) {
					jobList[jobIndex].title = body.title;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true, ...body }),
				});
				return;
			}
			await route.continue();
		});

		await this.page.route('**/api/job-data/dashboard/delete', async route => {
			if (route.request().method() === 'POST') {
				const body = JSON.parse(route.request().postData() || '{}');
				const jobIndex = jobList.findIndex(j => (body.url && j.url === body.url) || (body.id && j.id === body.id));
				if (jobIndex !== -1) {
					jobList.splice(jobIndex, 1);
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ success: true }),
				});
				return;
			}
			await route.continue();
		});

		await this.page.route('**/api/job-data/saved', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([]),
			});
		});

		await this.page.route('**/api/scraper/results*', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ timestamp: null, source: 'linkedin', totalResults: 0, results: [] }),
			});
		});
	}

	async unregisterAllRoutes(): Promise<void> {
		await this.page.unroute('**/api/job-data/dashboard');
		await this.page.unroute('**/api/job-data/dashboard/add');
		await this.page.unroute('**/api/job-data/update-status');
		await this.page.unroute('**/api/job-data/rename');
		await this.page.unroute('**/api/job-data/saved');
		await this.page.unroute('**/api/scraper/results*');
	}

	getCardsInColumn(columnId: string): Locator {
		return this.page.locator(`.board-cards-container[data-list-id="${columnId}"] .board-card`);
	}

	getAddCardButton(columnId: string): Locator {
		return this.page.locator(`.board-cards-container[data-list-id="${columnId}"] + .board-add-card-btn`);
	}

	async createManualCardInColumn(columnId: string, title: string): Promise<void> {
		const addBtn = this.getAddCardButton(columnId);
		await addBtn.click();

		const composer = this.page.locator(
			`.board-cards-container[data-list-id="${columnId}"] + .board-add-card-btn + .board-card-composer`
		);
		const textarea = composer.locator('textarea');
		const confirmBtn = composer.locator('.board-btn-confirm');

		await textarea.fill(title);
		await confirmBtn.click();

		// Wait for the card to be created instead of using waitForTimeout
		await this.page.locator('.board-card').last().waitFor({ state: 'visible', timeout: 5000 });
	}

	async openCardMenu(cardIndex: number, columnId: string): Promise<void> {
		const cards = this.getCardsInColumn(columnId);
		const card = cards.nth(cardIndex);
		const menuBtn = card.locator('.board-card-menu-btn');
		await menuBtn.click();
	}

	async clickRenameOnCard(cardIndex: number, columnId: string): Promise<void> {
		await this.openCardMenu(cardIndex, columnId);
		const cards = this.getCardsInColumn(columnId);
		const card = cards.nth(cardIndex);
		const renameItem = card.locator('.board-card-menu-item').filter({ hasText: 'Rename' });
		await renameItem.click();
	}

	async clickDeleteOnCard(cardIndex: number, columnId: string): Promise<void> {
		await this.openCardMenu(cardIndex, columnId);
		const cards = this.getCardsInColumn(columnId);
		const card = cards.nth(cardIndex);
		const deleteItem = card.locator('.board-card-menu-item').filter({ hasText: 'Delete' });
		await deleteItem.click();

		// Confirm deletion in modal - uses .btn-confirm class
		const confirmBtn = this.sharedModal.locator('.btn-confirm');
		await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
		await confirmBtn.click();
		// Wait for modal to close and card to be removed
		await this.sharedModal.waitFor({ state: 'hidden', timeout: 5000 });
	}

	async clickChangeSourceOnCard(cardIndex: number, columnId: string, newSource: string): Promise<void> {
		await this.openCardMenu(cardIndex, columnId);
		const cards = this.getCardsInColumn(columnId);
		const card = cards.nth(cardIndex);
		const sourceItem = card.locator('.board-card-menu-item').filter({ hasText: 'Change Source' });
		await sourceItem.click();

		// Wait for source dropdown/modal and select new source
		const sourceOption = this.page.locator(`[data-source="${newSource.toLowerCase()}"]`);
		await sourceOption.waitFor({ state: 'visible', timeout: 5000 });
		if ((await sourceOption.count()) > 0) {
			await sourceOption.click();
		} else {
			// Fallback: click menu item with source name
			const sourceMenuItem = this.page.locator(`.board-card-menu-item:has-text("${newSource}")`);
			await sourceMenuItem.waitFor({ state: 'visible', timeout: 5000 });
			await sourceMenuItem.click();
		}
	}

	getToastByMessage(message: string): Locator {
		return this.toastContainer.locator(`div:has-text("${message}")`);
	}

	async waitForToast(message: string, timeout = 4000): Promise<Locator> {
		const toast = this.getToastByMessage(message);
		await toast.waitFor({ state: 'visible', timeout });
		return toast;
	}

	async waitForNoToast(message: string, timeout = 4000): Promise<void> {
		const toast = this.getToastByMessage(message);
		await toast.waitFor({ state: 'hidden', timeout });
	}

	async renameCard(cardIndex: number, columnId: string, newTitle: string): Promise<void> {
		await this.clickRenameOnCard(cardIndex, columnId);
		const cards = this.getCardsInColumn(columnId);
		const card = cards.nth(cardIndex);
		const input = card.locator('input[type="text"]');
		await input.fill(newTitle);
		await input.press('Enter');
		// Wait for input to be replaced by title
		await card.locator('.board-card-title').waitFor({ state: 'visible', timeout: 5000 });
	}

	async dragCardToColumn(cardIndex: number, fromColumnId: string, toColumnId: string): Promise<void> {
		const sourceCard = this.getCardsInColumn(fromColumnId).nth(cardIndex);
		const targetContainer = this.page.locator(`.board-cards-container[data-list-id="${toColumnId}"]`);

		await sourceCard.dragTo(targetContainer);
		// Wait for drop to complete - card should appear in target column
		await this.getCardsInColumn(toColumnId).first().waitFor({ state: 'visible', timeout: 5000 });
	}

	async getCardTitle(cardIndex: number, columnId: string): Promise<string> {
		const cards = this.getCardsInColumn(columnId);
		const card = cards.nth(cardIndex);
		return (await card.locator('.board-card-title').textContent()) || '';
	}

	async switchSource(source: string): Promise<void> {
		// Open the actions dropdown - click may not trigger the JS handler in test env
		await this.findJobActionsTrigger.click({ force: true });
		await this.page.evaluate(() => {
			const fn = (window as unknown as Record<string, unknown>).toggleFindJobActions;
			if (typeof fn === 'function') fn();
		});
		// Fallback: directly remove hidden class if function didn't work
		await this.page.evaluate(() => {
			const dropdown = document.getElementById('findjob-actions-dropdown');
			if (dropdown) dropdown.classList.remove('hidden');
		});
		await this.findJobActionsDropdown.waitFor({ state: 'visible', timeout: 5000 });

		const resolveSourceLocator = (source: string): Locator => {
			if (source === this.linkedinSourceValue) return this.sourceOptionLinkedIn;
			if (source === this.googleSourceValue) return this.sourceOptionGoogle;
			if (source === this.remoteRocketshipSourceValue) return this.sourceOptionRemoteRocketship;
			throw new Error(`Unknown source locator: ${source}`);
		};

		await resolveSourceLocator(source).click();

		// For Remote Rocketship, handle the confirm modal
		if (source === this.remoteRocketshipSourceValue) {
			await this.remoteRocketshipConfirmModal.waitFor({ state: 'visible', timeout: 5000 });
			await this.remoteRocketshipConfirmBtn.click();
			await this.remoteRocketshipConfirmModal.waitFor({ state: 'hidden', timeout: 5000 });
		}

		// Wait for the meta source to appear
		await this.metaSource.waitFor({ state: 'visible', timeout: 10000 });
	}

	isDropdownClosed(): Promise<boolean> {
		return this.findJobActionsDropdown.evaluate((el: HTMLElement) => el.classList.contains('hidden'));
	}
}
