import { test, expect } from './test-setup';

test.describe('AI Providers Modal', () => {
	test.beforeEach(async ({ page }) => {
		
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

	test('Escape key closes providers modal', async ({ mainPage }) => {

		await mainPage.openProvidersModal();
		await expect(mainPage.providersModal).toBeVisible();
		await mainPage.page.keyboard.press('Escape');
		await expect(mainPage.providersModal).toBeHidden();
	});

	test('only one provider can be selected at a time', async ({ mainPage }) => {

		await mainPage.openProvidersModal();
		await mainPage.selectProvider('Cohere');

		await mainPage.selectProvider('Mistral');

		const cohereChecked = await mainPage.providersList.locator('.provider-item[data-provider="cohere"] .provider-checkbox').isChecked();
		const mistralChecked = await mainPage.providersList.locator('.provider-item[data-provider="mistral"] .provider-checkbox').isChecked();

		expect(cohereChecked).toBe(false);
		expect(mistralChecked).toBe(true);
	});

	test('confirm with pre-selected provider saves correctly', async ({ mainPage }) => {

		await mainPage.page.evaluate(() => localStorage.setItem('selected-ai-provider', 'mistral'));
		
		await mainPage.openProvidersModal();
		
		await mainPage.confirmProvidersSelection();

		const stored = await mainPage.getSelectedProviderFromLocalStorage();
		expect(stored).toBe('mistral');
	});

	test('checkbox click properly updates selection', async ({ mainPage }) => {

		await mainPage.openProvidersModal();
		
		await mainPage.providersList.locator('.provider-item[data-provider="gemini"] .provider-checkbox').click();
		await mainPage.confirmProvidersSelection();

		const stored = await mainPage.getSelectedProviderFromLocalStorage();
		expect(stored).toBe('gemini');
	});

	test('sends selected provider to /api/infer in ATS scan', async ({ mainPage }) => {

		await mainPage.openProvidersModal();
		await mainPage.selectProvider('Mistral');
		await mainPage.confirmProvidersSelection();

		
		const stored = await mainPage.getSelectedProviderFromLocalStorage();
		expect(stored).toBe('mistral');

		await mainPage.enterJobDescription('Test job description for E2E test');
		await mainPage.clickScan();

		await mainPage.page.waitForResponse('**/api/infer', (response) => response.status() === 200);

		const providerSent = await mainPage.page.evaluate(() => window.getLastProviderSent());
		expect(providerSent).toBe('mistral');
	});

	test('handles empty providers list gracefully', async ({ mainPage }) => {
		
		await mainPage.page.route('**/config.json', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					availableProviders: [],
					primaryProvider: null,
					AI_INFERENCE_ORDER: ''
				})
			});
		});

		
		await mainPage.goto();
		await mainPage.waitForResumeLoaded();

		
		await mainPage.openProvidersModal();
		
		
		const items = await mainPage.getProviderItems();
		expect(items.length).toBe(0);
		
		await mainPage.closeProvidersModal();
		await expect(mainPage.providersModal).toBeHidden();
	});

	test('handles stale localStorage entry for unavailable provider', async ({ mainPage }) => {
		
		await mainPage.page.evaluate(() => localStorage.setItem('selected-ai-provider', 'openai'));

		
		await mainPage.page.route('**/config.json', async (route) => {
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

		await mainPage.goto();
		await mainPage.waitForResumeLoaded();

		await mainPage.openProvidersModal();
		
		const items = await mainPage.getProviderItems();
		expect(items.length).toBe(3);

		await mainPage.confirmProvidersSelection();
		
		await expect(mainPage.providersModal).toBeHidden();
	});

	test('uses localStorage value when primaryProvider is null', async ({ mainPage }) => {
		
		await mainPage.page.evaluate(() => localStorage.setItem('selected-ai-provider', 'groq'));

		
		await mainPage.page.route('**/config.json', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					availableProviders: ['cohere', 'mistral', 'gemini', 'groq'],
					primaryProvider: null,
					AI_INFERENCE_ORDER: 'cohere,mistral,gemini,groq'
				})
			});
		});

		await mainPage.goto();
		await mainPage.waitForResumeLoaded();

		await mainPage.openProvidersModal();
		
		const providerItems = await mainPage.getProviderItems();
		let groqChecked = false;
		for (const item of providerItems) {
			const text = await item.textContent();
			if (text && text.includes('Groq')) {
				groqChecked = await item.locator('.provider-checkbox').isChecked();
				break;
			}
		}
		expect(groqChecked).toBe(true);

		await mainPage.closeProvidersModal();
	});
});


