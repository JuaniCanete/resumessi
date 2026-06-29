# resumessi AI

> **resumessi** is a self-contained, AI-powered resume scoring and generation tool. It uses any AI model (Gemini, OpenAI, etc. — whatever the user configures) to evaluate your resume against any job description, providing an ATS (Applicant Tracking System) score, breakdown, feedback, and missing keywords.

---

## 🚀 Quick Start

1. **Clone or download** this folder.
2. **Run setup** — execute `node setup.js` to configure your API key.
3. **Build prompts** — execute `npm run build` to prepare the app.
4. **Start the app** — execute `npm start` to run the local server and open the app in your browser automatically.
5. **Paste a Job Description** in the left panel and click **ATS Score Check**.

---

## 📁 Project Structure

```
resumessi/
├── pages/
│   ├── main.html              # Main application (AI ATS Scanner + Resume template)
│   └── how-it-works.html      # How it works page (explanative page)
├── resume_generation/
│   ├── resume-data.json      # Resume data (auto-generated or manual)
│   ├── resume-data-AI-polished.json  # Polished version (created by Polish with AI)
│   ├── photo*                # Your profile photo (gitignored)
│   ├── prompt.txt            # Structured prompt template for generating resumes
│   └── generate-resume.js    # AI-powered resume generator script
├── examples/
│   ├── demo-data.json          # Demo resume data (JSON — consumed by main.html)
│   ├── example_resume.md       # Human-readable mirror of demo-data.json
│   ├── photo.jpg               # Demo profile photo (Messi)
│   └── job-description-goat.md # Sample job description for testing
├── docs/
│   ├── help.md                # Help documentation
│   └── how-it-works.html      # Static how-it-works page
├── setup.js                  # Setup wizard - creates .env from .env.example
├── build.js                  # Build script: injects prompts to solve CORS
├── start.js                  # Dev server with /config.json endpoint
├── eval_ats.js               # ATS prompt evaluation harness (3 test cases)
├── ATS_SCAN_PROMPT.md        # ATS scoring system prompt (source of truth)
├── extraction_prompt.txt     # Resume extraction prompt (embedded in main.html)
├── polish_prompt.txt         # Resume polishing prompt (embedded in start.js)
├── .gitignore                # Ignores .env, node_modules/, resume_generation/photo*
├── .env.example              # Environment variable template
├── README.md                 # This file
├── AGENTS.md                 # AI agent collaboration guide for this project
└── roocode-review.md         # Codebase review document
```

---

## ⚙️ Configuration

### API Key & Model

**Recommended:** Run `node setup.js` to configure your API key interactively.

**Manual:** Create `.env` from `.env.example` and edit:

```env
AI_API_KEY=your_api_key_here
AI_MODEL=gemini-2.5-flash
AI_FALLBACK_MODEL=gemini-2.5-flash-lite
```

**Note:** `.env` is gitignored and read by the server at `/config.json`. Any edits to `.env` take effect immediately when you refresh the browser (no rebuild needed).

### Fallback Model

resumessi supports automatic fallback to a secondary AI model if the primary model fails. This improves reliability:

- **Primary model:** `gemini-2.5-flash` (fast, capable)
- **Fallback model:** `gemini-2.5-flash-lite` (lighter, more available)

If the primary model returns an error, the system automatically retries with the fallback model and displays results with a "(fallback)" indicator.

### Color Theme

Set any of these in `.env`:

```env
ACCENT_COLOR=#2563eb       # Corporate blue (default)
# Or use a preset name: blue, green, purple, rose, teal, orange
PRIMARY_COLOR=#0a0a0a
SECONDARY_COLOR=#0a0a0a
TEXT_COLOR=#171717
TEXT_LIGHT_COLOR=#404040
BG_BADGE_COLOR=#f1f5f9
SUCCESS_COLOR=#0ea5e9
```

---

## 🖼️ Photo Instructions

1. Use a **square** photo, **400×400 px** recommended.
2. Format: **JPG** or **PNG**, neutral background, good lighting.
3. Save as `resume_generation/photo.jpg` in your local copy.

**Note:** `resume_generation/photo*` is gitignored to avoid committing personal photos. The demo photo `examples/photo.jpg` (Messi) is used as fallback when no user photo exists.

---

## 🧠 How It Works

1. The left sidebar contains a **Job Description** text area and an **ATS Score Check** button.
2. When you click the button, the app sends your resume + the job description to the configured **AI model**.
3. The AI returns:
   - **Overall ATS Match Score** (0–100)
   - **Tier** (STRONG_MATCH, GOOD_MATCH, LOW_MATCH, ANOMALY_DETECTED)
   - **Breakdown** (Skills, Experience, Education)
   - **Feedback** with improvement tips
   - **Missing Keywords** to add to your resume
4. Results appear in the **right panel** (collapsible/expandable).

For a visual workflow diagram, see the in-app **Help** page (Actions → Help).

---

## 🖨️ PDF Export

Click **Download Resume** to print/save as PDF. The print layout is single-column and optimized for ATS parsing.

---

## 🔧 Development

### Build Step

This project uses **build-time prompt injection** to avoid CORS errors when opening `main.html` via `file://` protocol.

**Why?** The browser blocks `fetch()` for local files, so prompts are baked into the HTML/JS at build time from their canonical `.md`/`.txt` sources.

```bash
npm run build        # inject prompts into pages/main.html and generate-resume.js
npm run build:check  # verify prompts are up-to-date
```

**Source of truth (dynamic loading at runtime):**
- `prompts/ats-scan.txt` → loaded via `/api/prompts/ats-scan.txt`
- `prompts/extraction.txt` → loaded via `/api/prompts/extraction.txt`
- `prompts/polish.txt` → loaded via `fs.readFileSync` in `/api/polish-resume`
- `prompts/resume-generation.txt` → loaded via `fs.readFileSync` in `generate-resume.js`

All prompts are plain `.txt` files in the `prompts/` folder, served dynamically at runtime. No build step required.

After editing any prompt file, **always run `npm run build`** before committing.

### Local Usage

You can use this project as-is. Replace the example data in `resume_generation/resume-data.json` with your own resume information. The app works entirely in the browser with no backend required.

**Use `npm start` to launch the server** - this enables the `/config.json` endpoint which reads your `.env` at runtime, avoiding CORS issues.

---

## 📄 License

MIT — free to use, modify, and share.