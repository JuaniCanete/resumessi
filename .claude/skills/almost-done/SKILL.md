---
name: almost-done
description: Runs pre-commit quality gates and reviews code for anti-patterns before finalizing tasks. Use when a task is completed, when preparing to invoke task completion, or when the user explicitly requests to wrap up or finalize changes.
---

# Almost Done Quality Gate

Follow the **DASH** sequence to wrap up tasks efficiently without running redundant validations.

## Instructions

### 1. [D]ocumentation Review

- Ensure all newly implemented or modified methods and functions have proper docstrings and comments.
- Verify that the documentation clearly explains responsibilities, constraints, and relevant context.

### 2. [A]ffected Tests Only

- **Do not run the entire test suite.** The repository uses `.husky` for pre-commit and pre-push integration checks.
- Run only the specific unit or e2e tests related to the affected files to save tokens and time.

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
- Once approved, run the `commit` and `push` commands in separate turns to allow Husky hooks to validate sequentially. **Important! `--no-verify` flag is not allowed.**
- **Failure handling:** If a hook fails, automatically fix the actionable items. You have a maximum of 2 retry turns to break circular failures before asking the user for help.
