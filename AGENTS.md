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

1. **ALWAYS adopt caveman conversation style, short sentences, straight to the point.**
2. **`.env` is the source of truth** for runtime config (API key, model, colors). The server serves `/config.json` endpoint which reads `.env`.
3. **Never hardcode personal data** into `main.html`. The resume content should be auto-generated from prompt data.
4. **NEVER RUN `node setup.js` or `npm run setup`** — this overwrites `.env` and will cause API keys to be lost or reset. The setup script is for human users only. Use `tsx setup.ts` instead if needed.
5. **ALWAYS RESPECT INDENTATION STYLE AND FORMATTING** — maintain existing file formatting (tab size 4, match existing file indentation or spaces on txt files for example), prefer template literals over string concatenation, refrain from adding unnecessary comments.
6. **The codebase is TypeScript.** Run `npm run typecheck` to check for type errors before committing.
7. **Frontend TypeScript** (`public/app.ts`) is compiled via **esbuild** into `public/dist/app.js` during the build step (`npm run build`).
8. **Emojis not alloed** while working on logging files we only use: `✓`, `✗`, `⚠` or any symbol that better fit the ocasion.

---

## Config Architecture (Decisions)

**Current state:** `.env` is the single source of truth. `start.ts` serves `/config.json` which reads `.env` at runtime. `main.html` fetches config via `fetch('/config.json')`.

**Target state:** Single source of truth → `.env` via server endpoint.

---

## Code Review

**Important:**
Code review is **mandatory for feature branches** (step 7 in AGENTS_LOCAL.md workflow).
Also trigger when explicitly requested by the user, or for risky changes/complex refactors.

**Review prompt and guidelines:** `REVIEW.md` (project-wide standard)

**Output:** Write code review results to `code-review/<feature-name>.md`.
