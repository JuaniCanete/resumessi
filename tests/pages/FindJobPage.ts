import type { Page, Locator } from '@playwright/test';

export class FindJobPage {
  readonly page: Page;
  readonly dashboardTab: Locator;
  readonly dashboardBoard: Locator;
  readonly toastContainer: Locator;
  readonly sharedModal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dashboardTab = page.locator('.sidebar-tab[data-tab="dashboard"]');
    this.dashboardBoard = page.locator('#dashboard-board');
    this.toastContainer = page.locator('#shared-toast-container');
    this.sharedModal = page.locator('#shared-modal-container .shared-modal');
  }

  async goto(): Promise<void> {
    await this.page.goto('/public/findJob.html', { waitUntil: 'domcontentloaded' });
  }

  async switchToDashboard(): Promise<void> {
    await this.dashboardTab.click();
    await this.dashboardBoard.waitFor({ state: 'visible' });
  }

  async mockDashboardApi(jobs: Array<{ title: string; url?: string; id?: string; status?: string; column?: string }> = []): Promise<void> {
    await this.page.route('**/api/job-data/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(jobs.map((job, index) => ({
          title: job.title,
          url: job.url || `https://example.com/job-${index}`,
          snippet: 'Mocked job snippet',
          source: 'linkedin',
          company: 'Example Corp',
          status: job.status || 'No News',
          column: job.column || 'applied',
          id: job.id || `test-${index}`,
          saved: true,
          applied: true,
          savedAt: new Date().toISOString(),
          appliedAt: new Date().toISOString(),
        }))),
      });
    });

    await this.page.route('**/api/job-data/dashboard/add', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            job: {
              title: body.title || 'New Manual Card',
              url: '',
              id: 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
              source: 'linkedin',
              status: 'No News',
              column: body.column || 'applied',
              saved: true,
              applied: true,
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await this.page.route('**/api/job-data/update-status', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, ...body }),
        });
        return;
      }
      await route.continue();
    });

    await this.page.route('**/api/job-data/rename', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, ...body }),
        });
        return;
      }
      await route.continue();
    });

    await this.page.route('**/api/job-data/saved', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await this.page.route('**/api/scraper/results*', async (route) => {
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

    const composer = this.page.locator(`.board-cards-container[data-list-id="${columnId}"] + .board-add-card-btn + .board-card-composer`);
    const textarea = composer.locator('textarea');
    const confirmBtn = composer.locator('.board-btn-confirm');

    await textarea.fill(title);
    await confirmBtn.click();

    await this.page.waitForTimeout(300);
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
  }

  async dragCardToColumn(cardIndex: number, fromColumnId: string, toColumnId: string): Promise<void> {
    const sourceCard = this.getCardsInColumn(fromColumnId).nth(cardIndex);
    const targetContainer = this.page.locator(`.board-cards-container[data-list-id="${toColumnId}"]`);

    await sourceCard.dragTo(targetContainer);
    await this.page.waitForTimeout(300);
  }

  async getCardTitle(cardIndex: number, columnId: string): Promise<string> {
    const cards = this.getCardsInColumn(columnId);
    const card = cards.nth(cardIndex);
    return (await card.locator('.board-card-title').textContent()) || '';
  }
}
