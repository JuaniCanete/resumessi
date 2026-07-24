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
│   ├── ats-scan.spec.ts     # ATS scan button, J.D. input, results panel
│   ├── ai-generation.spec.ts # AI modal open/close, file upload UI
│   ├── resume-display.spec.ts # Resume rendering, sidebar toggle
│   ├── advanced-flows.spec.ts # Photo upload, polish, rollback flows
│   └── test-setup.ts         # Shared Playwright configuration & mocks
├── unit/                   # Unit tests (Node.js test runner)
│   ├── escHtml.test.ts         # HTML escaping utility
│   ├── extraction.test.ts      # Name extraction from PDF text
│   ├── getPhotoPath.test.ts    # Photo path resolution logic
│   ├── renderResume.test.ts    # Resume rendering utilities (formatDate, renderSkills, getDuration)
│   ├── validateJDInput.test.ts # Job description input validation
│   ├── polishResume.test.ts    # Skills rendering helpers
│   ├── providers.test.ts       # AI provider configuration & API logic
│   └── router.test.ts          # Inference router fallback logic
├── fixtures/
│   └── resume-fixtures.ts    # Shared test data (resume, JD, API error fixtures)
├── pages/
│   └── MainPage.ts           # Playwright page object model
├── README.md                 # This file
└── playwright.config.ts      # Playwright configuration
```

## Framework

- **Unit tests:** Node.js built-in test runner (`node:test` + `node:assert/strict`)
- **E2E tests:** Playwright
- **Evals:** Custom LLM evaluation harness (`scripts/run-evals.ts`)

## Notes

Test files mirror implementations from `public/main.html` and `src/providers.ts`. When functions are extracted to external files, update imports accordingly.
