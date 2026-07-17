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
│   ├── ats-scan.spec.js     # ATS scan button, J.D. input, results panel
│   ├── ai-generation.spec.js # AI modal open/close, file upload UI
│   ├── resume-display.spec.js # Resume rendering, sidebar toggle
│   ├── advanced-flows.spec.js # Photo upload, polish, rollback flows
│   └── test-setup.js         # Shared Playwright configuration & mocks
├── unit/                   # Unit tests (Node.js test runner)
│   ├── escHtml.test.js         # HTML escaping utility
│   ├── extraction.test.js      # Name extraction from PDF text
│   ├── getPhotoPath.test.js    # Photo path resolution logic
│   ├── renderResume.test.js    # Resume rendering utilities (formatDate, renderSkills, getDuration)
│   ├── validateJDInput.test.js # Job description input validation
│   ├── polishResume.test.js    # Skills rendering helpers
│   ├── providers.test.js       # AI provider configuration & API logic
│   └── router.test.js          # Inference router fallback logic
├── fixtures/
│   └── resume-fixtures.js    # Shared test data (resume, JD, API error fixtures)
├── pages/
│   └── MainPage.js           # Playwright page object model
├── README.md                 # This file
└── playwright.config.js      # Playwright configuration
```

## Framework

- **Unit tests:** Node.js built-in test runner (`node:test` + `node:assert/strict`)
- **E2E tests:** Playwright
- **Evals:** Custom LLM evaluation harness (`scripts/run-evals.js`)

## Notes

Test files mirror implementations from `public/main.html` and `src/providers.js`. When functions are extracted to external files, update imports accordingly.
