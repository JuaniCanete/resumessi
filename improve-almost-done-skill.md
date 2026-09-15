# Prompt: Improve `almost-done` Skill Adoption & Clarity

## Context

The `almost-done` skill (`.claude/skills/almost-done/SKILL.md`) is well-composed for its purpose (final validation gate), but **was not invoked** during a session where it would have been the perfect fit at the end (all tests passing, lint/typecheck/build clean, ready to commit). The agent worked through the session in "debug/fix/verify" mode and only manually ran the validations the skill automates.

## Problem

- **Trigger ambiguity**: The skill says "Use when... the user explicitly requests to wrap up" - but agents don't wait for explicit "wrap up" if the work is objectively done.
- **No anti-pattern warning**: Agents may try to use it during active debugging (wrong phase).
- **No auto-hint**: No signal that "if tests are green + validations clean → this skill applies."
- **DASH steps could reference actual commands** run in this repo.

## Required Changes to `.claude/skills/almost-done/SKILL.md`

### 1. Add explicit "When to Use" section (before Instructions)

```markdown
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
```

### 2. Add "Auto-Hint" for Agents

```markdown
## Agent Auto-Detection Hint

If you just completed a task and:

- `npm run test:e2e` → 88 passed
- `npm run test:unit` → 400+ passed
- `npm run lint` → clean
- `npm run typecheck` → clean
- `npm run build` → clean

**→ This skill is for you. Load it now.**
```

### 3. Update DASH Steps with Repo-Specific Commands

In **Step 2 [A]ffected Tests Only**, add:

````markdown
- Run the project's full validation suite (required for this repo):
  ```bash
  npm run test:e2e && npm run test:unit && npm run lint && npm run typecheck && npm run build
  ```
````

- If any fail, fix and re-run. Do not proceed until all pass.

````

### 4. Strengthen Failure Handling (already fixed in #1, keep it)
The fix we applied: "After each fix: rerun affected tests, regenerate summary, get approval before next commit/push" - keep this.

### 5. Add "Completion Signal"
```markdown
## Completion Signal

When all DASH steps pass and user approves the summary table:
1. Run `git add -A && git commit -m "<message>"` (no `--no-verify`)
2. Run `git push origin <branch>`
3. If husky hooks fail → apply fix → rerun tests → regenerate summary → get approval → retry (max 2)
4. Report PR URL or push status to user
````

## Deliverable

Update `.claude/skills/almost-done/SKILL.md` with the above changes. Keep the existing DASH structure - only enhance clarity, triggers, and repo-specific commands.
