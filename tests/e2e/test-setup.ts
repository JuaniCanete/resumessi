import { test as playwrightTest, expect } from '@playwright/test';
import { MainPage } from '../pages/MainPage';
import { FindJobPage } from '../pages/FindJobPage';

// Small delay so UI loading states are visible before mocked responses resolve
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const test = playwrightTest.extend<{ mainPage: MainPage; findJobPage: FindJobPage }>({
  mainPage: async ({ page }, use) => {
    let lastProviderSent: string | null = null;
    let bindingRegistered = false;

    const registerDefaultRoutes = async () => {
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

      await page.route('**/api/infer', async (route) => {
        await delay(150);
        try {
          const request = route.request();
          const postData = JSON.parse(request.postData() || '{}');
          lastProviderSent = postData.provider || null;
          const system = postData.system || '';

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
        } catch {
          // Ignore route already handled / aborted requests
        }
      });

      await page.route('**/api/prompts/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: 'Mocked prompt text'
        });
      });

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

      await page.route('**/api/save-resume-data', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      });

      await page.route('**/api/save-polished', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      });

      await page.route('**/api/rollback', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      });

      await page.route('**/src/resume/output/resume-data-AI-polished.json', async (route) => {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      });
    };

    await registerDefaultRoutes();

    // Reset cached config after route registration
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      if (w.__resetConfigCache) (w.__resetConfigCache as () => void)();
    });

    const mainPage = new MainPage(page);

    // Expose provider tracking for tests (register once per page)
    if (!bindingRegistered) {
      await page.exposeBinding('getLastProviderSent', () => lastProviderSent);
      bindingRegistered = true;
    }

    await mainPage.goto();
    await mainPage.waitForResumeLoaded();
    await use(mainPage);

    // Remove routes after each test so the next test fixture starts from a clean slate.
    await page.unroute('**/config.json');
    await page.unroute('**/api/infer');
    await page.unroute('**/api/prompts/**');
    await page.unroute('**/api/parse-resume-pdf');
    await page.unroute('**/api/polish-resume');
    await page.unroute('**/api/save-resume-data');
    await page.unroute('**/api/save-polished');
    await page.unroute('**/api/rollback');
    await page.unroute('**/src/resume/output/resume-data-AI-polished.json');
  },

  findJobPage: async ({ page }, use) => {
    const findJobPage = new FindJobPage(page);
    await findJobPage.goto();
    await use(findJobPage);
    await findJobPage.unregisterAllRoutes();
  }
});

// Clear localStorage and sessionStorage after each test to avoid state bleed
test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

export { test, expect };
