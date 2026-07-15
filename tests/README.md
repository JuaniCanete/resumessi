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
│   ├── ats-scan.spec.js
│   ├── ai-generation.spec.js
│   ├── resume-display.spec.js
│   ├── advanced-flows.spec.js
│   └── test-setup.js
├── unit/                   # Unit tests (Node.js test runner)
│   ├── escHtml.test.js     # HTML escaping utility
│   ├── getPhotoPath.test.js # Photo path resolution logic
│   ├── renderResume.test.js # Resume rendering utilities
│   ├── validateJDInput.test.js # Job description input validation
│   └── polishResume.test.js # Polish-resume validation / skills helpers
├── fixtures/
│   └── resume-fixtures.js  # Shared test data
├── pages/
│   └── MainPage.js         # Playwright page object
├── README.md               # This file
└── playwright.config.js    # Playwright configuration
```

## Framework

- **Unit tests:** Node.js built-in test runner (`node:test` + `node:assert/strict`)
- **E2E tests:** Playwright
- **Evals:** Custom LLM evaluation harness (`scripts/run-evals.js`)

## Notes

Test files mirror implementations from `public/main.html`. When functions are extracted to external files, update imports accordingly.
