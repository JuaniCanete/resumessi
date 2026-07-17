/**
 * tests/e2e/ats-scan.spec.js
 *
 * E2E tests for the ATS Resume Scan feature.
 * Verifies the scan UI flow: entering a JD, triggering scan,
 * and receiving results in the right panel.
 *
  * Note: These tests are fully hermetic — all API calls are mocked via
  * page.route() in test-setup.js. No real API key is required.
 */
'use strict';

const { test, expect } = require('./test-setup.js');
const { jobDescriptionFixtures } = require('../fixtures/resume-fixtures.js');

test.describe('ATS Scan — UI Flow', () => {
  test('scan button is visible on load', async ({ mainPage }) => {
    await expect(mainPage.btnRunScan).toBeVisible();
    await expect(mainPage.btnRunScan).toBeDisabled();
  });

  test('job description textarea accepts input', async ({ mainPage }) => {
    await mainPage.enterJobDescription(jobDescriptionFixtures.minimal);
    const value = await mainPage.jobDescriptionTextarea.inputValue();
    expect(value).toBe(jobDescriptionFixtures.minimal);
  });

  test('scan button shows loading state on click', async ({ mainPage }) => {
    await mainPage.enterJobDescription(jobDescriptionFixtures.minimal);

    // Click and immediately check the button state changes (loading)
    await mainPage.btnRunScan.click();

    // Button text should change to cancel state within 500ms
    await expect(mainPage.btnRunScan).toHaveText('Cancel Scan', { timeout: 2000 });

    // Cancel to avoid waiting for full API response
    await mainPage.btnRunScan.click();
  });

  test('results panel score shows placeholder before scan', async ({ mainPage }) => {
    const scoreText = await mainPage.rpScoreCircle.textContent();
    // Initial state is '--' or empty
    expect(scoreText === '--' || scoreText === '' || scoreText === null).toBeTruthy();
  });
});
