import path from 'path';
import { test, expect } from './test-setup';
import { jobDescriptionFixtures } from '../fixtures/resume-fixtures';

// Valid generated resume flag so polish/photo flows behave as "generated" data
const GENERATED_FLAG = JSON.stringify({
	basics: { name: 'Test User', email: 'test@example.com', photo: null },
	experience: [],
	education: [],
	skills: {},
});

// A small valid JPEG shipped with the project, used to drive the file input.
const SAMPLE_PHOTO = path.resolve(__dirname, '../../examples/photo.jpg');

test.describe('Advanced Flows', () => {
	test('photo upload — stores base64 in localStorage and updates resume display', async ({ mainPage }) => {
		await mainPage.page.evaluate((flag) => localStorage.setItem('resume-data', flag), GENERATED_FLAG);
		await mainPage.page.reload();
		await mainPage.waitForResumeLoaded();

		await mainPage.openPhotoModal();

		await mainPage.uploadPhoto(SAMPLE_PHOTO);

		await expect(mainPage.photoUploadConfirm).toBeVisible({ timeout: 5000 });
		await mainPage.confirmPhotoUpload();

		const uploaded = await  mainPage.page.evaluate(() => localStorage.getItem('uploaded-photo'));
		expect.soft(uploaded).toBeTruthy();
		if (uploaded) expect.soft(uploaded.startsWith('data:image/')).toBe(true);

		await expect.soft(mainPage.profilePhoto).toBeVisible({ timeout: 5000 });
		const photoSrc = await mainPage.profilePhoto.getAttribute('src');
		expect.soft(photoSrc).toBe(uploaded);
	});

	test('polish resume flow — mocked response updates UI', async ({ mainPage }) => {
		await mainPage.page.evaluate((flag) => localStorage.setItem('resume-data', flag), GENERATED_FLAG);

		await mainPage.page.reload();
		await mainPage.waitForResumeLoaded();

		await mainPage.clickPolish();
		await expect(mainPage.polishOverlay).toBeVisible();
		const refreshText = await mainPage.getRefreshMessageText();
		if (refreshText) expect.soft(refreshText.toLowerCase()).toContain('refresh');
	});

	test('ATS scan error handling — 500 from proxy shows error in UI', async ({ mainPage }) => {
		mainPage.page.on('dialog', (dialog) => dialog.dismiss());

		// Ensure no fallback retry — force the error into #rp-feedback
		await mainPage.page.unroute('**/config.json');
		await mainPage.page.route('**/config.json', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					AI_MODEL: 'gemini-2.5-flash',
					ACCENT_COLOR: '#2563eb',
				}),
			});
		});

		// Override the infer mock to return a 500 with an error payload
		await mainPage.page.unroute('**/api/infer');
		await mainPage.page.route('**/api/infer', async (route) => {
			await route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'Internal Server Error' }),
			});
		});

		await mainPage.enterJobDescription(jobDescriptionFixtures.full);
		await mainPage.clickScan();

		await expect(mainPage.rpFeedback).toContainText(/error/i, { timeout: 10000 });
	});

	test('rollback — calls /api/rollback via network interception and updates UI', async ({ mainPage }) => {
		// Set up network interception: wait for the rollback API call
		const rollbackResponsePromise =  mainPage.page.waitForResponse(
			(r) => r.url().includes('/api/rollback') && r.status() === 200
		);

		// Set up generated state so rollback button appears
		const polishedFlag = JSON.stringify({
			basics: { name: 'Test User', email: 'test@example.com', photo: null },
			experience: [],
			education: [],
			skills: {},
		});
		await  mainPage.page.evaluate((flag) => localStorage.setItem('resume-data', flag), polishedFlag);

		// Mock polished JSON to return 200 so rollback button is shown
		await  mainPage.page.route('**/src/resume/output/resume-data-AI-polished.json', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					basics: { name: 'Test User', email: 'test@example.com', photo: null },
					experience: [],
					education: [],
					skills: {},
				}),
			});
		});

		await mainPage.page.reload();
		await mainPage.waitForResumeLoaded();

		await mainPage.clickRollback();

		const response = await rollbackResponsePromise;
		expect(response.status()).toBe(200);

		const refreshText = await mainPage.getRefreshMessageText();
		if (refreshText) expect.soft(refreshText.toLowerCase()).toContain('rollback');
	});
});

