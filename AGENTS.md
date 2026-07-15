# resumessi — AI Agent Collaboration Guide

This file defines how AI assistants collaborate within the **resumessi** project.

## Project Scope

**resumessi** is a public-facing, self-contained HTML tool for:
1. **ATS Resume Scoring** — using LLM models to evaluate resumes against job descriptions.
2. **Resume Generation** — structured prompts + AI to auto-generate resume content.

---

## Agent Rules

### When working on resumessi:

1. **`.env` is the source of truth** for runtime config (API key, model, colors). The server serves `/config.json` endpoint which reads `.env`.
2. **Never hardcode personal data** into `main.html`. The resume content should be auto-generated from prompt data.

### File Ownership

| File | Purpose | Can Edit? |
|------|---------|-----------|
| `public/main.html` | Main app (template) | ✅ Yes — improve UI/UX, fix bugs |
| `.env` | Runtime config (gitignored) | ✅ Yes — add new config keys to `.env.example` |
| `.env.example` | Config template | ✅ Yes — keep in sync |
| `src/prompts/ats-scan.txt` | ATS evaluation system prompt | ✅ Yes — improve scoring logic |
| `src/prompts/resume-generation.txt` | Resume generation prompt template | ✅ Yes — improve structure |
| `README.md` | Project docs | ✅ Yes — keep updated |
| `AGENTS.md` | This file | ✅ Yes — keep updated |

---

## Config Architecture (Decisions)

**Current state:** `.env` is the single source of truth. `start.js` serves `/config.json` which reads `.env` at runtime. `main.html` fetches config via `fetch('/config.json')`.

**Target state:** ✅ Single source of truth → `.env` via server endpoint.

---

## Future Roadmap

1. ✅ Two-panel layout (left sidebar + right results panel)
2. ✅ Collapsible left sidebar + expandable right panel
3. ✅ ATS scoring via any AI API
4. ✅ `.env` as single source of truth with `/config.json` endpoint
5. ✅ Template-ize resume HTML (no hardcoded personal data)
6. ✅ AI-powered resume generation from prompt data
7. ✅ Cross-platform setup script