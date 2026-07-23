# KILO_REVIEW.md

Review of CONSOLIDATION_REVIEW.md implementation + pre-commit hook audit.

---

## What Was Already Fixed (from CONSOLIDATION_REVIEW.md)

| Issue | Status |
|-------|--------|
| #1 Router test mocks via injection | ✅ Fixed |
| #2 Regex crash in extraction.test.ts | ✅ Fixed |
| #3 .env.example invalid syntax | ✅ Fixed |
| #4 README updated with TS paths | ✅ Fixed |
| #5 start.ts static imports | ✅ Fixed |
| #7 18 lint errors | ✅ Fixed (lint passes clean) |
| #8 Comment drift (.js refs) | ✅ Fixed |
| #9 Unused vars/imports | ✅ Fixed |

---

## New Findings

### HIGH — `start.ts`: `AI_INFERENCE_ORDER` silently dropped from `/config.json`

**Files:** `start.ts:48-87`, `start.ts:93-109`

`parseEnvFile()` builds its keyset from a hardcoded inner object plus any key containing `'COLOR'`. `AI_INFERENCE_ORDER` matches neither, so it is silently stripped. The endpoint then falls back to the hardcoded default `'cohere,mistral,gemini,groq'`, ignoring any custom order the user placed in `.env`.

The fix attempted at line 81 (`key.includes('COLOR')`) only anticipates color overrides, missing the inference order variable entirely.

```typescript
// start.ts:71-84 — line 73 only allows 'COLOR' keys past the initializer
if (Object.prototype.hasOwnProperty.call(env, key) || key.includes('COLOR')) {
  env[key] = value;
}
```

This means:
- Frontend provider selection in `public/app.ts:1049-1053` shows only the hardcoded default providers
- `availableProviders` and `primaryProvider` in the client config are wrong
- Custom inference ordering from `.env` is completely ignored at runtime

**Fix:** Add `AI_INFERENCE_ORDER` to the allowlist:
```typescript
if (Object.prototype.hasOwnProperty.call(env, key) || key.includes('COLOR') || key === 'AI_INFERENCE_ORDER') {
```

---

### MEDIUM — `src/providers.ts:179`: Empty catch swallows parse errors silently

**File:** `src/providers.ts:179`

```typescript
} catch {
  text = '';
}
```

The `parseResponse` function catches all errors with a bare catch and returns empty text. If a provider changes its response shape, or the network returns HTML/error pages, the failure is silently masked — the caller gets `{ text: '' }` with no log and no throw. Debugging this is extremely hard.

**Fix:** At minimum log the error, and consider letting it propagate:
```typescript
} catch (err) {
  console.error('parseResponse error for', provider, err);
  throw err;
}
```

---

### MEDIUM — `src/providers.ts:57-59`: `response.json()` parsed before `response.ok` check

**File:** `src/providers.ts:54-59`

```typescript
const data = await response.json();   // line 54 — runs unconditionally
const parsed = parseResponse(provider, data);

if (!response.ok) {                   // line 57 — status check happens AFTER
  const errorMsg = data?.error?.message || data?.error || `HTTP ${response.status}`;
  throw { status: response.status, error: errorMsg, provider };
}
```

If a provider returns HTML (e.g. a 502 gateway page) or plain text on error, `response.json()` throws `SyntaxError`. This bypasses the intended HTTP error handling and surfaces an unhelpful parse error to the user. The `response.ok` check should gate the body parsing.

**Fix:**
```typescript
if (!response.ok) {
  let errorMsg = `HTTP ${response.status}`;
  try { const errData = await response.json(); errorMsg = errData?.error?.message || errData?.error || errorMsg; } catch { /* ignore */ }
  throw { status: response.status, error: errorMsg, provider };
}
const data = await response.json();
const parsed = parseResponse(provider, data);
```

---

### MEDIUM — `tsconfig.json`: `tests/**/*.ts` still missing from `include`

**File:** `tsconfig.json:22-29`

`tsc --noEmit` does not type-check any test files. Type errors in test mocks, fixtures, or new test code pass silently. This was flagged in the consolidation review as issue #6 but remains unfixed.

**Fix:** Add `"./tests/**/*.ts"` to the `include` array.

---

### LOW — Duplicated `escHtml` with divergent null semantics

**Files:** `public/app.ts:264-268`, `public/utils.ts:5-10`

```typescript
// app.ts (used everywhere in production)
function escHtml(str: string | null | undefined): string {
  if (!str) return '';      // null/undefined → ''
}

// utils.ts (used by tests)
export function escHtml(value: string | null | undefined): string {
  if (value === null) return 'null';      // null → 'null'
  if (value === undefined) return 'undefined';  // undefined → 'undefined'
}
```

The shared utility returns `'null'` / `'undefined'` for nullish inputs, while the frontend copy returns `''`. Tests import from `utils.ts` and validate the `'null'` / `'undefined'` behavior. This isn't a runtime bug (only `app.ts`'s copy runs in production), but the duplicate creates a maintenance hazard — a future change to either copy may not propagate to the other.

**Fix:** Use the shared `utils.ts` export everywhere and update tests to expect `''` for nullish input.

---

### LOW — `start.ts:406`: Test-only type in runtime server code

**File:** `start.ts:406`

```typescript
fs.readFile(filePath, (err: globalThis.NodeJS.ErrnoException | null, data: Buffer) => {
```

`NodeJS.ErrnoException` is a Node.js types-only namespace, used here for type-checking only. It's harmless at runtime but signals that the author was treating runtime code as if it were test code. Acceptable but untidy.

**Fix:** Use `NodeJS.ErrnoException` without `globalThis.` (it's a global type) or use a simpler `Error | null`.

---

### LOW — `build.ts:31`: `readPromptBlock` only captures first fenced code block

**File:** `build.ts:28-37`

```typescript
const match = content.match(/```\r?\n([\s\S]*?)```/);
```

The lazy `*?` stops at the first ` ``` `. If a prompt file ever contains multiple fenced blocks (e.g., a JSON example block before the main prompt block), only the first one is extracted. Currently no prompt file triggers this, but it's a latent risk for anyone who edits prompt files.

---

## Pre-Commit Hook Review

**File:** `.husky/pre-commit`

**What it runs:**
1. `npm run typecheck` — TypeScript type checking
2. `npm run lint` — ESLint
3. `npm run test:unit` — Unit tests (85 passing)
4. `npm run html:validate` — HTML validation
5. `npm run css:validate` — CSS validation
6. `npm run test:e2e` — Playwright E2E
7. `npm run evals` — LLM evaluation harness

**Assessment:** The hook covers code quality, types, tests, and frontend validation. It's correct and sequential — each phase gates the next with `set -e`.

**Gaps and improvements:**

1. **No `npm run build` check.** Already-built artifacts (`public/dist/app.js`) can drift from `public/app.ts`. The hook should run `npm run build:check` (which calls `build.ts --check`) and fail if the bundle is out of date. This is the single highest-impact missing check.

2. **Stale misleading comment.** Line 11 reads `# Yet missing API checks` — this appears to be a leftover working note. Either remove it or replace it with a concrete note about what's intentionally excluded (e.g., live API calls, which can't safely run in CI without secrets).

3. **No lint-staged hookup.** `package.json` defines `lint-staged` config (`lint-staged` v15 is installed), but there's no Husky `prepare` script wiring it. The pre-commit runs full `eslint .` (good), but staged-file-only lint-fix would be faster. Add `"prepare": "husky"` to `package.json` scripts and ensure `npx husky add .husky/pre-commit ...` uses `npx lint-staged` for the lint phase.

4. **E2E tests in pre-commit are slow.** Playwright tests can take 30-60s and require browser binaries. Consider making them conditional on `CI=true` or running them only on push to main/PR via a separate GitHub Action rather than on every commit.

5. **No `.env` validation.** The `.env` file is gitignored but the `.env.example` should be validated (syntax format) — it's the template that users copy. A simple `node -e "require('dotenv').config({ path: '.env.example' })"` check would catch invalid lines like the one that was just fixed.

---

## Unfixed Items from CONSOLIDATION_REVIEW.md (Carryover)

| Issue | Severity | Status |
|-------|----------|--------|
| #6 tsconfig missing `tests/**/*.ts` | medium | Still missing |
| #10 Duplicated `escHtml` | low | Still duplicated |
| #12 Inconsistent error shapes (plain objects) | low | Still throws `{ status, error, provider }` objects |
| #15 `checkJs: false` | low | Acceptable since `allowJs: false` |

---

## Overall Verdict

The migration is substantially cleaned up: all high-priority issues are fixed, lint passes, all 85 unit tests pass. The two new findings (`AI_INFERENCE_ORDER` silent truncation in `start.ts` and the parse-before-ok ordering in `providers.ts`) should be addressed before the next merge — the first is a real behavioral bug, the second is a latent crash risk.
