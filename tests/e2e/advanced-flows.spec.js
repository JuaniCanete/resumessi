/**
 * tests/e2e/advanced-flows.spec.js
 *
 * Advanced E2E flows for resumessi, built on top of the shared mock setup.
 * All AI / save / rollback endpoints are mocked in tests/e2e/test-setup.js
 * (and selectively overridden per-test below). No real API key required.
 *
 * All interactions use Playwright locator-based actions (POM methods) rather
 * than page.evaluate() to simulate real user behavior.
 */
'use strict';

const path = require('path');
const { test, expect } = require('./test-setup.js');
const { jobDescriptionFixtures } = require('../fixtures/resume-fixtures.js');

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
    const page = mainPage.page;

    // confirmPhotoUpload() only persists when a resume exists in localStorage
    await page.evaluate((flag) => localStorage.setItem('resume-data', flag), GENERATED_FLAG);
    await page.reload();
    await mainPage.waitForResumeLoaded();

    // Open the photo modal via UI (actions dropdown -> Upload Profile Photo)
    await mainPage.openPhotoModal();

    // Feed the file input via the POM method
    await mainPage.uploadPhoto(SAMPLE_PHOTO);

    // Wait for the reader + image load to surface the Confirm button
    await expect(mainPage.photoUploadConfirm).toBeVisible({ timeout: 5000 });
    await mainPage.confirmPhotoUpload();

    // Verify the base64 data URL was persisted
    const uploaded = await page.evaluate(() => localStorage.getItem('uploaded-photo'));
    expect.soft(uploaded).toBeTruthy();
    expect.soft(uploaded.startsWith('data:image/')).toBe(true);

    // Verify the resume display updates to show the uploaded photo
    const profilePhoto = page.locator('.profile-photo');
    await expect.soft(profilePhoto).toBeVisible({ timeout: 5000 });
    const photoSrc = await profilePhoto.getAttribute('src');
    expect.soft(photoSrc).toBe(uploaded);
  });

  test('polish resume flow — mocked response updates UI', async ({ mainPage }) => {
    const page = mainPage.page;

    // Make the Polish button available (only shown for generated resumes)
    await page.evaluate((flag) => localStorage.setItem('resume-data', flag), GENERATED_FLAG);

    await page.reload();
    await mainPage.waitForResumeLoaded();

    // Use the POM method to click Polish through the actions dropdown
    await mainPage.clickPolish();

    // The overlay appears immediately (mocked response is being processed)
    await expect(mainPage.polishOverlay).toBeVisible();

    // After the mocked response, the refresh message is shown to the user
    const refreshText = await mainPage.getRefreshMessageText();
    expect.soft(refreshText.toLowerCase()).toContain('refresh');
  });

  test('ATS scan error handling — 500 from proxy shows error in UI', async ({ mainPage }) => {
    const page = mainPage.page;

    // Dismiss the alert() that the error path triggers
    page.on('dialog', (dialog) => dialog.dismiss());

    // Ensure no fallback retry — force the error into #rp-feedback
    await page.route('**/config.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          AI_MODEL: 'gemini-2.5-flash',
          ACCENT_COLOR: '#2563eb',
        }),
      });
    });

    // Override the proxy mock to return a 500 with an error payload
    await page.route('**/api/proxy', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Internal Server Error' } }),
      });
    });

    await mainPage.enterJobDescription(jobDescriptionFixtures.full);
    await mainPage.clickScan();

    // No fallback model is configured in this test, so the error is surfaced in #rp-feedback
    await expect(mainPage.rpFeedback).toContainText(/error/i, { timeout: 10000 });
  });

  test('rollback — calls /api/rollback via network interception and updates UI', async ({ mainPage }) => {
    const page = mainPage.page;

    // Set up network interception: wait for the rollback API call
    const rollbackResponsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/rollback') && r.status() === 200
    );

    // Set up generated state so rollback button appears
    const polishedFlag = JSON.stringify({
      basics: { name: 'Test User', email: 'test@example.com', photo: null },
      experience: [],
      education: [],
      skills: {},
    });
    await page.evaluate((flag) => localStorage.setItem('resume-data', flag), polishedFlag);

    // Mock polished JSON to return 200 so rollback button is shown
    await page.route('**/src/resume/output/resume-data-AI-polished.json', async (route) => {
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

    await page.reload();
    await mainPage.waitForResumeLoaded();

    // Use POM method to click Rollback through the actions dropdown
    await mainPage.clickRollback();

    // Verify the API call was made and returned successfully
    const response = await rollbackResponsePromise;
    expect(response.status()).toBe(200);

    // UI updates with the rollback refresh message
    const refreshText = await mainPage.getRefreshMessageText();
    expect.soft(refreshText.toLowerCase()).toContain('rollback');
  });
});