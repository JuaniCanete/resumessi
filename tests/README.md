# Test Suite

Run all unit tests:

```bash
npm run test:unit
```

Run E2E tests:

```bash
npm run test:e2e
```

Run evaluations:

```bash
npm run evals
```

## Test Structure

```
tests/
├── e2e/                    # End-to-end tests (Playwright)
│   ├── advanced-flows.spec.ts   # Photo upload, polish, rollback flows
│   ├── ai-generation.spec.ts    # AI modal open/close, file upload UI
│   ├── ai-providers.spec.ts     # Provider selection modal
│   ├── ats-scan.spec.ts         # ATS scan button, J.D. input, results panel
│   ├── resume-display.spec.ts   # Resume rendering, sidebar toggle
│   ├── scraper-results-tabs.spec.ts # Scraper results tabs
│   ├── ui-feedback.spec.ts      # Toast/feedback UI
│   └── test-setup.ts            # Shared Playwright configuration & mocks
├── unit/                   # Unit tests (Node.js test runner)
│   ├── browser.test.ts          # Browser-related utilities
│   ├── escHtml.test.ts          # HTML escaping utility
│   ├── extraction.test.ts       # Name extraction from PDF text
│   ├── getPhotoPath.test.ts     # Photo path resolution logic
│   ├── google-scraper.test.ts   # Google scraper logic
│   ├── jobDataSqlite.test.ts    # SQLite job data storage
│   ├── linkedin-scraper.test.ts # LinkedIn scraper logic
│   ├── polishResume.test.ts     # Skills rendering helpers
│   ├── providers.test.ts        # AI provider configuration & API logic
│   ├── renderResume.test.ts     # Resume rendering utilities (formatDate, renderSkills, getDuration)
│   ├── resizeImage.test.ts      # Photo resize/compression
│   ├── results-app.test.ts      # Results page logic
│   ├── router.test.ts           # Inference router fallback logic
│   ├── scraper-pagination.test.ts # Search URL builder & pagination
│   ├── scraper-runtime-utils.test.ts # Scraper runtime helpers
│   ├── server-endpoints.test.ts # Server API endpoints
│   └── validateJDInput.test.ts  # Job description input validation
├── fixtures/
│   └── resume-fixtures.ts    # Shared test data (resume, JD, API error fixtures)
├── pages/
│   ├── MainPage.ts           # Playwright page object model (main app)
│   └── FindJobPage.ts        # Playwright page object model (job finder)
├── README.md                 # This file
└── playwright.config.ts      # Playwright configuration
```

## Framework

- **Unit tests:** Node.js built-in test runner (`node:test` + `node:assert/strict`)
- **E2E tests:** Playwright
- **Evals:** Custom LLM evaluation harness (`scripts/run-evals.ts`)

## Notes

Test files mirror implementations from `public/main.html`, `public/findJob.html`, `src/providers.ts`, and `src/storage/jobDataSqlite.ts`. When functions are extracted to external files, update imports accordingly.