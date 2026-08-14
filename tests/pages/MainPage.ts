import type { Page, Locator } from '@playwright/test';

export class MainPage {
  readonly page: Page;
  readonly jobDescriptionTextarea: Locator;
  readonly btnRunScan: Locator;
  readonly btnAiGenerate: Locator;
  readonly btnDownload: Locator;
  readonly rightPanel: Locator;
  readonly rpScoreCircle: Locator;
  readonly rpScoreText: Locator;
  readonly rpFeedback: Locator;
  readonly polishButton: Locator;
  readonly rollbackButton: Locator;
  readonly photoUploadTrigger: Locator;
  readonly providersButton: Locator;
  readonly providersModal: Locator;
  readonly providersList: Locator;
  readonly providersConfirmBtn: Locator;
  readonly providersCancelBtn: Locator;
  readonly actionsTrigger: Locator;
  readonly actionsDropdown: Locator;
  readonly polishOverlay: Locator;
  readonly refreshMessage: Locator;
  readonly photoUploadModal: Locator;
  readonly photoInput: Locator;
  readonly photoUploadConfirm: Locator;
  readonly resumeContent: Locator;
  readonly profilePhoto: Locator;
  readonly aiModal: Locator;
  readonly modalUploadSection: Locator;
  readonly resumeName: Locator;
  readonly body: Locator;
  readonly leftSidebar: Locator;
  readonly leftOpenStub: Locator;
  readonly collapseSidebarBtn: Locator;
  readonly btnRefreshResume: Locator;

  constructor(page: Page) {
    this.page = page;
    this.jobDescriptionTextarea = page.getByTestId('job-description');
    this.btnRunScan = page.getByTestId('btn-run-scan');
    this.btnAiGenerate = page.getByTestId('btn-ai-generate');
    this.btnDownload = page.getByTestId('btn-download');
    this.rightPanel = page.getByTestId('right-panel');
    this.rpScoreCircle = page.getByTestId('rp-score-circle');
    this.rpScoreText = page.getByTestId('rp-score-text');
    this.rpFeedback = page.getByTestId('rp-feedback');
    this.polishButton = page.getByTestId('polish-button');
    this.rollbackButton = page.getByTestId('rollback-button');
    this.photoUploadTrigger = page.getByTestId('photo-upload-trigger');
    this.providersButton = page.getByTestId('providers-button');
    this.providersModal = page.getByTestId('providers-modal');
    this.providersList = page.locator('#providers-list');
    this.providersConfirmBtn = page.locator('#providers-modal-actions button.p-btn-primary');
    this.providersCancelBtn = page.locator('#providers-modal-actions button.p-btn-secondary');
    this.actionsTrigger = page.getByTestId('actions-trigger');
    this.actionsDropdown = page.getByTestId('actions-dropdown');
    this.polishOverlay = page.getByTestId('polish-overlay');
    this.refreshMessage = page.getByTestId('refresh-message');
    this.photoUploadModal = page.getByTestId('photo-upload-modal');
    this.photoInput = page.getByTestId('photo-input');
    this.photoUploadConfirm = page.getByTestId('photo-upload-confirm');
    this.resumeContent = page.getByTestId('resume-content');
    this.profilePhoto = page.locator('.profile-photo');
    this.aiModal = page.getByTestId('ai-modal');
    this.modalUploadSection = page.getByTestId('ai-modal').locator('#modal-upload-section');
    this.resumeName = page.locator('#resume-content h1');
    this.body = page.locator('body');
    this.leftSidebar = page.locator('#left-sidebar');
    this.leftOpenStub = page.locator('#left-open-stub');
    this.collapseSidebarBtn = page.locator('[aria-label="Collapse sidebar"]');
    this.btnRefreshResume = page.getByTestId('btn-refresh-resume');
  }

  async goto(): Promise<void> {
    await this.page.goto('/public/main.html', { waitUntil: 'domcontentloaded' });
  }

  async waitForResumeLoaded(): Promise<void> {
    await this.resumeContent.waitFor({ state: 'visible' });
  }

  async enterJobDescription(text: string): Promise<void> {
    await this.jobDescriptionTextarea.fill(text);
  }

  async clickScan(): Promise<void> {
    await this.btnRunScan.click();
  }

  async openAiModal(): Promise<void> {
    await this.btnAiGenerate.click({ force: true });
  }

  async downloadResume(): Promise<void> {
    await this.btnDownload.click();
  }

  async openResultsPanel(): Promise<void> {
    await this.page.getByText('ATS Results').click();
  }

  async collapseSidebar(): Promise<void> {
    await this.collapseSidebarBtn.click();
  }

  async openSidebar(): Promise<void> {
    await this.leftOpenStub.click();
  }

  async isSidebarCollapsed(): Promise<boolean> {
    return this.body.evaluate((el: HTMLElement) => el.classList.contains('left-collapsed'));
  }

  async getScore(): Promise<string | null> {
    return await this.rpScoreCircle.textContent();
  }

  async getScoreText(): Promise<string | null> {
    return await this.rpScoreText.textContent();
  }

  async getFeedback(): Promise<string | null> {
    return await this.rpFeedback.textContent();
  }

  // ─── Actions Dropdown ───────────────────────────────────────────

  async openActions(): Promise<void> {
    const classAttr = await this.actionsDropdown.getAttribute('class');
    const isHidden = classAttr && classAttr.includes('hidden');
    if (isHidden) {
      await this.actionsTrigger.click({ force: true });
    }
    await this.actionsDropdown.waitFor({ state: 'visible' });
  }

  async closeActions(): Promise<void> {
    const classAttr = await this.actionsDropdown.getAttribute('class');
    const isHidden = classAttr && classAttr.includes('hidden');
    if (!isHidden) {
      await this.actionsTrigger.click();
    }
  }

  // ─── Polish Flow ─────────────────────────────────────────────────

  async clickPolish(): Promise<void> {
    await this.openActions();
    await this.polishButton.waitFor({ state: 'visible' });
    await this.polishButton.click();
  }

  async waitForPolishOverlay(): Promise<void> {
    await this.polishOverlay.waitFor({ state: 'visible' });
  }

  // ─── Rollback Flow ───────────────────────────────────────────────

  async clickRollback(): Promise<void> {
    await this.openActions();
    await this.rollbackButton.waitFor({ state: 'visible' });
    await this.rollbackButton.click();
  }

  // ─── Photo Upload Flow ──────────────────────────────────────────

  async openPhotoModal(): Promise<void> {
    await this.openActions();
    await this.photoUploadTrigger.waitFor({ state: 'visible' });
    await this.photoUploadTrigger.click();
    await this.photoUploadModal.waitFor({ state: 'visible' });
  }

  async uploadPhoto(filePath: string): Promise<void> {
    await this.photoUploadModal.waitFor({ state: 'visible' });
    await this.photoInput.setInputFiles(filePath);
  }

  async confirmPhotoUpload(): Promise<void> {
    await this.photoUploadConfirm.waitFor({ state: 'visible' });
    await this.photoUploadConfirm.click();
  }

  // ─── Refresh Message ────────────────────────────────────────────

  async getRefreshMessageText(): Promise<string | null> {
    await this.refreshMessage.waitFor({ state: 'visible' });
    return await this.refreshMessage.textContent();
  }

  async clickRefresh(): Promise<void> {
    await this.btnRefreshResume.click({ force: true });
  }

  // ─── AI Providers Modal ─────────────────────────────────────────

  async openProvidersModal(): Promise<void> {
    await this.openActions();
    await this.providersButton.waitFor({ state: 'visible' });
    await this.providersButton.click();
    await this.providersModal.waitFor({ state: 'visible' });
  }

  async closeProvidersModal(): Promise<void> {
    await this.providersModal.evaluate((el: HTMLElement) => {
      el.style.display = 'none';
    });
  }

  async selectProvider(name: string): Promise<void> {
    const items = await this.providersList.locator('.provider-item').all();
    for (const item of items) {
      const text = await item.textContent();
      if (text && text.includes(name)) {
        await item.click();
        return;
      }
    }
    throw new Error(`Configured provider "${name}" not found in modal`);
  }

  async confirmProvidersSelection(): Promise<void> {
    await this.providersConfirmBtn.click();
  }

  async cancelProvidersSelection(): Promise<void> {
    await this.providersCancelBtn.click();
  }

  async getProviderItems(): Promise<Locator[]> {
    return await this.providersList.locator('.provider-item').all();
  }

  async getSelectedProviderFromLocalStorage(): Promise<string> {
    return await this.page.evaluate(() => localStorage.getItem('selected-ai-provider') || '');
  }

  async expectProvidersModalVisible(): Promise<void> {
    const isVisible = await this.providersModal.isVisible();
    if (!isVisible) throw new Error('Providers modal is not visible');
  }
}
