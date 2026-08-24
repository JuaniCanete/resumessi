import path from 'path';
import { test, expect } from './test-setup';
import { jobDescriptionFixtures } from '../fixtures/resume-fixtures';

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

test.describe('Advanced Flows', () => {
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

	test('polish resume flow — mocked response updates UI', async ({ mainPage }) => {
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

		// Mock the polish API endpoints
		await mainPage.page.route('**/api/polish-resume', async route => {
			console.log('[TEST] /api/polish-resume mock hit, method:', route.request().method());
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					...completeResumeData,
					basics: { ...completeResumeData.basics, name: 'Test User (Polished)' },
				}),
			});
		});

		await mainPage.page.route('**/api/save-polished', async route => {
			console.log('[TEST] /api/save-polished mock hit, method:', route.request().method());
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

		// Debug: check button state
		const button = mainPage.polishButton;
		const displayStyle = await button.evaluate(el => getComputedStyle(el).display);
		const inlineStyle = await button.getAttribute('style');
		const classAttr = await button.getAttribute('class');
		console.log('Button display (computed):', displayStyle);
		console.log('Button inline style:', inlineStyle);
		console.log('Button class:', classAttr);

		// Call polishResume directly via evaluate with more logging
		const evalResult = await mainPage.page.evaluate(() => {
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
		console.log('[TEST] evaluate returned:', evalResult);

		// Wait for the async function to complete and refresh message to appear
		await mainPage.page.waitForTimeout(500);

		// Check refresh message (it's shown briefly, then hidden after 2s)
		const refreshMsg = mainPage.refreshMessage;
		const refreshText = (await refreshMsg.textContent()) ?? '';
		console.log('Refresh message text:', refreshText);
		console.log('Refresh message display:', await refreshMsg.evaluate(el => getComputedStyle(el).display));
		expect(refreshText).toBeTruthy();
		expect(refreshText.toLowerCase()).toContain('applying changes');
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
					AI_MODEL: 'gemini-3.6-flash',
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
