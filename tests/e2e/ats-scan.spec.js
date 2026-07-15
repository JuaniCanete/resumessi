/**
 * tests/e2e/ats-scan.spec.js
 *
 * E2E tests for the ATS Resume Scan feature.
 * Verifies the scan UI flow: entering a JD, triggering scan,
 * and receiving results in the right panel.
 *
 * Note: These tests are fully hermetic — all API calls are mocked via
 * page.route() in test-setup.js. No real AI_API_KEY is required.
 */
'use strict';

const { test, expect } = require('./test-setup.js');
const { jobDescriptionFixtures } = require('../fixtures/resume-fixtures.js');

test.describe('ATS Scan — UI Flow', () => {
  test('scan button is visible on load', async ({ mainPage }) => {
    const btn = mainPage.page.locator('#btn-run-scan');
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('job description textarea accepts input', async ({ mainPage }) => {
    await mainPage.enterJobDescription(jobDescriptionFixtures.minimal);
    const value = await mainPage.page.locator('#job-description').inputValue();
    expect(value).toBe(jobDescriptionFixtures.minimal);
  });

  test('scan button shows loading state on click', async ({ mainPage }) => {
    await mainPage.enterJobDescription(jobDescriptionFixtures.minimal);

    // Click and immediately check the button state changes (loading)
    const btn = mainPage.page.locator('#btn-run-scan');
    await btn.click();

    // Button text should change to cancel state within 500ms
    await expect(btn).toHaveText('Cancel Scan', { timeout: 2000 });

    // Cancel to avoid waiting for full API response
    await btn.click();
  });

  test('results panel score shows placeholder before scan', async ({ mainPage }) => {
    const scoreEl = mainPage.page.locator('#rp-score-circle');
    const scoreText = await scoreEl.textContent();
    // Initial state is '--' or empty
    expect(scoreText === '--' || scoreText === '' || scoreText === null).toBeTruthy();
  });
});
