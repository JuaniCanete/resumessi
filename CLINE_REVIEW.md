# CLINE_REVIEW.md

Code review findings for the resumessi TypeScript migration.

---

## Methodology

- **accept**: Issue is real and impacts code quality or correctness
- **reshape**: Issue needs more info or is speculative
- **reject**: Issue is not valid or out of scope

---

## Blocking Issues (Fix Before Merge)

### 1. tsconfig.json does not include tests/**
**Files:** `tsconfig.json`

`include` array has `./src/**/*.ts`, `./public/**/*.ts`, `./scripts/**/*.ts`, `./start.ts`, `./build.ts`, `./setup.ts`. Missing `./tests/**/*.ts`. Test files are excluded from type checking and TypeScript language features.

**Decision:** accept  
**Severity:** medium  
**Fix:** Add `"./tests/**/*.ts"` to `include` array.

---

## Medium Issues (Fix Before Merge)

### 2. Duplicate `escHtml` implementation
**Files:** `public/app.ts:264-268`

Duplicates `escHtml` from `public/utils.ts` with identical logic.

**Decision:** accept  
**Severity:** medium  
**Fix:** Import `escHtml` from `public/utils.ts` and remove local implementation at lines 264-268.

---

### 3. Comment drift — old .js references in documentation files
**Files:** `.env:1`, `tests/README.md`, `src/resume/prompt.txt.example`

Comments reference `setup.js`, `generate-resume.js`, `build.js` instead of `.ts` equivalents.

**Decision:** accept  
**Severity:** low  
**Fix:** Update comments to reference `.ts` filenames.

---

## Low Issues (Tech Debt / Nice to Have)

### 4. Pre-commit hook runs `npm run evals`
**Files:** `.husky/pre-commit:21`

Runs LLM evaluation harness on every commit. Slow and requires API keys. Better suited for CI.

**Decision:** accept  
**Severity:** low  
**Fix:** Remove from pre-commit. Keep for CI pipeline only.

---

### 5. Pre-commit hook runs e2e tests locally
**Files:** `.husky/pre-commit:20`

Runs Playwright E2E tests on every commit. Requires browser, slow, blocks developer workflow. Better suited for CI.

**Decision:** accept  
**Severity:** low  
**Fix:** Remove from pre-commit. Keep for CI pipeline.

---

### 6. Pre-commit hook lacks `npm run build`
**Files:** `.husky/pre-commit`

Runs `typecheck`, `lint`, `test:unit`, `html:validate`, `css:validate`, `test:e2e`, `evals` but does NOT run `npm run build`. The project requires building frontend bundle before committing.

**Decision:** accept  
**Severity:** low  
**Fix:** Add `npm run build` after `typecheck` and before tests.

---

## Verified as Already Fixed

These issues from CONSOLIDATION_REVIEW.md were verified as resolved:

- Router test mocks now use dependency injection — no real API calls (router.test.ts)
- Regex crash in extraction.test.ts fixed with correct Unicode range
- .env.example has valid syntax
- README.md updated with .ts references
- start.ts only uses dynamic require for optional dependencies with guards
- Nested `extractNameFromPDFText` issue resolved (function is at module scope)
- Unused `env` variable in `runAtsScan` removed

---

## Rejected Issues

### R1. Outdated Git Hooks
**Source:** CONSOLIDATION_REVIEW.md #8

Claimed hooks were outdated. Verified: `.husky/pre-commit` exists and contains valid validation commands.

**Decision:** reject

---

### R2. Type Safety: `checkJs: false`
**Source:** CONSOLIDATION_REVIEW.md #15

`allowJs: false` prevents JS files from being compiled, so `checkJs: false` is harmless.

**Decision:** reject — no action needed

---

### R3. Unused state variables `hasScanResults`, `polishedVersion`, `isLargePDF`
**Source:** CONSOLIDATION_REVIEW.md #9

Not found in current `public/app.ts`. Either never existed or were already removed.

**Decision:** reject — not present in current code

---

## Summary

| Decision | Count |
|----------|-------|
| Accept   | 6     |
| Reject   | 3     |

### Must-fix before merge
1. Add `./tests/**/*.ts` to tsconfig.json include
2. Remove duplicated `escHtml` in `public/app.ts`
3. Update comments in `.env`, `tests/README.md`, `src/resume/prompt.txt.example`

### Pre-commit improvements
1. Remove `npm run evals` from pre-commit (keep for CI)
2. Remove `npm run test:e2e` from pre-commit (keep for CI)
3. Add `npm run build` to pre-commit