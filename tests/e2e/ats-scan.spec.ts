import { jobDescriptionFixtures } from '../fixtures/resume-fixtures';
import { test, expect } from './test-setup';

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
		await Promise.all([
			mainPage.btnRunScan.click(),
			expect(mainPage.btnRunScan).toHaveText('Cancel Scan', { timeout: 2000 }),
		]);
		await mainPage.btnRunScan.click();
	});

	test('results panel score shows placeholder before scan', async ({ mainPage }) => {
		const scoreText = await mainPage.rpScoreCircle.textContent();
		expect(scoreText === '--' || scoreText === '' || scoreText === null).toBeTruthy();
	});
});
