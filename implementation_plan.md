# Implementation Plan

[Overview]
Fix five issues on the job scraper results page (`public/results.html` + `public/results-app.ts`): Escape key not closing the Review JD modal, duplicate LinkedIn label in card footer, multiple cards expanding simultaneously, missing enriched job parameters in expanded cards, and the Review JD modal opening empty.

The results page is a standalone HTML page (`public/results.html`) with its own TypeScript logic (`public/results-app.ts`) compiled via esbuild into `public/dist/results-app.js`. It renders paginated `ScraperResult` cards fetched from `/api/scraper/results`. Each card has a header (title + source badge), a footer (company + posted date + apply link), and an expandable body (snippet + AI summary + "Check JD" button). The "Check JD" button opens a modal (`#jd-edit-modal`) that fetches the full job description via `/api/fetch-url` and then runs an ATS scan via `/api/ats/scan`. The main app (`public/app.ts`) has an established Escape-key pattern for modals that the results page currently lacks. The scraper types (`src/scraper/types.ts`) define `ScraperResult` with fields `title`, `url`, `snippet`, `source`, `author?`, `company?`, `postedDate?`, `aiSummary?` — but no dedicated fields for location, remote status, salary, or employment type. The scrape flow in `start.ts` (`POST /api/scraper/start`) already calls AI for summarization after scraping, so adding a parameter-extraction AI call there is natural and keeps parameters ready when cards expand (no lazy loading or per-card API calls needed).

[Types]
Add a `parameters` field to `ScraperResult` so AI-extracted job parameters can be stored alongside each result and rendered in expanded cards.

```typescript
// src/scraper/types.ts — modified ScraperResult
export interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  author?: string;
  company?: string;
  postedDate?: string;
  aiSummary?: string;
  parameters?: string[];  // NEW — e.g. ['Personal', 'Argentina', 'Hybrid', '120k USD', 'Contractor']
}
```

The frontend mirror interface in `public/results-app.ts` (lines 1–10) must be updated identically:

```typescript
// public/results-app.ts — modified local interface
interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  author?: string;
  company?: string;
  postedDate?: string;
  aiSummary?: string;
  parameters?: string[];  // NEW
}
```

No other type changes are required. The `ScraperRunMeta` and `ScraperQuery` interfaces remain unchanged.

[Files]
New and modified files to implement all five fixes.

**New files:**
- `src/prompts/scraper-parameters.txt` — AI prompt that instructs the model to extract job parameters (location, remote/work model, salary/budget, employment type, seniority, industry) from a batch of scraped job listings and return a JSON array mapping each result index to its extracted parameters.

**Modified files:**
- `src/scraper/types.ts` — Add `parameters?: string[]` field to `ScraperResult` (line 9, after `aiSummary`).
- `public/results-app.ts` — Five changes:
  1. Add `parameters?: string[]` to the local `ScraperResult` interface (line 9).
  2. Add a global `keydown` Escape listener that closes the JD edit modal and ATS sidebar (new code near the end of the file, before global exports).
  3. Remove the `result-company` fallback that shows `item.source.toUpperCase()` when `item.company` is absent (lines 254–259) — this eliminates the duplicate LinkedIn/Google label. Keep the `if (item.company)` branch so real company names still display.
  4. Modify the card click handler (lines 217–224) to collapse all other cards before expanding the clicked one (accordion behavior).
  5. Add a "Parameters found" row in the expanded card body (between the AI summary and the Check JD button) that renders `item.parameters` as a bullet-separated line. Also modify `openJdEditModal` to accept the full item (or more fields) and build richer initial textarea content from title + company + snippet + aiSummary so the modal is never empty.
- `start.ts` — Two changes:
  1. In `POST /api/scraper/start` (after line 454, after the summarization block): add a parameter-extraction AI call that sends all `rawResults` to the new prompt, parses the JSON response, and merges `parameters` into each result before writing the output file.
  2. In `POST /api/fetch-url` (lines 548–594): improve robustness — follow redirects (handle 301/302/303/307/308), set a realistic `User-Agent` header, and increase the truncated text limit from 10000 to 15000 characters so more JD content is returned. This helps Issue 5 (modal opening empty) by making the fetch more likely to succeed.
- `public/results.html` — Add CSS for the new `.result-parameters` element in the expanded card body (after the `.result-ai-summary` styles, around line 263). Style it as a compact, pill-separated line matching the existing dark theme.

**No files deleted or moved.**

[Functions]
New and modified functions across the codebase.

**New functions:**
- `extractJobParameters(results: ScraperResult[], env: Record<string, string | undefined>): Promise<void>` — `start.ts` — Takes the raw scraped results, builds a prompt from the new `scraper-parameters.txt` template, calls `runInference`, parses the JSON response (array of `{ index: number, parameters: string[] }`), and mutates each result in-place by setting `result.parameters`. Wrapped in try/catch so failures don't break the scrape. Called after the summarization block in `/api/scraper/start`.

**Modified functions:**
- `openJdEditModal(jobUrl: string, snippet: string)` → `openJdEditModal(item: ScraperResult)` — `public/results-app.ts` (line 410) — Change signature to accept the full `ScraperResult` item. Build initial textarea content from `item.title`, `item.company`, `item.snippet`, and `item.aiSummary` (stripping markdown) so the modal always has editable content even if the fetch fails. Store `currentAtsJobUrl = item.url`. The fetch logic remains the same but the fallback content is richer.
- `renderPage(page: number)` — `public/results-app.ts` (line 194) — Three modifications:
  1. **Accordion behavior** (lines 217–224): Before toggling `expanded` on the clicked card, query all `.result-card.expanded` in the container and remove `expanded` from any card that is not the clicked one. Then toggle the clicked card.
  2. **Remove duplicate label** (lines 249–259): Delete the `else` branch that creates a `result-company` span showing `item.source.toUpperCase()`. Only append the company span when `item.company` is truthy.
  3. **Parameters row** (after the AI summary block, ~line 301): If `item.parameters` is a non-empty array, create a `div.result-parameters` element with text content `Parameters found: ` followed by the parameters joined by ` • `. Insert it before the Check JD button.
- Check JD button click handler (line 307): Change `openJdEditModal(item.url, item.snippet || '')` to `openJdEditModal(item)`.
- `fetchJobDescription(url: string)` — `public/results-app.ts` (line 444) — No signature change, but the caller now passes richer fallback data so this function's empty-return case is less impactful.

**Removed functions:** None.

[Classes]
No classes exist or are modified in this codebase — the frontend and scraper modules use functional/ procedural style with interfaces. No class changes.

[Dependencies]
No new npm packages required. All fixes use existing dependencies:
- `runInference` from `src/router.ts` — already imported in `start.ts`, used for the new parameter-extraction AI call.
- `esbuild` — already used in `build.ts` to compile `results-app.ts` → `public/dist/results-app.js`.
- `marked` (CDN) — already loaded in `results.html` for markdown rendering.

No version changes. No new integration requirements beyond the existing AI inference pipeline.

[Testing]
Validation strategy combining type checking, build verification, and manual testing.

**Type checking:**
- Run `npx tsc --noEmit` (or `npm run typecheck`) to verify the `parameters` field addition in `src/scraper/types.ts` and `start.ts` changes compile cleanly.
- Run `npm run build` to verify `results-app.ts` compiles via esbuild without errors.

**Manual testing checklist:**
1. **Escape key**: Open results page, click "Check JD" on a card, press Escape — modal should close. Open ATS sidebar, press Escape — sidebar should close.
2. **Duplicate label**: Load results where some cards have no company — the footer should NOT show a duplicate "LINKEDIN" or "GOOGLE" label. Cards WITH a company should still show the company name.
3. **Accordion expansion**: Click card A to expand, then click card B — card A should collapse and card B should expand. Only one card expanded at any time.
4. **Parameters display**: Expand a card — "Parameters found: ..." line should appear with AI-extracted parameters (location, remote, salary, etc.) when available. Cards without extracted parameters should not show the row.
5. **Check JD modal content**: Click "Check JD" — modal should open with editable text content (at minimum the title + snippet + AI summary), not empty. If the full JD fetch succeeds, it should populate with the full JD text.

**Existing tests:**
- Check `tests/` directory for any scraper-related tests that may need updating due to the `parameters` field addition. The field is optional so existing tests should not break, but any snapshot tests of `ScraperResult` may need regeneration.

[Implementation Order]
1. Add `parameters?: string[]` to `ScraperResult` in `src/scraper/types.ts`.
2. Create `src/prompts/scraper-parameters.txt` with the AI extraction prompt.
3. Add `extractJobParameters` function and call it in `POST /api/scraper/start` in `start.ts`.
4. Improve `POST /api/fetch-url` redirect/headers handling in `start.ts`.
5. Add `parameters?: string[]` to the local `ScraperResult` interface in `public/results-app.ts`.
6. Remove the duplicate `result-company` fallback (else branch) in `renderPage`.
7. Add accordion behavior (collapse others on expand) in the card click handler in `renderPage`.
8. Add the "Parameters found" row rendering in `renderPage`.
9. Modify `openJdEditModal` to accept the full item and build richer initial content.
10. Update the Check JD button click handler to pass the full item.
11. Add the Escape key listener for the JD modal and ATS sidebar.
12. Add `.result-parameters` CSS to `public/results.html`.
13. Run `npx tsc --noEmit` and `npm run build` to verify compilation.
14. Manual test all five fixes on the running app.