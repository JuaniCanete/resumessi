import { test, expect } from './test-setup';
import { jobDescriptionFixtures } from '../fixtures/resume-fixtures';

test.describe('Resume Display', () => {
	test('should display resume content on load', async ({ mainPage }) => {
		const resumeName = await mainPage.resumeName.textContent();
		expect(resumeName).toBeTruthy();
		expect(resumeName.length).toBeGreaterThan(0);
	});

	test('should toggle left sidebar', async ({ mainPage }) => {
		await mainPage.collapseSidebar();
		await expect(mainPage.body).toHaveClass(/left-collapsed/);

		await mainPage.openSidebar();
		await expect(mainPage.body).not.toHaveClass(/left-collapsed/);
	});

	test('should show ATS results panel after scan', async ({ mainPage }) => {
		await mainPage.enterJobDescription(jobDescriptionFixtures.minimal);
		await mainPage.clickScan();

		await expect(mainPage.rpScoreCircle).not.toHaveText('--', { timeout: 30000 });

		const score = await mainPage.getScore();
		expect(score).not.toBe('--');
		expect(parseInt(score, 10)).toBeGreaterThanOrEqual(0);
		expect(parseInt(score, 10)).toBeLessThanOrEqual(100);
	});
});

test.describe('AI Generation', () => {
	test('should open AI modal on click', async ({ mainPage }) => {
		await mainPage.openAiModal();
		await expect(mainPage.aiModal).toBeVisible();
	});
});

