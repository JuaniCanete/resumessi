import { test, expect } from './test-setup';

test.describe(() => {
	test('generate button is visible on load', async ({ mainPage }) => {
		await expect(mainPage.btnAiGenerate).toBeVisible();
	});

	test('should open AI modal on click with upload area', async ({ mainPage }) => {
		await mainPage.openResumeGenerationModal();
		await expect(mainPage.resumeGenerationAiModal).toBeVisible();
		await expect(mainPage.modalUploadSection).toBeVisible();
	});

	test('modal can be closed', async ({ mainPage }) => {
		await mainPage.openResumeGenerationModal();
		await expect(mainPage.resumeGenerationAiModal).toBeVisible();

		const closeBtn = mainPage.resumeGenerationAiModal.locator('[id*="close"], .modal-close, #btn-modal-cancel').first();
		if ((await closeBtn.count()) > 0) {
			await closeBtn.click();
			await expect(mainPage.resumeGenerationAiModal).toBeHidden({ timeout: 2000 });
		}
	});
});
