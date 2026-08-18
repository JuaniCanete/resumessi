# Agent Workflow Rules — resumessi

Source of truth for evert file is: @AGENTS_LOCAL.md
This file must be modified and then the rest

---

You are an AI coding agent working on the **resumessi** project.

Before starting any task:
1. Read **Local Agents Workflow** section to understand the full workflow, agent roster, conventions, and rules.
2. Follow the branch strategy, commit convention, and testing protocol defined there.
3. If the task is straightforward (docs, small fixes, proven patterns), execute directly without asking for review.
4. For complex or risky tasks, write a plan in `plans/` first, then execute.

Remember: you are part of a multi-agent setup (Antigravity, Cursor Agent, Devin, Cline, Kilo, Roo).
When in doubt, refer to AGENTS_LOCAL.md.

## Local Agents Workflow

# AGENTS_LOCAL — My Personal AI Workflow for resumessi

> **Gitignored. Not for public. This documents MY (Juani Cañete) setup only.**
> For public contributors, see `AGENTS.md`.

---

## 1. Agent Roster

| Agent | Type | Role | When to Use |
|-------|------|------|-------------|
| **Antigravity** | IDE built-in | Primary execution | First choice when quota available |
| **Cursor Agent** | IDE built-in | Primary execution | Second choice when quota available |
| **Github Copilot** | IDE built-in | Primary execution | Third choice when quota available |
| **Devin** | IDE built-in | Primary execution | Fourth choice when quota available |
| **Cline** (`saoudrizwan.claude-dev`) | Cursor extension | Coding + Planning | Daily driver, most trusted |
| **Kilo** (`kilocode.kilo-code`) | Cursor extension | Coding + Planning | Daily driver, most trusted |
| **Roo** (`RooVeterinaryInc.roo-cline`) | Cursor extension | Code review, planning sometimes coding | Use selectively for review and occasionally coding |

### Preference & Switching

- This is all user handled, it has the experience and it knows when to invoke an agent. But we can propose things like:
  - "Plan was saved to <file>. This is a great moment to ask for code review."
  - "Execution was completed. This is a great moment to ask other agents to review. <name other agents>.".

---

## 2. Workflow Pipeline

### Standard flow

1. **Plan** → write plan in `plans/<feature-name>.md`
2. **Review plan** (optional) → ask another agent if the plan is complex or risky
3. **Execute** → Implement the plan step by step.
4. **AI sloop review** → Branch readiness. No silly comments, no hallucinations, no AI sloop, no indentation violation.
5. **Coverage** → Check for outdated tests, missing coverage or breaking tests.
6. **Security** → Check for critical issues, outdated packages or OWASP10 issues.
7. **Review code** → ask Roo (or another agent) for code review.
8. **Commit and push** → This is made by Juani. He commits + pushes + switches to main + rebases from the feature branch.

### Bypassing review

- For **straightforward tasks** (docs, small fixes, proven patterns), skip code review and execute directly.
- Cursor/Antigravity/Copilot agents execute straightforward tasks without asking for review.

---

## 3. Branch Strategy

### Branch Naming

| Pattern | Purpose |
|---------|---------|
| `feature/<short-description>` | New features |
| `fix/<short-description>` | Bug fixes |
| `refactor/<short-description>` | Refactoring |
| `docs/<short-description>` | Documentation only |
| `chore/<short-description>` | Maintenance, dependencies, tooling |

**Examples:**
- `feature/ats-standarization`
- `fix/scoring-calibration`
- `docs/agents-local-setup`

### Branch Rules

- Always branch off `main` (or current stable branch).
- One branch per feature/fix.

---

## 4. Commit Convention and versioning

Suggest **Conventional Commits** to Juani once a plan/fixes/etc are completed, as he handles the commits:

```
<type>(<scope>): <description>
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation
- `refactor` — code change that neither fixes bug nor adds feature
- `chore` — maintenance, dependencies, tooling
- `test` — adding/updating tests

**Scope (suggested):**
- `ats` — ATS scoring logic
- `ui` — frontend UI
- `api` — backend/API
- `prompts` — prompt files
- `utils` — shared utilities
- `config` — configuration

**Examples:**
- `feat(ats): add standardization weights`
- `fix(ui): align score display for JD sections`
- `docs: add AGENTS_LOCAL.md`

### Commit Rules

- Commits are made by Juani.
- Suggest a version bump to Juani depending on the changes.

---

## 5. Testing Protocol

### When to Test

- Tests are handled via pre-commit hooks, so Juani runs them automatically.


### Testing Rules

- Fix existing tests rather than skipping them.
- If adding a new feature, include tests.

---

## 6. Agent Interaction Protocols

### Delegation

- **Cursor/Antigravity/Copilot/Devin**: execute directly, no handoff needed.
- **Cline/Kilo**: can work independently. Use `@` mentions to reference files.
- **Roo**: assign explicitly: *"Please review [file/PR] for [concern]"*. Provide context.

### Context Handoff Between Agents

- **Plans**: write in `plans/`. Include enough detail for another agent to execute.
- **State**: if switching agents mid-task, leave a brief summary at top of task file or in a note.
- **Branching**: commit before switching agents, so work is preserved.

### Review Requests

- For code review: ask Roo or an independent agent (not the one who wrote the code).
- For plan review: ask any agent with capacity.
- Provide agents with **minimal but complete context** — don't dump entire codebase.

### Sign-off

- While working on plans, agents should sign off their contributions, such as: Planned by, Reported by, Fixed by, and so on.

### Code Review Output

- Always write code review results to `code-review/<feature-name>.md`.
- Follow the guidelines in `REVIEW.md`.


---

## 7. IDE Switching Rules

### Antigravity IDE

- Preferred when quota available.
- Workspace rules in `.agents/rules/workflow.md`.
- Uses Antigravity models by default.
- Plans often go in `plans/` as in Cursor.

### VSCode with Github Copilot

- Only when quota available.
- Workspace rules in `.agents/copilot-instructions.md`.
- Uses Copilot models by default.

### Devin IDE

- Only when quota available.
- Workspace rules in `.devin/rules/workflow.md`.

### Cursor IDE

- Default daily driver.
- Workspace rules in `.cursor/rules/agents-workflow.mdc`.
- Uses extensions: Cline, Kilo, Roo, plus built-in agent.
- Quota may limit built-in agent; extensions can use different model providers.

### Switching

- If one IDE runs out of quota or is slow, switch to the other.
- Both IDEs share the same repository and `plans/` folder.
- No special migration needed besides opening the folder in the other IDE.

---

*Updated: 2025-07-28*