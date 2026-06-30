# resumessi — End-to-End Flow Diagram

```mermaid
flowchart TD
    A[Clone Repository] --> B[Run npm install]
    B --> C[Run npm start]
    C --> D[setup.js creates .env from .env.example]
    D --> E[User configures AI_API_KEY in .env]
    E --> F[Browser opens main.html]
    F --> G[fetch config.json from server]
    G --> H[fetch resume_generation/resume-data.json]
    H --> I[renderResume with resume data]
    
    I --> J[Left Sidebar: JD Input]
    J --> K[User pastes Job Description]
    K --> L[User clicks ATS Score Check]
    L --> M[runAtsScan function triggered]
    
    M --> N[Read JD text + resume.innerText]
    N --> O[Inject JD + resume into ATS_SCAN_PROMPT]
    O --> P[Send prompt to AI provider API]
    P --> Q{API Response}
    Q -->|Success| R[Parse JSON response]
    Q -->|Error| S[Show error alert]
    
    R --> T[Extract ai_screening object]
    T --> U[Update UI: score circle + tier]
    U --> V[Update breakdown: skills/experience/education]
    V --> W[Render missingKeywords as badges]
    W --> X[Show feedback text]
    X --> Y[Open right panel with results]
    
    Y --> Z[User views ATS Match breakdown]
    Z --> AA[Click Polish with AI]
    AA --> AB[POST /api/polish-resume]
    AB --> AC[AI polishes resume JSON]
    AC --> AD[POST /api/save-polished]
    AD --> AE[Save to resume-data-AI-polished.json]
    AE --> AF[Resume re-rendered with polished text]
    AF --> AG[User clicks Download Resume]
    AG --> AH[window.print() triggered]
    AH --> AI[Print-optimized CSS hides panels]
    AI --> AJ[Resume prints as clean PDF]
```

---

## Step-by-Step Explanation

### 1. Initialization
- Repository cloned to local machine
- Dependencies installed via `npm install`
- Server started with `npm start` (runs `start.js`)
- `setup.js` bootstraps `.env` from `.env.example`
- Developer adds their AI provider `AI_API_KEY` to `.env`

### 2. Application Bootstrap
- `main.html` loads in browser
- App fetches runtime config from `config.json`
- Resume data loaded from `resume_generation/resume-data.json`
- `renderResume()` injects content into DOM

### 3. User Input
- Left sidebar displays JD textarea
- User pastes target job description
- CTA button: **ATS Score Check**

### 4. AI Evaluation
- `runAtsScan()` reads JD + rendered resume text
- Prompt template injected with `{job_description}` and `{resume_text}`
- 5-step ATS prompt executed:
  1. Extract candidate name + domain IDs
  2. Domain relevance gate (auto-LOW_MATCH if mismatched)
  3. Score with hard caps for missing skills
  4. Emit strict JSON
  5. Self-validate output
- Primary model called first (`AI_MODEL`)
- Fallback provider retry on 429/5xx errors (`AI_FALLBACK_API_KEY` + `AI_FALLBACK_MODEL`)

### 5. Results Display
- Right panel slides open
- Circular score badge (green/yellow/red)
- Match tier text
- Breakdown row: Keyword Match %, Experience Alignment %, Education/Cert Fit
- Missing keywords rendered as red badges
- Feedback paragraph with improvement tips

### 6. Polish with AI
- **Polish** button (top-right) triggers `polishResume()`
- Sends resume data to `/api/polish-resume`
- AI rewrites content with professional tone, strong action verbs, no AI buzzwords
- Polished data saved to `resume_generation/resume-data-AI-polished.json`
- Resume re-rendered with polished text
- **Rollback** button restores original version

### 7. Export
- **Download Resume** button triggers `window.print()`
- CSS `@media print` hides sidebars/panels
- Resume prints as clean, paginated PDF

---

## Data Flow

```
resume_generation/resume-data.json
        ↓ (fetch)
renderResume() → DOM injection → .resume-container
        ↓ (innerText extraction)
runAtsScan() → prompt assembly → AI provider API
        ↓ (JSON response)
JSON.parse() → ai_screening → UI updates
        ↓ (optional)
polishResume() → /api/polish-resume → polished JSON → save → re-render
        ↓ (optional)
window.print() → PDF export
```
