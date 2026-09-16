---
name: almost-done
description: Runs pre-commit quality gates and reviews code for anti-patterns before finalizing tasks. Use when a task is completed, when preparing to invoke task completion, or when the user explicitly requests to wrap up or finalize changes.
---

# Almost Done Quality Gate

Follow the **DASH** sequence to wrap up tasks efficiently without running redundant validations.

## When to Use This Skill

✅ **USE when:**

- All implementation work is complete
- All related tests pass (e2e + unit)
- `npm run lint && npm run typecheck && npm run build` all pass
- You are about to commit/push and want the final quality gate
- User says "wrap up", "finalize", "ready to commit", or similar

❌ **DO NOT USE when:**

- Actively debugging test failures
- Mid-refactor with broken tests
- Still adding/removing features
- Running partial test suites to verify fixes

## Agent Auto-Detection Hint

If you just completed a task and:

- `npm run test:e2e` → passing
- `npm run test:unit` → passing
- `npm run lint` → clean
- `npm run typecheck` → clean
- `npm run build` → clean

**→ This skill is for you. Load it now.**

## Instructions

### 1. [D]ocumentation Review

- Ensure all newly implemented or modified methods and functions have proper docstrings and comments.
- Verify that the documentation clearly explains responsibilities, constraints, and relevant context.

### 2. [A]ffected Tests Only

- Run **only tests related to changed files** (unit + e2e) for fast feedback on your changes.
- Do not run the entire test suite — husky pre-push runs the full validation (`test:e2e`, `test:unit`, `lint`, `typecheck`, `build`).
- If affected tests fail, fix and re-run. Do not proceed until they pass.

### 3. [S]ummary Generation

- Do not use internal agent issue IDs when communicating with the user.
- Generate a human-readable Markdown table detailing the implemented changes.
- **Format:**
  | ID               | Summary    | Description              |
  | ---------------- | ---------- | ------------------------ |
  | [C/H/M/L/T][1-9] | Short name | Brief impact explanation |
- **ID Legend (Ranked):** `C` (Critical), `H` (High), `M` (Medium), `L` (Low), `T` (Trivial). Sort the table from Critical to Trivial.

### 4. [H]uman Agreement & Execution

- Present the Summary table to the user and ask for explicit approval.
- **Wait for the user's green light.** Do not invoke commit or push automatically.
- Once approved, run the `commit` and `push` commands in separate turns to allow Husky hooks to validate sequentially.
- **CRITICAL: `--no-verify` flag is NEVER allowed.** Only the user can explicitly approve bypassing husky hooks. Agents must never use it.
- **Failure handling:** If a hook fails, automatically fix the actionable items. You have a maximum of 2 retry turns to break circular failures before asking the user for help.
- **After each fix:** Rerun affected tests, regenerate the change summary, and obtain explicit user approval before the next commit or push attempt.

## Completion Signal

When all DASH steps pass and user approves the summary table:

1. Stage only explicitly approved files: `git add -- <approved-paths>`
2. Review the staged diff: `git diff --staged`
3. Run `git commit -m "<message>"` (no `--no-verify`)
4. Run `git push origin <branch>`
5. If husky hooks fail → apply fix → rerun tests → regenerate summary → get approval → retry (max 2)
6. Report PR URL or push status to user
