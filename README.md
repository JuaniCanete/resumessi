# resumessi AI

> **resumessi** is a self-contained, AI-powered resume scoring and generation tool. It uses configurable AI models to evaluate your resume against any job description, providing an ATS score, breakdown, feedback, and missing keywords. It can also generate and polish resumes from PDF uploads.

> **Supported AI providers:** Google Gemini (primary) and Groq (fallback). Other providers (OpenAI, Anthropic, etc.) are not currently supported.

---

## 🚀 Quick Start

1. **Clone or download** this folder.
2. **Run setup** — `npm run setup` creates `.env` from `.env.example`.
3. **Edit `.env`** and add your AI API key.
4. **Start the app** — `npm start` runs the local server and opens the app in your browser.
5. **Build your resume** — Drop your existing resume in PDF formant and a photo and AI would generated a brand new one.
6. **Paste a Job Description** in the left panel and click **Validate JD using AI**.'

---

## 📁 Project Structure

```
resumessi/
├── public/
│   ├── main.html              # Main application (ATS Scanner + Resume Generator)
│   └── assets/
│       └── photos/
│           └── photo.jpg       # Default profile photo
├── src/
│   ├── resume/
│   │   ├── generate-resume.js   # AI-powered resume generator
│   │   ├── prompt.txt            # Resume generation input template
│   │   └── output/
│   │       ├── resume-data.json           # Current resume data (auto-generated)
│   │       └── resume-data-AI-polished.json # Polished version
│   └── prompts/
│       ├── ats-scan.txt            # ATS scoring prompt
│       ├── extraction.txt          # Resume extraction prompt (PDF → JSON)
│       ├── polish.txt              # Resume polishing prompt
│       └── resume-generation.txt   # Resume generation prompt
├── examples/
│   ├── demo-data.json          # Demo resume data
│   └── job-description-goat.md # Sample job description for testing
├── tests/
│   ├── e2e/                    # End-to-end tests (Playwright)
│   ├── unit/                   # Unit tests (Node.js test runner)
│   ├── fixtures/
│   │   └── resume-fixtures.js
│   ├── README.md               # Test documentation
│   └── playwright.config.js
├── scripts/
│   └── run-evals.js            # LLM evaluation harness
├── start.js                    # Dev server with /config.json endpoint
├── build.js                    # Build script (prompt injection for CORS)
├── setup.js                    # Setup wizard
├── package.json
├── .env.example
└── AGENTS.md                   # AI agent collaboration guide
```

---

## ⚙️ Configuration

### API Key & Models

Edit `.env` (created by `npm run setup`):

```env
AI_API_KEY=your_api_key_here
AI_MODEL=gemini-2.5-flash
AI_FALLBACK_MODEL=llama-3.3-70b-versatile
AI_FALLBACK_API_KEY=your_fallback_api_key_here
ACCENT_COLOR=#2563eb
```

- `.env` is gitignored and served via `/config.json` at runtime.
- **Fallback provider:** if the primary provider fails, the system retries automatically with the fallback provider (e.g. Groq) and shows a "(fallback)" indicator in the results.

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

Click **Download Resume** to print/save as PDF. The print layout is optimized for ATS parsing.

---

## 🔧 Development

### Build Step

Prompts are injected at build time to avoid CORS errors with `file://` protocol.

```bash
npm run build        # inject prompts into HTML/JS
npm run build:check  # verify prompts are up-to-date
```

**Source of truth (runtime):**
- `src/prompts/ats-scan.txt`
- `src/prompts/extraction.txt`
- `src/prompts/polish.txt`
- `src/prompts/resume-generation.txt`

After editing any prompt, run `npm run build` before committing.

### Scripts

| Command | Description |
|---|---|
| `npm start` | Start dev server |
| `npm run setup` | Run setup wizard |
| `npm run build` | Build prompts into HTML/JS |
| `npm run build:check` | Verify build is up-to-date |
| `npm run generate` | Generate resume from prompt |

---

## 📄 License

MIT — free to use, modify, and share.
