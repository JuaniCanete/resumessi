# CONSOLIDATION_REVIEW.md

Review of TypeScript migration + Playwright audit. Issues grouped by impact.

---

## Methodology

- **accept** — Issue is real and impacts code quality or correctness
- **reshape** — Issue needs more info or is speculative
- **reject** — Issue is not valid or out of scope

---

## 1. Critical — Stops Merge

### 1. Playwright E2E tests fail with multiple workers
**File:** `tests/playwright.config.ts:19`

`cmd.exe /c "tsx ..\\start.ts"` fails on Windows because `tsx` is not in `cmd.exe` PATH. After fixing the command, 4 workers still time out on this Windows machine due to browser resource contention.

**Decision:** accept  
**Fix:** 
- Change web server command to `npx tsx ..\\start.ts --no-open` so `cmd.exe` can resolve `tsx` via `npx`.
- Add `NODE_ENV=test` to the web server env to suppress browser pop-up.
- Reduce `workers: 4` to `workers: 1` on Windows CI, or set appropriate `timeout` values.

---

## 2. Major — Needs Fix Before Merge

### 2. `AI_INFERENCE_ORDER` silently dropped from `/config.json`
**File:** `start.ts:81`

`parseEnvFile()` only preserves keys in its hardcoded initializer or keys containing `COLOR`. `AI_INFERENCE_ORDER` is stripped, so the frontend always shows the hardcoded provider list. Custom inference order from `.env` is ignored at runtime.

**Decision:** accept  
**Fix:**
```typescript
if (Object.prototype.hasOwnProperty.call(env, key) || key.includes('COLOR') || key === 'AI_INFERENCE_ORDER') {
  env[key] = value;
}
```

### 3. `response.json()` parsed before `response.ok` check
**File:** `src/providers.ts:54-59`

`await response.json()` runs unconditionally on error responses. If a provider returns HTML (e.g., 502 gateway page), `response.json()` throws `SyntaxError`, bypassing the intended HTTP error handling.

**Decision:** accept  
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

### 4. Empty catch swallows parse errors silently
**File:** `src/providers.ts:179`

`catch { text = '' }` masks any parsing error. If a provider changes its response shape, the caller gets empty text with no log and no throw.

**Decision:** accept  
**Fix:**
```typescript
} catch (err) {
  console.error('parseResponse error for', provider, err);
  throw err;
}
```

### 5. `tsconfig.json` missing `tests/**/*.ts`
**File:** `tsconfig.json:22-29`

`include` array has `src`, `public`, `scripts`, and root `.ts` files, but no `tests`. Type errors in tests pass silently.

**Decision:** accept  
**Fix:** Add `"./tests/**/*.ts"` to the `include` array.

### 6. Duplicate `escHtml` with divergent null semantics
**Files:** `public/app.ts:264-268`, `public/utils.ts:5-10`

Production copy returns `''` for nullish input; shared utility returns `'null'` / `'undefined'`. Tests import from `utils.ts` and validate the literal-string behavior. Not a runtime bug, but creates a maintenance hazard.

**Decision:** accept  
**Fix:** Remove the local `escHtml` from `public/app.ts:264-268` and import the shared export from `public/utils.ts`. Update tests to expect `''` for nullish input.

---

## 3. Medium — Nice to Fix

### 7. Stale misleading comment in `.husky/pre-commit`
**File:** `.husky/pre-commit:11`

`# Yet missing API checks` is a leftover working note that is no longer actionable.

**Decision:** accept  
**Fix:** Remove or replace with a concrete note about what is intentionally excluded.

### 8. Comment drift — old `.js` references
**Files:** `.env:2`, `tests/README.md:26-45,56`, `src/resume/prompt.txt.example:2`

Comments still reference `setup.js`, `generate-resume.js`, `.test.js`, and `playwright.config.js` instead of `.ts` equivalents.

**Decision:** accept  
**Fix:** Update comments to reference `.ts` filenames.

### 9. Pre-commit hook lacks `npm run build`
**File:** `.husky/pre-commit`

Runs `typecheck`, `lint`, `test:unit`, `html:validate`, `css:validate`, `test:e2e`, `evals` but NOT `npm run build`. Frontend bundle artifacts can drift from source.

**Decision:** accept  
**Fix:** Add `npm run build` (or `npm run build:check`) after `typecheck` and before tests.

### 10. Pre-commit hook runs slow checks on every commit
**File:** `.husky/pre-commit:20-21`

`npm run test:e2e` (Playwright) and `npm run evals` are slow and require browser/API keys. They belong in CI, not local pre-commit.

**Decision:** accept  
**Fix:** Move `npm run test:e2e` and `npm run evals` to CI pipeline. Keep pre-commit fast (<30s).

---

## 4. Minor — Can Be Postponed

### 11. Test-only type in runtime code
**File:** `start.ts:406`

`globalThis.NodeJS.ErrnoException` is a Node.js types-only namespace used in runtime code.

**Decision:** accept  
**Fix:** Use `NodeJS.ErrnoException` without `globalThis.`, or use a simpler `Error | null`.

### 12. `build.ts` lazy regex captures only first fenced block
**File:** `build.ts:31`

`const match = content.match(/```\r?\n([\s\S]*?)```/);` stops at the first closing fence. If a prompt file ever contains multiple fenced blocks (e.g., JSON example before the main prompt), only the first one is extracted.

**Decision:** accept — latent risk, no current prompt file triggers this.  
**Fix:** Use a greedy match or target a specific fence count when prompt file conventions allow.

---

## Unfixed Items from Prior Reviews (Carryover)

| Issue | Severity | Status |
|-------|----------|--------|
| #6 tsconfig missing `tests/**/*.ts` | medium | Still missing |
| #10 Duplicated `escHtml` | low | Still duplicated |
| #12 Inconsistent error shapes | low | Still throws plain objects |

---

## Rejected Items

### RR1. Outdated Git Hooks
**Source:** CONSOLIDATION_REVIEW.md #8

Verified `.husky/pre-commit` exists and contains valid validation commands.

**Decision:** reject

### RR2. Type Safety: `checkJs: false`
**Source:** CONSOLIDATION_REVIEW.md #15

`allowJs: false` prevents JS compilation, so `checkJs: false` is harmless.

**Decision:** reject — no action needed

### RR3. Unused state variables
**Source:** CONSOLIDATION_REVIEW.md #9

Not found in current `public/app.ts`. Either never existed or were already removed.

**Decision:** reject — not present in current code

---

## Summary

| Decision | Count |
|----------|-------|
| Accept   | 10    |
| Reject   | 3     |

### Must-fix before merge
1. Fix Playwright webServer command + reduce workers to 1 on Windows CI
2. Allow `AI_INFERENCE_ORDER` through `parseEnvFile` in `start.ts`
3. Gate `response.json()` behind `response.ok` in `src/providers.ts`
4. Log and rethrow in empty catch in `src/providers.ts:179`
5. Add `./tests/**/*.ts` to `tsconfig.json` include
6. De-duplicate `escHtml` and align tests

### Pre-commit improvements
1. Add `npm run build` (or `build:check`)
2. Move `npm run test:e2e` and `npm run evals` to CI only
3. Remove stale `# Yet missing API checks` comment
