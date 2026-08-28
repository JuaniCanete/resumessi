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
	readonly rpPoweredBy: Locator;
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
	readonly resumeGenerationAiModal: Locator;
	readonly modalUploadSection: Locator;
	readonly resumeName: Locator;
	readonly body: Locator;
	readonly leftSidebar: Locator;
	readonly leftOpenStub: Locator;
	readonly collapseSidebarBtn: Locator;
	readonly btnRefreshResume: Locator;
	readonly linkedInLink: Locator;
	readonly githubLink: Locator;
	readonly certLink: Locator;
	readonly talkLink: Locator;
	readonly toastContainer: Locator;
	readonly modalContainer: Locator;

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
		this.rpPoweredBy = page.getByTestId('rp-poweredBy');
		this.polishButton = page.getByTestId('polish-button');
		this.rollbackButton = page.getByTestId('rollback-button');
		this.photoUploadTrigger = page.getByTestId('photo-upload-trigger');
		this.providersButton = page.getByTestId('providers-button');
		this.providersModal = page.getByTestId('providers-modal');
		this.providersList = page.getByTestId('providers-list');
		this.providersConfirmBtn = page.getByTestId('providers-confirm-btn');
		this.providersCancelBtn = page.getByTestId('providers-cancel-btn');
		this.actionsTrigger = page.getByTestId('actions-trigger');
		this.actionsDropdown = page.getByTestId('actions-dropdown');
		this.polishOverlay = page.getByTestId('polish-overlay');
		this.refreshMessage = page.getByTestId('refresh-message');
		this.photoUploadModal = page.getByTestId('photo-upload-modal');
		this.photoInput = page.getByTestId('photo-input');
		this.photoUploadConfirm = page.getByTestId('photo-upload-confirm');
		this.resumeContent = page.getByTestId('resume-content');
		this.profilePhoto = page.getByTestId('profile-photo');
		this.resumeGenerationAiModal = page.getByTestId('resume-using-ai-modal');
		this.modalUploadSection = page.getByTestId('resume-using-ai-modal').locator('[data-testid="modal-upload-section"]');
		this.resumeName = page.getByTestId('resume-name');
		this.body = page.locator('body');
		this.leftSidebar = page.getByTestId('left-sidebar');
		this.leftOpenStub = page.getByTestId('left-open-stub');
		this.collapseSidebarBtn = page.getByTestId('collapse-sidebar-btn');
		this.btnRefreshResume = page.getByTestId('btn-refresh-resume');
		this.linkedInLink = page.getByTestId('resume-content').locator('a[data-testid="linkedin-link"]');
		this.githubLink = page.getByTestId('resume-content').locator('a[data-testid="github-link"]');
		this.certLink = page.getByTestId('resume-content').locator('a[data-testid="cert-link"]');
		this.talkLink = page.getByTestId('resume-content').locator('a[data-testid="talk-link"]');
		this.toastContainer = page.getByTestId('shared-toast-container');
		this.modalContainer = page.getByTestId('shared-modal-container');
	}

	async goto(): Promise<void> {
		await this.page.goto('/main.html', { waitUntil: 'domcontentloaded' });
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

	async openResumeGenerationModal(): Promise<void> {
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

	isSidebarCollapsed(): Promise<boolean> {
		return this.body.evaluate((el: HTMLElement) => el.classList.contains('left-collapsed'));
	}

	getScore(): Promise<string | null> {
		return this.rpScoreCircle.textContent();
	}

	getScoreText(): Promise<string | null> {
		return this.rpScoreText.textContent();
	}

	getFeedback(): Promise<string | null> {
		return this.rpFeedback.textContent();
	}

	getPoweredBy(): Promise<string | null> {
		return this.rpPoweredBy.textContent();
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
		// Wait for modal to close (processing completes)
		await this.photoUploadModal.waitFor({ state: 'hidden', timeout: 10000 });
	}

	// ─── Refresh Message ────────────────────────────────────────────

	async getRefreshMessageText(): Promise<string | null> {
		await this.refreshMessage.waitFor({ state: 'visible' });
		return this.refreshMessage.textContent();
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

	getProviderItems(): Promise<Locator[]> {
		return this.providersList.locator('.provider-item').all();
	}

	getSelectedProviderFromLocalStorage(): Promise<string> {
		return this.page.evaluate(() => localStorage.getItem('selected-ai-provider') || '');
	}

	async expectProvidersModalVisible(): Promise<void> {
		const isVisible = await this.providersModal.isVisible();
		if (!isVisible) throw new Error('Providers modal is not visible');
	}

	// ─── Link Getters ───────────────────────────────────────────────────

	getLinkedInLink(): Locator {
		return this.linkedInLink;
	}

	getGitHubLink(): Locator {
		return this.githubLink;
	}

	getCertLink(): Locator {
		return this.certLink;
	}

	getTalkLink(): Locator {
		return this.talkLink;
	}

	// ─── Toast & Modal ──────────────────────────────────────────────────

	getToastElement(): Locator {
		return this.toastContainer.locator('[data-testid="toast"]').first();
	}

	getModalElement(): Locator {
		return this.modalContainer.locator('[data-testid="shared-modal"]').first();
	}

	// ─── AI Modal ───────────────────────────────────────────────────────

	async closeResumeGenerationModal(): Promise<void> {
		await this.resumeGenerationAiModal.evaluate((el: HTMLElement) => {
			el.style.display = 'none';
		});
	}

	// ─── Providers Modal Helpers ────────────────────────────────────────

	isProviderChecked(name: string): Promise<boolean> {
		const providerItem = this.providersList.locator(`.provider-item[data-provider="${name.toLowerCase()}"]`);
		const checkbox = providerItem.locator('.provider-checkbox');
		return checkbox.isChecked();
	}

	async checkProvider(name: string): Promise<void> {
		const providerItem = this.providersList.locator(`.provider-item[data-provider="${name.toLowerCase()}"]`);
		await providerItem.click();
	}
}
