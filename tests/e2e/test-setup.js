const { test: playwrightTest } = require('@playwright/test');
const { MainPage } = require('../pages/MainPage.js');

// Small delay so UI loading states are visible before mocked responses resolve
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const test = playwrightTest.extend({
  mainPage: async ({ page }, use) => {
    // Prevent external API calls and ensure hermetic tests
    await page.route('**/api/infer', async (route) => {
      await delay(150); // Allow UI to render loading state before response
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      const system = postData.system || '';

      // Resume generation request
      if (system.includes('resume generation assistant')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            text: JSON.stringify({
              basics: {
                name: 'Test User',
                email: 'test@example.com',
                phone: '+1-555-000-0000',
                location: 'Remote',
                title: 'Software Engineer',
                photo: null
              },
              experience: [],
              education: [],
              skills: { 'Core Skills': [{ name: 'JavaScript', expert: true }] }
            })
          })
        });
        return;
      }

      // ATS scan request (default)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: JSON.stringify({
            ai_screening: {
              overall_score: 85,
              tier: 'GOOD_MATCH',
              breakdown: {
                skills_score: 90,
                experience_years_score: 80,
                education_match: true
              },
              feedback: 'Mocked E2E test feedback: The resume matches the requirements.',
              missingKeywords: ['Playwright', 'E2E Testing']
            }
          })
        })
      });
    });

    // Mock prompt endpoints to avoid CORS/file dependencies
    await page.route('**/api/prompts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: 'Mocked prompt text'
      });
    });

    // Mock PDF parsing endpoint
    await page.route('**/api/parse-resume-pdf', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            text: 'Mocked PDF text for testing',
            pages: 1
          })
        });
        return;
      }
      await route.continue();
    });

    // Mock polish endpoint
    await page.route('**/api/polish-resume', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            basics: {
              name: 'Test User',
              email: 'test@example.com',
              phone: '+1-555-000-0000',
              location: 'Remote',
              title: 'Software Engineer',
              photo: null
            },
            experience: [],
            education: [],
            skills: { 'Core Skills': [{ name: 'JavaScript', expert: true }] }
          })
        });
        return;
      }
      await route.continue();
    });

    // Mock save endpoints
    await page.route('**/api/save-resume-data', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/api/save-polished', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.route('**/api/rollback', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    // Mock polished JSON endpoint — by default return 404 so Polish button is available
    await page.route('**/src/resume/output/resume-data-AI-polished.json', async (route) => {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });

    const mainPage = new MainPage(page);
    await mainPage.goto();
    await mainPage.waitForResumeLoaded();
    await use(mainPage);
  }
});

module.exports = { test, expect: playwrightTest.expect };