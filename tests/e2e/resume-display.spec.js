const { test, expect } = require('./test-setup.js');
const { jobDescriptionFixtures } = require('../fixtures/resume-fixtures.js');

test.describe('Resume Display', () => {
  test('should display resume content on load', async ({ mainPage }) => {
    const resumeName = await mainPage.page.locator('h1').textContent();
    expect(resumeName).toBeTruthy();
    expect(resumeName.length).toBeGreaterThan(0);
  });

  test('should toggle left sidebar', async ({ mainPage }) => {
    const body = mainPage.page.locator('body');
    
    // Collapse the sidebar by clicking the collapse button
    await mainPage.page.click('[aria-label="Collapse sidebar"]');
    await expect(body).toHaveClass(/left-collapsed/);
    
    // Open the sidebar by clicking the stub button
    await mainPage.page.click('#left-open-stub');
    await expect(body).not.toHaveClass(/left-collapsed/);
  });

  test('should show ATS results panel after scan', async ({ mainPage }) => {
    await mainPage.enterJobDescription(jobDescriptionFixtures.minimal);
    await mainPage.clickScan();
    
    // Wait for the score to be updated from the initial '--' placeholder
    const scoreCircle = mainPage.page.locator('#rp-score-circle');
    await expect(scoreCircle).not.toHaveText('--', { timeout: 30000 });
    
    const score = await mainPage.getScore();
    expect(score).not.toBe('--');
    expect(parseInt(score, 10)).toBeGreaterThanOrEqual(0);
    expect(parseInt(score, 10)).toBeLessThanOrEqual(100);
  });
});

test.describe('AI Generation', () => {
  test('should open AI modal on click', async ({ mainPage }) => {
    await mainPage.openAiModal();
    await expect(mainPage.page.locator('#ai-modal')).toBeVisible();
  });
});