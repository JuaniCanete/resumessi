# resumessi — AI Agent Collaboration Guide

This file defines how AI assistants collaborate within the **resumessi** project.

## Project Scope

**resumessi** is a public-facing, self-contained HTML tool for:
1. **ATS Resume Scoring** — using LLM models to evaluate resumes against job descriptions.
2. **Resume Generation** — structured prompts + AI to auto-generate resume content.

---

## Agent Rules

### When working on resumessi:

1. **ALWAYS adopt caveman conversation style.**
2. **`.env` is the source of truth** for runtime config (API key, model, colors). The server serves `/config.json` endpoint which reads `.env`.
3. **Never hardcode personal data** into `main.html`. The resume content should be auto-generated from prompt data.
4. **NEVER RUN `node setup.js` or `npm run setup`** — this overwrites `.env` and will cause API keys to be lost or reset. The setup script is for human users only. Use `tsx setup.ts` instead if needed.
5. **ALWAYS RESPECT INDENTATION STYLE AND FORMATTING** — maintain existing file formatting (tab size 4, match existing file indentation or spaces on txt files for example), refrain from adding unnecessary comments.
6. **The codebase is TypeScript.** Run `npx tsc --noEmit` or `npm run typecheck` to check for type errors before committing.
7. **All server/scripts code runs via `tsx`** — use `tsx` to execute `.ts` files directly (e.g., `tsx start.ts`, `tsx build.ts`).
8. **Frontend TypeScript** (`public/app.ts`) is compiled via **esbuild** into `public/dist/app.js` during the build step (`npm run build`).

### File Ownership

| File | Purpose | Can Edit? |
|------|---------|-----------|
| `public/main.html` | Main app (template) | ✅ Yes — improve UI/UX, fix bugs |
| `public/utils.ts` | Shared utility functions (TS) | ✅ Yes — add helpers, fix bugs |
| `public/app.ts` | Frontend application logic (TS) | ✅ Yes — improve UI logic |
| `public/dist/app.js` | Compiled frontend bundle | ❌ No — auto-generated |
| `.env` | Runtime config (gitignored) | ✅ Yes — add new config keys to `.env.example` |
| `.env.example` | Config template | ✅ Yes — keep in sync |
| `src/providers.ts` | AI provider configuration & API logic (TS) | ✅ Yes — add providers, fix bugs |
| `src/router.ts` | Inference router for multi-provider fallback (TS) | ✅ Yes — improve fallback logic |
| `src/types/` | TypeScript type definitions | ✅ Yes — add/improve types |
| `src/prompts/ats-scan.txt` | ATS evaluation system prompt | ✅ Yes — improve scoring logic |
| `src/prompts/resume-generation.txt` | Resume generation prompt template | ✅ Yes — improve structure |
| `src/prompts/extraction.txt` | Resume extraction prompt (PDF → JSON) | ✅ Yes — improve extraction logic |
| `src/prompts/polish.txt` | Resume polishing prompt | ✅ Yes — improve polish quality |
| `start.ts` | Dev server with /config.json endpoint (TS) | ✅ Yes — fixes only |
| `build.ts` | Build script + esbuild frontend bundler (TS) | ✅ Yes — fixes only |
| `setup.ts` | CLI setup wizard (TS) | ⚠️ Yes — but NEVER run automatically |
| `scripts/validate.ts` | Pre-build validation (TS) | ✅ Yes — keep in sync with prompts |
| `scripts/run-evals.ts` | LLM evaluation harness (TS) | ✅ Yes — improve validation |
| `scripts/linkedin-auth.ts` | LinkedIn session auth helper (TS) | ✅ Yes — generate/refresh session state |
| `src/scraper/` | LinkedIn & Google scraper modules (TS) | ✅ Yes — core scraper logic & types |
| `src/prompts/scraper-summarize.txt` | Scraper LLM summarization prompt | ✅ Yes — improve summary structure |
| `public/results.html` | Standalone job scraper results view | ✅ Yes — improve UI/UX |
| `public/results-app.ts` | Standalone results page logic (TS) | ✅ Yes — improve paginated view |
| `Dockerfile.scraper` | CI Dockerfile for Playwright Chrome | ✅ Yes — maintain container setup |
| `data/storage-state/` | Saved LinkedIn session cookies | ❌ No — auto-generated (gitignored) |
| `data/scraper-results/` | Saved scraper output (linkedin.json, google.json) | ❌ No — auto-generated (gitignored) |
| `README.md` | Project docs | ✅ Yes — keep updated |
| `AGENTS.md` | This file | ✅ Yes — keep updated |

---

## Config Architecture (Decisions)

**Current state:** `.env` is the single source of truth. `start.ts` serves `/config.json` which reads `.env` at runtime. `main.html` fetches config via `fetch('/config.json')`.

**Target state:** ✅ Single source of truth → `.env` via server endpoint.

---

## Code Review

**Important:**
Trigger this only when the user ask to code review.

**Review prompt and guidelines:** `REVIEW.md` (project-wide standard)

**Output:** Write code review results to `code-review/<feature-name>.md`.
