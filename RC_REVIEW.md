# RC_REVIEW.md

## Key Findings from CONSOLIDATION_REVIEW.md

### Blocking Issues (Must Fix Before Merge)
1. **Router Test Mocks Broken** (High Severity)
   - Real API calls execute instead of mocks, causing test failures.
   - Fix: Remove `require.cache` mocking. Either inject `callProvider`/`getProviderConfig` via a test wrapper, or refactor `router.ts` to accept them as parameters.

2. **Regex Crash in `extraction.test.ts`** (High Severity)
   - Corrupted character class causing runtime crash.
   - Fix: Replace with `[A-Za-zÀ-ÿ' .\-]` using the correct Unicode range, matching the implementation in `public/app.ts:860` (`/^[a-zA-ZÀ-ÿñÑ'. -]+$/`).

3. **`.env.example` Invalid Syntax** (Medium Severity)
   - Spaces around `=` and trailing semicolon.
   - Fix: Rewrite as valid env syntax: `DEFAULT_AI_INFERENCE_ORDER='mistral, cohere, gemini, groq'`.

4. **README.md Outdated** (High Severity)
   - Missing `.ts` files and outdated `.js` references.
   - Fix: Update all `.js` to `.ts`, add entries for `src/types/`, `src/resume/`, `public/utils.ts`, `public/app.ts`, `public/dist/`. Document `typecheck` and `esbuild` usage. Remove stale `RESUME.md` references if any.

5. **`start.ts` Dynamic `require()`** (Medium Severity)
   - Uses `require()` which bypasses type checking.
   - Fix: Convert to static `import` statements at top of file:
   ```typescript
   import { getProviderConfig, validateInferenceRequest } from './src/providers';
   import { runInference, runPolish } from './src/router';
   ```

### Medium Issues
6. **`tsconfig.json` Missing `tests/**`** (Medium)
   - Fix: Add `"./tests/**/*.ts"` to `include` array.

7. **Lint Errors (18 total)** (Medium)
   - Key issues include unused imports, `var` usage, and nested function violations.
   - Fix: Run `eslint . --fix` for auto-fixable items. Manually fix nested function (lift `extractNameFromPDFText` to module scope or give it a stable export), remove unused vars/imports, replace `var` with `let/const`, clean whitespace.

### Low Issues (Tech Debt)
8. Comment drift in source files
9. Unused vars/imports
10. Duplicated `escHtml` in `public/app.ts`
11. Frontend coverage gaps
12. Inconsistent error shapes in `src/providers.ts`
13. Provider coverage gap
14. Build documentation gap
15. `checkJs: false`

### Summary
- Accept: 15
- Reshape: 3
- Reject: 4

### Must-fix before merge
1. Router test mocks (high)
2. Regex crash in `extraction.test.ts` (high)
3. `.env.example` invalid syntax (medium)
4. README.md outdated (high)
5. `start.ts` dynamic requires (medium)
6. `tsconfig.json` missing `tests/**` (medium)
7. Lint errors (18 total) (medium)
8. Comment drift in source files (low)
9. Unused vars/imports (low)
10. Duplicated `escHtml` (low)
11. Build documentation (low, part of README)
12. `checkJs:false` (low)

### Follow-up (not blocking)
- Frontend coverage gaps (reshape — tech debt)
- Error shapes refactor (reshape — behavioral change)
- Provider coverage (reshape — future work)

---

## Pre-commit Hook Review

### Current `.husky/pre-commit` Analysis

```bash
#!/usr/bin/env sh
set -e

echo "Running pre-commit validations..."

# Validations are happening in proper order: 
# 1. TypeScript type check
# 2. Static checks
# 3. Unit tests
# 4. HTML/CSS validation
# Yet missing API checks
# 5. E2E tests
# 6. AI evals

npm run typecheck
npm run lint
npm run test:unit
npm run html:validate
npm run css:validate
npm run test:e2e
npm run evals

echo "All validations passed ✅"
```

### Issues Found

1. **E2E tests and AI evals run on every commit** — These are slow (Playwright + real API calls). They should run in CI, not on every local commit. This will significantly slow down developer workflow.

2. **No staged-files filtering** — Runs full test suite even for trivial changes (e.g., docs-only). Should use `lint-staged` or similar to only validate changed files.

3. **Missing `npm run build`** — The build step (esbundle frontend) is not validated. A broken build would only be caught in CI.

4. **No `npm run validate`** — The `scripts/validate.ts` script (which validates prompts against types) is not run.

5. **Comment says "missing API checks"** — This is acknowledged but not implemented.

### Recommended Improvements

| Issue | Recommendation |
|-------|----------------|
| Slow E2E/evals on commit | Move `npm run test:e2e` and `npm run evals` to CI only (GitHub Actions). Keep pre-commit fast (<30s). |
| No staged filtering | Add `lint-staged` to run lint/typecheck only on staged files. |
| Missing build validation | Add `npm run build` to pre-commit (or CI). |
| Missing prompt validation | Add `npm run validate` to pre-commit. |
| No API checks | Consider adding a lightweight API connectivity check (optional, with timeout). |

### Suggested Pre-commit (Fast, Local-Friendly)

```bash
#!/usr/bin/env sh
set -e

echo "Running pre-commit validations..."

# 1. TypeScript type check (fast, catches compile errors)
npm run typecheck

# 2. Lint (fast, auto-fixable)
npm run lint

# 3. Unit tests (fast, no network)
npm run test:unit

# 4. HTML/CSS validation (fast)
npm run html:validate
npm run css:validate

# 5. Build validation (catches esbuild issues)
npm run build

# 6. Prompt/type validation
npm run validate

echo "All validations passed ✅"
```

### CI Pipeline Should Run
- `npm run test:e2e` (Playwright)
- `npm run evals` (AI evaluation harness)
- Full build + typecheck + lint (redundant but safe)