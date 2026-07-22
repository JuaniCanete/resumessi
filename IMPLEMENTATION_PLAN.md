# TypeScript Migration

Migrate the entire resumessi codebase from JavaScript to TypeScript to provide strict type definitions, better developer experience, and safety without runtime overhead, as per `TYPESCRIPT_MIGRATION.md`.

## User Review Required

> [!WARNING]
> **Build step for frontend client logic**: Phase 4 proposes extracting inline JavaScript from `public/main.html` into `public/app.ts` and configuring a lightweight build step to compile it into `public/dist/app.js`. Are you okay with introducing this build step for the frontend client, and should we use `esbuild` or `tsc` for it?

## Open Questions

> [!IMPORTANT]
> - Should we switch to a specific test runner for the unit tests and Playwright for E2E, as outlined in the plan?
> - Are you comfortable with `tsx` as the primary executor for development server and scripts?

## Proposed Changes

### Configuration & Tooling

#### [MODIFY] [package.json](file:///c:/Users/juani/Desktop/Career_change/resumessi/package.json)
Add TS dependencies (`typescript`, `@types/node`, `@types/pdf-parse`, `@types/busboy`, `tsx`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`). Update scripts to use `tsx`, and add a `typecheck` script.

#### [MODIFY] [tsconfig.json](file:///c:/Users/juani/Desktop/Career_change/resumessi/tsconfig.json)
Update TypeScript configuration options: `"target": "ES2022"`, `"allowJs": false`. Include all `.ts` files from `src`, `public`, `scripts`, `tests`, and root scripts.

---

### Core Data Models & Type Definitions

#### [NEW] [src/types/provider.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/types/provider.ts)
Define explicit TS types and interfaces for AI Providers (`ProviderName`, `LLMMessage`, `LLMOptions`, `ProviderResponse`).

#### [NEW] [src/types/resume.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/types/resume.ts)
Define schemas for Resume JSON, ATS scoring (`ATSScoreBreakdown`), and extracted data (`ExtractedResumeData`).

#### [NEW] [src/types/config.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/types/config.ts)
Define the runtime environment and endpoint config types (`AppConfig`).

#### [NEW] [src/types/router.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/types/router.ts)
Define router options, fallbacks, and status types.

---

### Backend & Core Module Migration

#### [MODIFY] [src/providers.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/providers.js) -> [src/providers.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/providers.ts)
Migrate AI provider implementations and type the API call implementations and error handling objects.

#### [MODIFY] [src/router.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/router.js) -> [src/router.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/router.ts)
Migrate inference router and failover logic, ensuring typed fallback logic for available endpoints.

#### [MODIFY] [src/resume/generate-resume.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/resume/generate-resume.js) -> [src/resume/generate-resume.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/src/resume/generate-resume.ts)
Migrate CLI resume compilation tool, adding types for prompt reading, PDF parsing, and output generation.

#### [MODIFY] [start.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/start.js) -> [start.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/start.ts)
Migrate the dev server & `/config.json` endpoint. Annotate Express/HTTP request/response handlers.

#### [MODIFY] [build.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/build.js) -> [build.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/build.ts)
Migrate build & prompt injection script. Annotate prompt file reading and standard HTML generation.

#### [MODIFY] [setup.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/setup.js) -> [setup.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/setup.ts)
Migrate the CLI setup script to TypeScript.

---

### Frontend Utility & UI Migration

#### [MODIFY] [public/utils.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/public/utils.js) -> [public/utils.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/public/utils.ts)
Migrate frontend helper functions (`escHtml`, `getPhotoPath`, `validateJDInput`) with explicit types.

#### [NEW] [public/app.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/public/app.ts)
Extract inline JavaScript from `public/main.html` into this modular file.

#### [MODIFY] [public/main.html](file:///c:/Users/juani/Desktop/Career_change/resumessi/public/main.html)
Update template to load the compiled distribution script (`public/dist/app.js`).

---

### Scripts & Test Suite Migration

#### [MODIFY] [scripts/validate.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/scripts/validate.js) -> [scripts/validate.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/scripts/validate.ts)
Migrate pre-build validation script.

#### [MODIFY] [scripts/run-evals.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/scripts/run-evals.js) -> [scripts/run-evals.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/scripts/run-evals.ts)
Migrate LLM evals harness.

#### [MODIFY] [tests/playwright.config.js](file:///c:/Users/juani/Desktop/Career_change/resumessi/tests/playwright.config.js) -> [tests/playwright.config.ts](file:///c:/Users/juani/Desktop/Career_change/resumessi/tests/playwright.config.ts)
Migrate Playwright configuration.

#### [MODIFY] [tests/fixtures/] & [tests/pages/] & [tests/unit/] & [tests/e2e/]
Convert all Node test suites, Page Objects, fixtures, and E2E specifications to TypeScript.

## Verification Plan

### Automated Tests
- Run `npm run typecheck` to verify 0 type errors.
- Run `npm run lint` for ESLint TypeScript validation.
- Run `npm run test:unit` to verify pure logic tests.
- Run `npm run test:e2e` for Playwright browser tests.
- Run `npm run validate` to ensure prompt and config structure validations succeed.
- Run `npm run build:check` to ensure client & server artifacts compile cleanly.

### Manual Verification
- Start the server (`npm start`) and interact with the application.
- Verify ATS scoring and resume generation flows operate normally without runtime regressions.
