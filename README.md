# resumessi AI

> **resumessi** is a self-contained, AI-powered resume scoring and generation tool. It uses configurable AI models to evaluate your resume against any job description, providing an ATS score, breakdown, feedback, and missing keywords. It can also generate and polish resumes from PDF uploads, and includes a job finder with LinkedIn/Google scraping, a Kanban job dashboard, and AI cover-letter generation. And the most important, as this is for helping you trying to find your next job, it's totally free. Free AI models with limited quota but intelligent and on-demand eligibility.

> **Supported AI providers:** Configurable via `AI_INFERENCE_ORDER`. Supported providers: Cohere, Mistral, Gemini, Groq.

---

## 🚀 Quick Start

1. **Clone** the project.
2. **Run setup** — `npm run setup` creates `.env` from `.env.example` (⚠️ overwrites an existing `.env`).
3. **Complete steps from Wizard** This will setup all the API keys needed (SERP and AI providers).
4. **Start the app** — `npm start` runs the local server and opens the app in your browser.
5. **Build your resume** — Drop your existing resume in PDF format and a photo, and AI will generate a brand new one for you.
6. **Paste a Job Description** in the left panel and click **Validate JD using AI**.
7. **Start scraping for jobs** For LinkedIn it uses storage state to treat the page respectfully. For Google it uses SERP API.
8. **Apply or save jobs** Search the job that better match your preferences.
9. **Manage your needs** Job dashboard allows to control the status of the applications, it can be within the APP or outside the app.
10. **Generate a cover letter** After an ATS scan, use the **Cover Letter** button to auto-generate a tailored cover letter from the JD.

---

## 📁 Project Structure

```
resumessi/
├── public/
│   ├── main.html              # Main application (ATS Scanner + Resume Generator)
│   ├── app.ts                 # Frontend application logic
│   ├── findJob.html           # Job finder page (scraping results + Kanban dashboard)
│   ├── findJob-app.ts         # Job finder page logic
│   ├── utils.ts               # Shared frontend utilities
│   ├── utils/
│   │   ├── modal.ts           # Shared modal/toast components
│   │   ├── storage.ts         # Client-side localStorage helpers
│   │   └── types.ts           # Shared client-side types
│   ├── dist/
│   │   └── app.js             # Compiled frontend bundle (esbuild)
│   └── assets/
│       └── photos/
│           └── photo.jpg       # Default profile photo
├── src/
│   ├── resume/
│   │   ├── generate-resume.ts # AI-powered resume generator
│   │   ├── prompt.txt.example # Resume generation input template
│   │   └── output/
│   │       └── resume-data.json           # Current resume data (auto-generated)
│   ├── types/
│   │   ├── provider.ts         # Provider interfaces and config types
│   │   ├── router.ts           # Router error/result types
│   │   ├── config.ts           # Config type definitions
│   │   └── resume.ts           # Resume data types
│   ├── prompts/
│   │   ├── ats-scan.txt            # ATS scoring prompt
│   │   ├── clean-jd.txt            # JD cleaning prompt
│   │   ├── cover-letter.txt        # Cover letter generation prompt
│   │   ├── extraction.txt          # Resume extraction prompt (PDF → JSON)
│   │   ├── polish.txt              # Resume polishing prompt
│   │   ├── resume-generation.txt   # Resume generation prompt
│   │   ├── scraper-parameters.txt  # Job parameter extraction prompt
│   │   └── scraper-summarize.txt   # Scraper result summarization prompt
│   ├── scraper/
│   │   ├── google.ts           # Google (SerpAPI) scraper
│   │   ├── linkedin.ts         # LinkedIn scraper (Playwright)
│   │   ├── pagination.ts       # Search URL builder + pagination
│   │   ├── runtime-utils.ts    # Shared scraper runtime helpers
│   │   └── types.ts            # Scraper types
│   ├── storage/
│   │   ├── jobDataSqlite.ts    # SQLite-backed job data storage (active)
│   ├── providers.ts            # AI provider configuration & API logic
│   └── router.ts               # Inference router for multi-provider fallback
├── demo/
│   ├── resume-demo-data.json          # Demo resume data
│   └── demo-job-description-goat.md # Sample job description for testing
├── tests/
│   ├── e2e/                    # End-to-end tests (Playwright)
│   ├── unit/                   # Unit tests (Node.js test runner)
│   ├── fixtures/
│   │   └── resume-fixtures.ts
│   ├── pages/                  # Playwright page object models
│   ├── README.md               # Test documentation
│   └── playwright.config.ts
├── scripts/
│   ├── linkedin-auth.ts        # LinkedIn session auth helper
│   ├── run-evals.ts            # LLM evaluation harness
│   └── validate.ts             # Pre-build validation
├── start.ts                    # Dev server with /config.json endpoint
├── build.ts                    # Build script (prompt injection + esbuild frontend bundler)
├── setup.ts                    # Setup wizard
├── package.json
├── .env.example
└── AGENTS.md                   # AI agent collaboration guide
```

---

## ⚙️ Configuration

### API Keys & Inference Order

Edit `.env` (created by `npm run setup`):

```env
AI_INFERENCE_ORDER=cohere,mistral,gemini,groq

COHERE_API_KEY=your_cohere_key_here
COHERE_MODEL=command-a-reasoning-08-2025

MISTRAL_API_KEY=your_mistral_key_here
MISTRAL_MODEL=codestral-2508

GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-3.6-flash

GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

- `.env` is gitignored and served via `/config.json` at runtime.
- **Inference order:** providers are tried in the order listed in `AI_INFERENCE_ORDER`. If a provider fails, the next one is tried automatically.
- **AI API solo call** providers are also tried standalone for single API calls.
- **Inference order** vs **AI API solo call** some tasks are long such as scraping a site, obtaining JDs and rendering them. In this case inference order takes precedence. Models uses auto-fallback.

### Scraper Options

Optional overrides in `.env`:

```env
# Write debug HTML/JSON files to data/scraper-debug/ during scraping (may contain session data)
SCRAPER_DEBUG=false

# Comma-separated hostnames that accept any URL path (not just /jobs/ patterns)
SCRAPER_JOB_BOARD_HOSTS=
```

### Color Theme

Optional overrides in `.env`:

```env
ACCENT_COLOR=#2563eb       # Or preset: blue, green, purple, rose, teal, orange
PRIMARY_COLOR=#0a0a0a
SECONDARY_COLOR=#0a0a0a
TEXT_COLOR=#171717
TEXT_LIGHT_COLOR=#736868
BG_BADGE_COLOR=#f1f5f9
SUCCESS_COLOR=#0ea5e9
```
---

## 🖨️ PDF Export

Click **Download Resume** to save as PDF. The print layout is optimized for ATS parsing.

---

## 🔧 Development

### Build Step

Prompts are injected at build time to avoid CORS errors with `file://` protocol. The frontend bundle (`public/app.ts`) is compiled via **esbuild** into `public/dist/app.js`.

```bash
npm run build        # inject prompts into HTML/JS + bundle frontend with esbuild
npm run build:check  # verify prompts are up-to-date
```

**Source of truth (runtime):**
- `src/prompts/ats-scan.txt`
- `src/prompts/extraction.txt`
- `src/prompts/polish.txt`
- `src/prompts/resume-generation.txt`

After editing any prompt or frontend code, run `npm run build` before committing.

### Scripts

| Command | Description |
|---|---|
| `npm start` | Start dev server (runs build first) |
| `npm run setup` | Run setup wizard (⚠️ overwrites existing .env) |
| `npm run build` | Build prompts into HTML/JS + bundle frontend with esbuild |
| `npm run build:check` | Verify build is up-to-date |
| `npm run validate` | Run pre-build validation |
| `npm run generate` | Generate resume from prompt data |
| `npm run evals` | Run LLM evaluation harness |
| `npm run typecheck` | Run TypeScript type checks (`tsc --noEmit`) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run html:validate` | Validate HTML files |
| `npm run css:validate` | Validate CSS in HTML files |
| `npm run test:unit` | Run unit tests (`node:test`) |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run scraper:auth` | Generate/refresh LinkedIn session state |

---

## 📄 License

MIT — free to use, modify, and share.