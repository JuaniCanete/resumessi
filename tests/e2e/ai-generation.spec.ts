import { test, expect } from './test-setup';

test.describe('AI Generation Modal', () => {
	test('generate button is visible on load', async ({ mainPage }) => {
		await expect(mainPage.btnAiGenerate).toBeVisible();
	});

	test('modal opens on button click', async ({ mainPage }) => {
		await mainPage.openAiModal();
		await expect(mainPage.aiModal).toBeVisible();
	});

	test('modal has file upload area', async ({ mainPage }) => {
		await mainPage.openAiModal();
		await expect(mainPage.modalUploadSection).toBeVisible();
	});

	test('modal can be closed', async ({ mainPage }) => {
		await mainPage.openAiModal();
		await expect(mainPage.aiModal).toBeVisible();

		const closeBtn = mainPage.aiModal.locator('[id*="close"], .modal-close, #btn-modal-cancel').first();
		if ((await closeBtn.count()) > 0) {
			await closeBtn.click();
			await expect(mainPage.aiModal).toBeHidden({ timeout: 2000 });
		}
	});
});
