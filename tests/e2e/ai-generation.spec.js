/**
 * tests/e2e/ai-generation.spec.js
 *
 * E2E tests for the AI Resume Generation modal.
 * Tests modal open/close, file upload area visibility,
 * and UI state changes — without triggering real API calls.
 */
'use strict';

const { test, expect } = require('./test-setup.js');

test.describe('AI Generation Modal', () => {
  test('generate button is visible on load', async ({ mainPage }) => {
    const btn = mainPage.page.locator('#btn-ai-generate');
    await expect(btn).toBeVisible();
  });

  test('modal opens on button click', async ({ mainPage }) => {
    await mainPage.openAiModal();
    await expect(mainPage.page.locator('#ai-modal')).toBeVisible();
  });

  test('modal has file upload area', async ({ mainPage }) => {
    await mainPage.openAiModal();
    // The PDF drop zone should be visible
    const dropZone = mainPage.page.locator('#modal-upload-section');
    await expect(dropZone).toBeVisible();
  });

  test('modal can be closed', async ({ mainPage }) => {
    await mainPage.openAiModal();
    await expect(mainPage.page.locator('#ai-modal')).toBeVisible();

    // Click the close button (X or cancel)
    const closeBtn = mainPage.page.locator('#ai-modal [id*="close"], #ai-modal .modal-close, #btn-modal-cancel').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await expect(mainPage.page.locator('#ai-modal')).toBeHidden({ timeout: 2000 });
    }
  });
});
