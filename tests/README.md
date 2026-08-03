# Test Suite

Run all unit tests:

```bash
npm run test:unit
```

Run API tests (Node `fetch` + `node:test`, no extra dependencies):

```bash
npm run test:api
```

Run E2E tests:

```bash
npm run test:e2e
```

Run all tests (unit + API + E2E):

```bash
npm run test:all
```

Run evaluations:

```bash
npm run evals
```

## Test Structure

```
tests/
├── api/                       # API tests (Node built-in test runner + fetch)
│   └── *.test.ts              # Start the real server on an ephemeral port via createAppServer()
├── e2e/                       # End-to-end tests (Playwright)
│   ├── ats-scan.spec.ts        # ATS scan button, J.D. input, results panel, cancel flow
│   ├── ai-generation.spec.ts   # AI modal open/close, file upload UI
│   ├── ai-providers.spec.ts    # Providers modal, selection persistence, keyboard close
│   ├── resume-display.spec.ts  # Resume rendering, sidebar toggle
│   ├── advanced-flows.spec.ts  # Photo upload, polish, rollback flows
│   ├── scraper-results-tabs.spec.ts   # Results page tab navigation
│   ├── scraper-select-all.spec.ts     # Results page select-all behavior
│   └── test-setup.ts           # Shared Playwright fixture & route mocks
├── unit/                       # Unit tests (Node.js test runner)
│   ├── escHtml.test.ts             # HTML escaping utility
│   ├── extraction.test.ts          # Name extraction from PDF text
│   ├── getPhotoPath.test.ts        # Photo path resolution logic
│   ├── google-scraper.test.ts      # Google search URL builder & result URL unwrapping
│   ├── polishResume.test.ts        # Skills rendering helpers
│   ├── providers.test.ts           # AI provider configuration & API logic
│   ├── renderResume.test.ts        # Resume rendering utilities (formatDate, renderSkills, getDuration)
│   ├── router.test.ts              # Inference router fallback logic
│   ├── scraper-pagination.test.ts  # Search pagination URL building
│   ├── scraper-runtime-utils.test.ts # Request path / storage key helpers
│   └── validateJDInput.test.ts     # Job description input validation
├── fixtures/
│   └── resume-fixtures.ts       # Shared test data (resume, JD, API error fixtures)
├── pages/
│   └── MainPage.ts              # Playwright page object model
├── README.md                    # This file
└── playwright.config.ts         # Playwright configuration
```

## Framework

- **Unit tests:** Node.js built-in test runner (`node:test` + `node:assert/strict`)
- **API tests:** Node.js built-in test runner + global `fetch` + `node:assert/strict` — no extra dependencies. Each suite boots the real server via `createAppServer()` from `src/server.ts` on an ephemeral port, with a temp data dir and injected mocks.
- **E2E tests:** Playwright
- **Evals:** Custom LLM evaluation harness (`scripts/run-evals.ts`)

## Coverage

Node's built-in coverage reporter:

```bash
npm run test:coverage
```

This runs unit + API tests with `--experimental-test-coverage`. E2E coverage is intentionally excluded (browser runs are covered by Playwright traces/screenshots, not line coverage).

## Adding a New Test

- **Unit:** mirror the source path — `tests/unit/<module>.test.ts` importing from `src/` or `public/`.
- **API:** add `tests/api/<endpoint>.test.ts`. Use `startTestServer()` from `tests/api/helpers.ts`, inject mocks via `createAppServer` options, and never write outside the temp data dir.
- **E2E:** add `tests/e2e/<flow>.spec.ts` and extend `tests/pages/MainPage.ts` when new UI elements are exercised.

## Notes

Test files mirror implementations from `public/main.html`, `src/providers.ts`, and `src/server.ts`. When functions are extracted to external files, update imports accordingly — do **not** copy function bodies into test files.