# REVIEW_KILO — TypeScript Migration Review

## Status Summary

`git diff origin/main...HEAD` returns empty because the working tree changes are **uncommitted** on the `TYPESCRIPT_MIGRATION` branch. Review covers the staged/unstaged + untracked working tree state.

**Typecheck:** `tsc --noEmit` passes cleanly.  
**Unit tests:** 7 of 67 fail (real API calls leak through broken mocks + 1 regex crash).  
**Lint:** 18 errors, 15 warnings.

---

## Blocking Issues

### 1. Unit test mocks are broken — real API calls execute
**Files:** `tests/unit/router.test.ts`

Tests mock `../../src/providers.js` via `require.cache`, but the runtime is `providers.ts`. The mock never intercepts the TS module, so tests make real outbound requests to Gemini/Cohere and fail (see 6 router test failures with `HTTP 400/401` from real providers).

**Fix:** Remove `require.cache` mocking. Either inject `callProvider`/`getProviderConfig` via a test wrapper, or refactor `router.ts` to accept them as parameters.

### 2. Regex crash in `extraction.test.ts`
**File:** `tests/unit/extraction.test.ts:32`

The character class `[a-zA-ZÃ€-Ã¿Ã±Ã‘'. -]` is corrupted (mojibake from Ã`-À-ÿ). This throws `Range out of order in character class` at runtime and crashes the file.

**Fix:** Replace with `[A-Za-zÀ-ÖØ-öø-ʸ̀-ͯͰ-῿ -⺀-⺯⻀-⼯ঀ-῿]` or at minimum `[A-Za-zÀ-ÿ' .\-]` using the correct Unicode range.

### 3. `.env.example` invalid syntax
**File:** `.env.example:17`

```
DEFAULT_AI_INFERENCE_ORDER = 'mistral, cohere , gemini, groq';
```

Has spaces around `=` and a trailing semicolon — invalid `.env` format that will not parse correctly. Also duplicated line 9 already sets `AI_INFERENCE_ORDER`.

**Fix:** Remove line 17 or rewrite as valid env syntax without spaces/semicolon.

---

## Lint Errors (18 total, 13 auto-fixable)

| File | Issue |
|------|-------|
| `public/app.ts:851` | **Error:** nested `extractNameFromPDFText` function inside `confirmGeneration` violates `no-inner-declarations` |
| `public/app.ts` | Unused vars: `hasScanResults`, `polishedVersion`, `isLargePDF` |
| `public/app.ts:169` | Unused `env` in `runAtsScan` |
| `src/providers.ts:6` | Unused import `InferenceRequest` |
| `src/providers.ts:21` | `RequestInit` is `no-undef` (use `globalThis.RequestInit` or add `dom` lib) |
| `src/resume/generate-resume.ts:25` | `RESUME_PROMPT` should be `const` |
| `start.ts:236,409` | `NodeJS` namespace usage without explicit `@types/node` import guard |
| `tests/e2e/*.spec.ts` | Unnecessary semicolons after imports |
| `tests/unit/extraction.test.ts` | `var` usage violates `no-var` |
| `tests/unit/polishResume.test.ts:5` | Irregular whitespace (`ï¸`) |

---

## Documentation & Comment Drift

### `README.md` — entirely stale project structure
Still lists `.js` files (`start.js`, `build.js`, `setup.js`, `run-evals.js`, `generate-resume.js`, `playwright.config.js`). Missing `src/types/`, `src/resume/`, `public/utils.ts`, `public/app.ts`, `public/dist/`.

### `build.ts:99`
Comment references `build.js` instead of `build.ts`.

### `setup.ts:85, 266`
Comments/messages reference `setup.js` instead of `setup.ts`.

### Test file headers (8 files)
`tests/unit/*.test.ts`, `tests/pages/MainPage.ts`, `tests/fixtures/resume-fixtures.ts`, `tests/e2e/*.spec.ts` still say `*.js` in doc comments and refer to future extraction into `utils.js`.

### `src/prompts/resume-generation.txt:5`
Says `node generate-resume.js` — should be `tsx generate-resume.ts`.

### `IMPLEMENTATION_PLAN.md`
Contains `[MODIFY]` links pointing to files that no longer exist (`.js` paths). Should be updated or archived since the plan is done.

---

## Code Quality / Dead Code

### Duplicated `escHtml`
`public/app.ts:268-272` reimplements `escHtml` identically to `public/utils.ts`. Frontend uses its own copy instead of importing the shared one. Risk of divergence.

### Unused state in `public/app.ts`
`hasScanResults:7`, `polishedVersion:10`, `isLargePDF:16` are assigned but never read.

### Unused import in `src/providers.ts`
`InferenceRequest` imported at line 6 but never used.

### Masked type safety in `start.ts`
`require('./src/providers.ts')` and `require('./src/router.ts')` at lines 101, 149, 314, 165 are dynamic requires that bypass TypeScript type checking.

### Inconsistent error shapes in `src/providers.ts`
`callProvider` throws plain objects `{ status, error, provider }` at line 60 instead of `Error` instances. Consumers must cast (`err as { status?: number }`), which is fragile.

---

## Missing Coverage Gaps

1. **`tests/unit/renderResume.test.ts`** — only tests helpers (`formatDate`, `renderSkills`, `getDuration`). The actual `renderResume` function in `public/app.ts` has no unit tests.
2. **`tests/unit/getPhotoPath.test.ts`** — tests a copy of `getPhotoPath` imported from `utils.ts`, but `public/app.ts` has its own inline copy that is never tested.
3. **Provider coverage** — only `cohere`, `mistral`, `gemini`, `groq` are covered. Future providers (e.g., `openai`, `anthropic`, `ollama`, `openrouter` in the TS migration plan) have no types or tests.
4. **E2E hermeticity** — `tests/e2e/test-setup.ts` mocks endpoints but does not mock `fetch('/examples/demo-data.json')` or `fetch('/src/resume/output/resume-data.json')` in all specs, risking network flakiness.

---

## Test Execution Note

Unit test suite uses `tsx --test "tests/unit/**/*.test.ts"` which works, but `router.test.ts` should be skipped or fixed before asserting the suite is green.
