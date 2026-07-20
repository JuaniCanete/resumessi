/**
 * tests/e2e/ai-providers.spec.js
 *
 * E2E tests for AI Providers Modal functionality.
 */

const { test, expect } = require('./test-setup.js');

test.describe('AI Providers Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Mock config.json to return available providers
    await page.route('**/config.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          availableProviders: ['cohere', 'mistral', 'gemini'],
          primaryProvider: 'cohere',
          AI_INFERENCE_ORDER: 'cohere,mistral,gemini'
        })
      });
    });
  });

  test('opens providers modal when clicking AI Providers button', async ({ mainPage }) => {
    await mainPage.openActions();
    await mainPage.providersButton.click();
    await expect(mainPage.providersModal).toBeVisible();
  });

  test('displays list of configured providers', async ({ mainPage }) => {
    await mainPage.openProvidersModal();
    const items = await mainPage.getProviderItems();
    expect(items.length).toBeGreaterThan(0);
  });

  test('selects a provider and saves to localStorage', async ({ mainPage }) => {
    await mainPage.openProvidersModal();
    await mainPage.selectProvider('Cohere');
    await mainPage.confirmProvidersSelection();

    const stored = await mainPage.getSelectedProviderFromLocalStorage();
    expect(stored).toBe('cohere');
  });

  test('cancels selection and closes modal', async ({ mainPage }) => {
    await mainPage.openProvidersModal();
    await mainPage.cancelProvidersSelection();
    await expect(mainPage.providersModal).toBeHidden();
  });

  test('modal close button works', async ({ mainPage }) => {
    await mainPage.openProvidersModal();
    await mainPage.closeProvidersModal();
    await expect(mainPage.providersModal).toBeHidden();
  });

  test('Escape key closes providers modal', async ({ page, mainPage }) => {
    await mainPage.openProvidersModal();
    await expect(mainPage.providersModal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mainPage.providersModal).toBeHidden();
  });

  test('only one provider can be selected at a time', async ({ mainPage }) => {
    await mainPage.openProvidersModal();

    // Select first provider
    await mainPage.selectProvider('Cohere');

    // Select second provider
    await mainPage.selectProvider('Mistral');

    // Verify first provider is unchecked and second is checked
    const cohereChecked = await mainPage.providersList.locator('.provider-item[data-provider="cohere"] .provider-checkbox').isChecked();
    const mistralChecked = await mainPage.providersList.locator('.provider-item[data-provider="mistral"] .provider-checkbox').isChecked();

    expect(cohereChecked).toBe(false);
    expect(mistralChecked).toBe(true);
  });
});