# resumessi AI

> **resumessi** is a self-contained, AI-powered resume scoring and generation tool. It uses configurable AI models (Gemini, OpenAI, etc.) to evaluate your resume against any job description, providing an ATS score, breakdown, feedback, and missing keywords. It can also generate and polish resumes from PDF uploads.

---

## 🚀 Quick Start

1. **Clone or download** this folder.
2. **Run setup** — `npm run setup` creates `.env` from `.env.example`.
3. **Edit `.env`** and add your AI API key.
4. **Start the app** — `npm start` runs the local server and opens the app in your browser.
5. **Paste a Job Description** in the left panel and click **Validate JD using AI**.

---

## 📁 Project Structure

```
resumessi/
├── pages/
│   ├── main.html              # Main application (ATS Scanner + Resume Generator)
│   └── how-it-works.html      # How it works explainer page
├── resume_generation/
│   ├── resume-data.json        # Current resume data (auto-generated or manual)
│   ├── resume-data-AI-polished.json  # Polished version (created by "Polish with AI")
│   ├── prompt.txt              # Resume generation prompt template
│   └── generate-resume.js      # AI-powered resume generator
├── examples/
│   ├── demo-data.json          # Demo resume data
│   ├── example_resume.md       # Human-readable mirror of demo-data.json
│   ├── photo.jpg               # Default profile photo (used when no user photo)
│   └── job-description-goat.md # Sample job description for testing
├── prompts/
│   ├── ats-scan.txt            # ATS scoring prompt
│   ├── extraction.txt          # Resume extraction prompt (PDF → JSON)
│   ├── polish.txt              # Resume polishing prompt
│   └── resume-generation.txt   # Resume generation prompt
├── docs/
│   └── help.md                 # Help documentation
├── start.js                    # Dev server with /config.json endpoint
├── setup.js                    # Setup wizard
├── build.js                    # Build script (prompt injection for CORS)
├── eval_ats.js                 # ATS prompt evaluation harness
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
AI_FALLBACK_MODEL=gemini-2.5-flash-lite
ACCENT_COLOR=#2563eb
```

- `.env` is gitignored and served via `/config.json` at runtime.
- **Fallback model:** if the primary model fails, the system retries automatically with the fallback model and shows a "(fallback)" indicator in the results.

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

## 🧠 How It Works

### ATS Resume Scoring

1. Open the app — the left sidebar contains a **Job Description** textarea and action buttons.
2. Paste a full job description and click **Validate JD using AI**.
3. The app sends your resume + the job description to the configured AI model.
4. Results appear in the **right panel**:
   - **Overall ATS Match Score** (0–100) with color-coded tier
   - **Breakdown:** Keyword Match, Experience Alignment, Education/Cert Fit
   - **Feedback** with improvement tips
   - **Missing Keywords** highlighted as tags

### AI Resume Generation

1. Click **Generate resume using AI** in the left sidebar.
2. Upload a PDF of your existing resume (drag & drop or click to browse).
3. If the PDF is large, you'll see a warning with a **Continue Anyway** option.
4. Click **Generate Resume** — AI extracts and structures your data into JSON.
5. After generation completes, a **Profile Photo** upload modal appears:
   - Drag & drop or browse for a JPEG/JPG/PNG photo
   - Minimum recommended size: 200×200px
   - Click **Confirm** to apply the photo to your resume

### Polish with AI

- Once a resume is generated, a **✨ Polish with AI** button appears (golden styling).
- Clicking it sends your resume to AI for improvement. A full-screen overlay shows progress.
- After polishing, the button hides. Generate a new resume to re-enable it.

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
- `prompts/ats-scan.txt`
- `prompts/extraction.txt`
- `prompts/polish.txt`
- `prompts/resume-generation.txt`

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
