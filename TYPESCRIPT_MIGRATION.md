# Resumessi — Full TypeScript Migration Plan

This document outlines the step-by-step roadmap to migrate **resumessi** from JavaScript to TypeScript.

---

## 1. Executive Summary & Goals

### Objectives
1. **End-to-End Type Safety**: Provide strict type definitions across backend server endpoints, AI provider interfaces, resume extraction schema, and frontend UI helpers.
2. **Enhanced DX & Developer Tooling**: Auto-completion, refactoring safety, and inline documentation for complex JSON schemas (resume structures, LLM prompts, ATS score outputs).
3. **Zero Runtime Overhead**: Compile TypeScript down to clean ESNext / CommonJS targets with fast bundling via `tsx` / `esbuild`.
4. **Preserve Config Architecture**: Keep `.env` as the single source of truth and respect existing file ownership guidelines in [AGENTS.md](file:///c:/Users/juani/Desktop/Career_change/resumessi/AGENTS.md).

---

## 2. Target Architecture & Directory Structure

```
resumessi/
├── src/
│   ├── types/                     # Centralized Type & Schema Definitions
│   │   ├── provider.ts            # AI Provider API contracts & response structures
│   │   ├── router.ts              # Router options, fallbacks & status types
│   │   ├── resume.ts              # Schema for Resume JSON, ATS scoring & polishing
│   │   └── config.ts              # Runtime environment and endpoint config types
│   ├── providers.ts               # AI Providers implementation (migrated from providers.js)
│   ├── router.ts                  # Inference router & failover logic (migrated from router.js)
│   └── resume/
│       └── generate-resume.ts     # CLI resume compilation tool (migrated from generate-resume.js)
├── public/
│   ├── utils.ts                   # Frontend helper functions (migrated from utils.js)
│   ├── app.ts                     # Extracted client-side DOM logic (from main.html script tags)
│   └── main.html                  # HTML template loading dist script
├── scripts/
│   ├── validate.ts                # Pre-build validation script
│   └── run-evals.ts               # LLM evals harness
├── tests/
│   ├── playwright.config.ts       # Playwright TS config
│   ├── fixtures/
│   │   └── resume-fixtures.ts     # Typed test fixtures
│   ├── pages/
│   │   └── MainPage.ts            # Typed Playwright Page Object
│   ├── unit/                      # Typed Unit tests (*.test.ts)
│   └── e2e/                       # Typed E2E tests (*.spec.ts)
├── build.ts                       # Typed Build & prompt injection script
├── start.ts                       # Typed Dev server & /config.json endpoint
├── setup.ts                       # Typed CLI setup script
├── tsconfig.json                  # Main TS compilation configuration
└── TYPESCRIPT_MIGRATION.md        # This migration guide
```

---

## 3. Migration Roadmap & Phased Execution

### Phase 1: Tooling & Environment Setup
- **Dependencies**: Add TypeScript and developer dependencies:
  - `typescript`
  - `@types/node`
  - `@types/pdf-parse`
  - `@types/busboy`
  - `tsx` (TypeScript executor for dev server & scripts)
  - `@typescript-eslint/parser` & `@typescript-eslint/eslint-plugin`
- **Compiler Configuration (`tsconfig.json`)**:
  - Update options: `"strict": true`, `"moduleResolution": "node"`, `"target": "ES2022"`, `"allowJs": false`.
  - Include `src/**/*.ts`, `public/**/*.ts`, `scripts/**/*.ts`, `tests/**/*.ts`, `start.ts`, `build.ts`, `setup.ts`.
- **`package.json` Updates**:
  - Update scripts to execute TS using `tsx` (e.g., `"start": "tsx start.ts"`, `"build": "tsx build.ts"`).
  - Add type-checking script: `"typecheck": "tsc --noEmit"`.

---

### Phase 2: Core Data Models & Type Definitions (`src/types/`)
Define explicit TS types and interfaces:
1. **AI Provider Interfaces (`src/types/provider.ts`)**:
   ```typescript
   export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'groq' | 'ollama' | 'openrouter';

   export interface LLMMessage {
       role: 'system' | 'user' | 'assistant';
       content: string;
   }

   export interface LLMOptions {
       model?: string;
       temperature?: number;
       maxTokens?: number;
       jsonMode?: boolean;
   }

   export interface ProviderResponse {
       content: string;
       model: string;
       usage?: {
           promptTokens?: number;
           completionTokens?: number;
           totalTokens?: number;
       };
   }
   ```
2. **Resume & ATS Types (`src/types/resume.ts`)**:
   ```typescript
   export interface ATSScoreBreakdown {
       relevance: number;
       skillsMatch: number;
       formatting: number;
       overallScore: number;
       feedback: string[];
   }

   export interface ExtractedResumeData {
       name: string;
       contact: Record<string, string>;
       experience: Array<{ company: string; role: string; duration: string; highlights: string[] }>;
       skills: string[];
       education: Array<{ institution: string; degree: string; year: string }>;
   }
   ```
3. **App Config Interface (`src/types/config.ts`)**:
   ```typescript
   export interface AppConfig {
       apiKey: string;
       provider: ProviderName;
       model: string;
       themeColorPrimary: string;
       themeColorSecondary: string;
   }
   ```

---

### Phase 3: Backend & Core Module Migration (`src/` & Root Scripts)
1. **`src/providers.ts`**:
   - Type API call implementations for each provider (`callOpenAI`, `callAnthropic`, `callGemini`, etc.).
   - Type parameter signatures and error handle objects.
2. **`src/router.ts`**:
   - Implement typed failover router taking `ProviderName[]` and retrying available endpoints safely.
3. **`src/resume/generate-resume.ts`**:
   - Add strong types for prompt reading, PDF parsing using `pdf-parse`, and resume file output generation.
4. **`start.ts` & `build.ts`**:
   - Annotate Express/HTTP request/response handlers in `start.ts`.
   - Annotate prompt file reading and standard HTML generation in `build.ts`.

---

### Phase 4: Frontend Utility & UI Migration (`public/`)
1. **`public/utils.ts`**:
   - Convert HTML escaping (`escHtml`), photo path resolution (`getPhotoPath`), and JD input validation (`validateJDInput`) to TS with explicit parameter and return types.
2. **`public/app.ts`**:
   - Extract inline JavaScript from `public/main.html` into a modular `public/app.ts`.
   - Setup lightweight client build step in `build.ts` (using `esbuild` or `tsc`) compiling `public/app.ts` into browser-compatible bundle `public/dist/app.js`.

---

### Phase 5: Test Suite Migration (`tests/`)
1. **Unit Tests (`tests/unit/*.test.ts`)**:
   - Migrate node test suite to TypeScript.
   - Run tests via `tsx --test "tests/unit/**/*.test.ts"`.
2. **Page Objects & Fixtures (`tests/pages/`, `tests/fixtures/`)**:
   - Convert `MainPage.js` to typed Page Object model (`MainPage.ts`).
   - Add static types to `resume-fixtures.ts`.
3. **Playwright E2E Tests (`tests/e2e/*.spec.ts`)**:
   - Update `playwright.config.js` to `playwright.config.ts`.
   - Convert specs (`advanced-flows.spec.ts`, `ai-providers.spec.ts`, `ats-scan.spec.ts`, etc.).

---

## 4. Verification & Quality Assurance Strategy

| Stage | Command / Verification | Goal |
|---|---|---|
| Type Checking | `npm run typecheck` (`tsc --noEmit`) | Ensure 0 type errors across codebase |
| Linting | `npm run lint` | ESLint TypeScript validation |
| Unit Testing | `npm run test:unit` | Verify pure logic and provider mock tests pass |
| E2E Testing | `npm run test:e2e` | Playwright browser tests pass against local server |
| Validation | `npm run validate` | Prompt and config structure validation succeeds |
| Build Check | `npm run build:check` | Bundler compiles client & server artifacts cleanly |

---

## 5. Risk Management & Rules Compliance
- **Rule Compliance**: Maintain exact indentation rules (tab size 4 / existing spacing).
- **Setup Script**: Never run `node setup.js` / `npm run setup` automatically.
- **Config Truth**: Retain `.env` as the runtime source of truth served via `/config.json`.






