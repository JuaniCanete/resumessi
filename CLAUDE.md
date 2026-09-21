# resumessi — AI Agent Collaboration Guide

This file defines how AI assistants collaborate within the **resumessi** project.

## Project Scope

**resumessi** is a public-facing, self-contained application for:

1. **ATS Resume Scoring** — using LLM models to evaluate resumes against job descriptions.
2. **Resume Generation** — structured prompts + AI to auto-generate resume content.
3. **Job Finder & Scraping** — LinkedIn (Playwright) and Google (SerpAPI) job scraping with pagination.
4. **Job Dashboard** — Kanban board to track application status, interview rounds, and notes.
5. **Cover Letter Generation** — AI-generated cover letters from a job description.

---

## Agent Rules

### When working on resumessi:

1. **`.env` is the source of truth** for runtime config (API key, model, colors). The server serves `/config.json` endpoint which reads `.env`.
2. **Never hardcode personal data** into `main.html`. The resume content should be auto-generated from prompt data.
3. **NEVER RUN `node setup.js` or `npm run setup`** — this overwrites `.env` and will cause API keys to be lost or reset. The setup script is for human users only.
4. **ALWAYS RESPECT INDENTATION STYLE AND FORMATTING** — maintain existing file formatting (tab size 4, match existing file indentation or spaces on txt files for example), prefer template literals over string concatenation, refrain from adding unnecessary comments.
5. **The codebase is TypeScript.** Run `npm run typecheck` to check for type errors before committing.
6. **Frontend TypeScript** (`public/app.ts`) is compiled via **esbuild** into `public/dist/app.js` during the build step (`npm run build`).
7. **Emojis not alloed** while working on logging files we only use: `✓`, `✗`, `⚠` or any symbol that better fit the ocasion.

---

## Config Architecture (Decisions)

**Current state:** `.env` is the single source of truth. `start.ts` serves `/config.json` which reads `.env` at runtime. `main.html` fetches config via `fetch('/config.json')`.

**Target state:** Single source of truth → `.env` via server endpoint.

---

## Code Review

**Important:**
Code review is a skill located at `.claude/skills/code-review/SKILL.md`.
Use the `skill` tool to load it: `skill("code-review")`.

---

## Code readiness

**Important:**
Project has `.husky` `pre-commit` and `pre-push`, both are running a lot of validation, so don't waste time and tokens running things fixing something, focus on what you need to fix, and then once it's focus attempt to commit and push, and that's the place where we get feedback on the status of the code.

### Simulation scenario: **e2e test failure un CI within PR**

1. Failure is triaged and reviewed
2. Fix is proposed and applied
3. Test is executed
4. Stop. Don't continue wiht unit, eslint, typecheck, etc.
5. Instead proceed with commit and push, and `.husky` will take care of the validations.

---

## Debbuging

**Important:**
Within `.env` you'll find `VERBOSE_DEBUG` and `SCRAPER_DEBUG`, if they are not present you can copy them from `.env.example`. Both values should be set on `true`. Any ongoing session should be restarted after adding these values. These files are .gitignored.

**VERBOSE_DEBUG:** Write session CLI logs to debugging/logs/ and scraper artifacts to debugging/scraper/
**SCRAPER_DEBUG:** Write debug HTML/JSON to debugging/scraper/<source>-<timestamp>/ (opt-in)
