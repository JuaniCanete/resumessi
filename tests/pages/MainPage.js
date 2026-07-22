class MainPage {
  constructor(page) {
    this.page = page;
    this.jobDescriptionTextarea = page.getByTestId('job-description');
    this.btnRunScan = page.getByTestId('btn-run-scan');
    this.btnAiGenerate = page.getByTestId('btn-ai-generate');
    this.btnDownload = page.getByTestId('btn-download');
    this.rightPanel = page.getByTestId('right-panel');
    this.rpScoreCircle = page.getByTestId('rp-score-circle');
    this.rpScoreText = page.getByTestId('rp-score-text');
    this.rpFeedback = page.getByTestId('rp-feedback');

    // Modern testid-based locators
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
  }

  async goto() {
    await this.page.goto('/public/main.html', { waitUntil: 'domcontentloaded' });
  }

  async waitForResumeLoaded() {
    await this.resumeContent.waitFor({ state: 'visible' });
  }

  async enterJobDescription(text) {
    await this.jobDescriptionTextarea.fill(text);
  }

  async clickScan() {
    await this.btnRunScan.click();
  }

  async openAiModal() {
    await this.btnAiGenerate.click({ force: true });
  }

  async downloadResume() {
    await this.btnDownload.click();
  }

  async openResultsPanel() {
    await this.page.getByText('ATS Results').click();
  }

  async collapseSidebar() {
    await this.collapseSidebarBtn.click();
  }

  async openSidebar() {
    await this.leftOpenStub.click();
  }

  async isSidebarCollapsed() {
    return this.body.evaluate((el) => el.classList.contains('left-collapsed'));
  }

  async getScore() {
    return await this.rpScoreCircle.textContent();
  }

  async getScoreText() {
    return await this.rpScoreText.textContent();
  }

  async getFeedback() {
    return await this.rpFeedback.textContent();
  }

  // ─── Actions Dropdown ───────────────────────────────────────────

  async openActions() {
    // Toggle to open if not already open
    const isHidden = await this.actionsDropdown.getAttribute('class');
    if (isHidden && isHidden.includes('hidden')) {
      // Use force:true because the actions trigger may have an infinite CSS animation
      // (bump) that causes Playwright to consider it "not stable" for click
      await this.actionsTrigger.click({ force: true });
    }
    await this.actionsDropdown.waitFor({ state: 'visible' });
  }

  async closeActions() {
    const isHidden = await this.actionsDropdown.getAttribute('class');
    if (!isHidden || !isHidden.includes('hidden')) {
      await this.actionsTrigger.click();
    }
  }

  // ─── Polish Flow ─────────────────────────────────────────────────

  async clickPolish() {
    await this.openActions();
    await this.polishButton.waitFor({ state: 'visible' });
    await this.polishButton.click();
  }

  async waitForPolishOverlay() {
    await this.polishOverlay.waitFor({ state: 'visible' });
  }

  // ─── Rollback Flow ───────────────────────────────────────────────

  async clickRollback() {
    await this.openActions();
    await this.rollbackButton.waitFor({ state: 'visible' });
    await this.rollbackButton.click();
  }

  // ─── Photo Upload Flow ──────────────────────────────────────────

  async openPhotoModal() {
    await this.openActions();
    await this.photoUploadTrigger.waitFor({ state: 'visible' });
    await this.photoUploadTrigger.click();
    await this.photoUploadModal.waitFor({ state: 'visible' });
  }

  async uploadPhoto(filePath) {
    await this.photoUploadModal.waitFor({ state: 'visible' });
    await this.photoInput.setInputFiles(filePath);
  }

  async confirmPhotoUpload() {
    await this.photoUploadConfirm.waitFor({ state: 'visible' });
    await this.photoUploadConfirm.click();
  }

  // ─── Refresh Message ────────────────────────────────────────────

  async getRefreshMessageText() {
    await this.refreshMessage.waitFor({ state: 'visible' });
    return await this.refreshMessage.textContent();
  }

  // ─── AI Providers Modal ─────────────────────────────────────────

  async openProvidersModal() {
    await this.openActions();
    await this.providersButton.waitFor({ state: 'visible' });
    await this.providersButton.click();
    await this.providersModal.waitFor({ state: 'visible' });
  }

  async closeProvidersModal() {
    await this.providersModal.evaluate((el) => {
      el.style.display = 'none';
    });
  }

  async selectProvider(name) {
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

  async confirmProvidersSelection() {
    await this.providersConfirmBtn.click();
  }

  async cancelProvidersSelection() {
    await this.providersCancelBtn.click();
  }

  async getProviderItems() {
    return await this.providersList.locator('.provider-item').all();
  }

  async getSelectedProviderFromLocalStorage() {
    return await this.page.evaluate(() => localStorage.getItem('selected-ai-provider') || '');
  }

  async expectProvidersModalVisible() {
    const isVisible = await this.providersModal.isVisible();
    if (!isVisible) throw new Error('Providers modal is not visible');
  }
}

module.exports = { MainPage };