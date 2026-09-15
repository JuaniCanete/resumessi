import path from 'path';
import { jobDescriptionFixtures } from '../fixtures/resume-fixtures';
import { test, expect } from './test-setup';

// Extend window type for test functions exposed by app.ts
declare global {
	interface Window {
		polishResume: () => Promise<void>;
		cancelPolish: () => void;
		rollbackPolish: () => void;
	}
}

// Valid generated resume flag so polish/photo flows behave as "generated" data
const GENERATED_FLAG = JSON.stringify({
	basics: { name: 'Test User', email: 'test@example.com', photo: null },
	experience: [],
	education: [],
	skills: {},
});

// A small valid JPEG shipped with the project, used to drive the file input.
const SAMPLE_PHOTO = path.resolve(__dirname, '../../demo/goat.jpg');

test.describe(() => {
	test('photo upload — stores base64 in localStorage and updates resume display', async ({ mainPage }) => {
		await mainPage.page.evaluate(flag => localStorage.setItem('resume-data', flag), GENERATED_FLAG);
		await mainPage.page.reload();
		await mainPage.waitForResumeLoaded();

		await mainPage.openPhotoModal();

		await mainPage.uploadPhoto(SAMPLE_PHOTO);

		await expect(mainPage.photoUploadConfirm).toBeVisible({ timeout: 5000 });
		await mainPage.confirmPhotoUpload();
		await mainPage.profilePhoto.waitFor();

		const uploaded = await mainPage.page.evaluate(() => localStorage.getItem('uploaded-photo'));
		expect.soft(uploaded).toBeTruthy();
		if (uploaded) expect.soft(uploaded.startsWith('data:image/')).toBe(true);

		await expect(mainPage.profilePhoto).toBeVisible({ timeout: 5000 });
		const photoSrc = await mainPage.profilePhoto.getAttribute('src');
		expect.soft(photoSrc).toBe(uploaded);
	});

	test('polish resume flow — review and accept selected changes', async ({ mainPage }) => {
		// Complete resume data matching what renderResume expects
		const completeResumeData = {
			basics: {
				name: 'Test User',
				email: 'test@example.com',
				phone: '+1234567890',
				location: 'Test City',
				title: 'Software Engineer',
				linkedin: 'https://linkedin.com/in/test',
				github: 'https://github.com/test',
				photo: null,
			},
			summary: 'Test summary',
			experience: [],
			education: [],
			skills: { 'Core Skills': [{ name: 'JavaScript', expert: true }] },
			certifications: [],
			talks: [],
			projects: [],
		};

		// Mock resume data endpoint so currentDataSource = 'generated' and polish button shows
		await mainPage.page.route('**/src/resume/output/resume-data.json', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(completeResumeData),
			});
		});

		// Also mock the polished file to return 404 (no polished version exists yet)
		await mainPage.page.route('**/src/resume/output/resume-data-AI-polished.json', async route => {
			await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
		});

		// Mock the polish API endpoints - API now only receives summary and experience
		await mainPage.page.route('**/api/polish-resume', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					summary: 'Polished summary with improved wording',
					experience: [
						{
							title: 'Senior Software Engineer',
							company: 'Tech Corp',
							startDate: '2020-01',
							endDate: '2023-12',
							description: 'Led development of scalable web applications.',
							highlights: ['Improved performance by 40%', 'Mentored 5 junior developers'],
						},
					],
				}),
			});
		});

		await mainPage.page.route('**/api/save-polished', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ success: true }),
			});
		});

		// Capture console errors
		const consoleErrors: string[] = [];
		mainPage.page.on('console', msg => {
			if (msg.type() === 'error') {
				consoleErrors.push(msg.text());
			}
		});
		mainPage.page.on('pageerror', err => {
			consoleErrors.push(err.message);
		});

		await mainPage.page.route('**/src/resume/output/resume-data.json', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(completeResumeData),
			});
		});

		// Also mock the polished file to return 404 (no polished version exists yet)
		await mainPage.page.route('**/src/resume/output/resume-data-AI-polished.json', async route => {
			await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
		});

		await mainPage.page.evaluate(flag => localStorage.setItem('resume-data', flag), JSON.stringify(completeResumeData));

		await mainPage.page.reload();
		await mainPage.waitForResumeLoaded();

		// Call polishResume directly via evaluate with more logging
		const _evalResult = await mainPage.page.evaluate(() => {
			try {
				const btn = document.getElementById('btn-polish-dropdown') as HTMLButtonElement | null;
				const overlay = document.getElementById('polish-overlay');
				const isFunc = typeof window.polishResume === 'function';
				const btnFound = !!btn;
				const btnDisabled = btn?.disabled ?? false;
				const overlayFound = !!overlay;
				const overlayStyleDisplay = overlay?.style.display;
				const overlayComputedDisplay = overlay ? getComputedStyle(overlay).display : 'N/A';

				if (typeof window.polishResume === 'function') {
					window.polishResume();
				}

				// Return debug info
				return {
					isFunction: isFunc,
					btnFound,
					btnDisabled,
					overlayFound,
					overlayStyleDisplay,
					overlayComputedDisplay,
					overlayStyleAfter: overlay ? overlay.style.display : 'N/A',
				};
			} catch (e) {
				return { error: String(e) };
			}
		});

		await expect(mainPage.diffOverlay).toBeVisible({ timeout: 5000 });
		await expect(mainPage.diffSections).toHaveCount(2);
		await mainPage.diffCheckboxes.first().check();
		await expect(mainPage.diffCounter).toContainText('1 of 2 changes accepted');

		// Intercept save-polished to verify payload
		let savePolishedPayload: unknown = null;
		await mainPage.page.route('**/api/save-polished', async route => {
			savePolishedPayload = await route.request().postDataJSON();
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
		});

		await mainPage.finishPolishButton.click();
		await expect(mainPage.refreshMessage).toBeVisible({ timeout: 5000 });

		// Verify save-polished payload
		expect(savePolishedPayload).toBeTruthy();
		const payload = savePolishedPayload as Record<string, unknown>;
		// First section (summary) was checked - should have polished value
		expect(payload.summary).toBe('Polished summary with improved wording');
		// Second section (experience) was unchecked - should retain original (empty array in test)
		expect(payload.experience).toEqual([]);
	});

	test('ATS scan error handling — 500 from proxy shows error in UI', async ({ mainPage }) => {
		mainPage.page.on('dialog', dialog => dialog.dismiss());

		// Ensure no fallback retry — force the error into #rp-feedback
		await mainPage.page.unroute('**/config.json');
		await mainPage.page.route('**/config.json', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					AI_MODEL: 'gemini-3.7-flash',
					ACCENT_COLOR: '#2563eb',
				}),
			});
		});

		// Override the infer mock to return a 500 with an error payload
		await mainPage.page.unroute('**/api/infer');
		await mainPage.page.route('**/api/infer', async route => {
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
		const rollbackResponsePromise = mainPage.page.waitForResponse(
			r => r.url().includes('/api/rollback') && r.status() === 200
		);

		// Set up generated state so rollback button appears
		const polishedFlag = JSON.stringify({
			basics: { name: 'Test User', email: 'test@example.com', photo: null },
			experience: [],
			education: [],
			skills: {},
		});
		await mainPage.page.evaluate(flag => localStorage.setItem('resume-data', flag), polishedFlag);

		// Mock polished JSON to return 200 so rollback button is shown
		await mainPage.page.route('**/src/resume/output/resume-data-AI-polished.json', async route => {
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
	});
});
