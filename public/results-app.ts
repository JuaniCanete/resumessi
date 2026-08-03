interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  author?: string;
  company?: string;
  postedDate?: string;
  aiSummary?: string;
  parameters?: string[];
}

interface ScraperRunPayload {
  timestamp: string | null;
  source: 'linkedin' | 'google';
  query: Record<string, string>;
  totalResults: number;
  results: ScraperResult[];
  summary?: string;
}

let currentPayload: ScraperRunPayload | null = null;
let currentPage = 1;
const RESULTS_PER_PAGE = 10;
let pollInterval: ReturnType<typeof setInterval> | null = null;
const initTime = Date.now();

async function initResultsPage(): Promise<void> {
  const urlParams = new URLSearchParams(window.location.search);
  const sourceParam = (urlParams.get('source') || 'linkedin').toLowerCase() as 'linkedin' | 'google';
  const isLoadingParam = urlParams.get('loading') === 'true';

  if (isLoadingParam) {
    showLoadingUI(sourceParam);
    startPolling(sourceParam);
    return;
  }

  updateResultsTabs(sourceParam);
  await loadDataAndRender(sourceParam);
}

function updateResultsTabs(source: 'linkedin' | 'google'): void {
  const linkedinTab = document.getElementById('tab-linkedin');
  const googleTab = document.getElementById('tab-google');
  if (linkedinTab) {
    linkedinTab.className = source === 'linkedin' ? 'result-tab-btn active' : 'result-tab-btn';
    linkedinTab.style.background = source === 'linkedin' ? 'var(--accent)' : 'transparent';
    linkedinTab.style.color = source === 'linkedin' ? '#fff' : 'rgba(255,255,255,0.7)';
  }
  if (googleTab) {
    googleTab.className = source === 'google' ? 'result-tab-btn active' : 'result-tab-btn';
    googleTab.style.background = source === 'google' ? 'var(--accent)' : 'transparent';
    googleTab.style.color = source === 'google' ? '#fff' : 'rgba(255,255,255,0.7)';
  }
}

function switchResultsTab(source: 'linkedin' | 'google'): void {
  updateResultsTabs(source);
  loadDataAndRender(source);
}

function showLoadingUI(source: 'linkedin' | 'google'): void {
  const badge = document.getElementById('source-badge');
  if (badge) {
    badge.textContent = source === 'linkedin' ? 'LinkedIn' : 'Google';
    badge.className = `source-badge ${source}`;
  }

  const list = document.getElementById('results-list');
  if (list) {
    list.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: #161920; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1);">
        <h3 style="font-family: 'Comfortaa', sans-serif; font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 12px;">
          🔎 Scraping ${source === 'linkedin' ? 'LinkedIn' : 'Google'}...
        </h3>
        <p style="font-size: 13.5px; color: #94a3b8; max-width: 500px; margin: 0 auto 20px auto; line-height: 1.6;">
          Extracting job listings, parsing company information, and generating AI relevance summaries ...
        </p>
        <div style="display: inline-block; padding: 8px 18px; background: rgba(37,99,235,0.15); border: 1px solid rgba(37,99,235,0.3); border-radius: 20px; color: #60a5fa; font-size: 12.5px; font-weight: 600;">
          Please keep this tab open
        </div>
      </div>
    `;
  }
}

function startPolling(source: 'linkedin' | 'google'): void {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const resp = await fetch(`/api/scraper/results?source=${source}`);
      if (resp.ok) {
        const data = await resp.json() as ScraperRunPayload;
        if (data && data.timestamp) {
          const timestampMs = new Date(data.timestamp).getTime();
          if (timestampMs > initTime - 10000) {
            if (pollInterval) clearInterval(pollInterval);
            currentPayload = data;
            sessionStorage.setItem('scraper-results', JSON.stringify(data));
            const source = data.source as 'linkedin' | 'google';
            localStorage.setItem(`scraper-results:${source}`, JSON.stringify(data));
            renderResultsUI();
          }
        }
      }
    } catch {
      // Ignore polling fetch errors
    }
  }, 2000);
}

async function loadDataAndRender(sourceParam: 'linkedin' | 'google'): Promise<void> {
  // Reset stale payload when switching sources so the new source is always fetched
  if (currentPayload && currentPayload.source !== sourceParam) {
    currentPayload = null;
  }

  const rawSession = sessionStorage.getItem('scraper-results');
  if (rawSession) {
    try {
      const parsed = JSON.parse(rawSession) as ScraperRunPayload;
      if (parsed.source === sourceParam && parsed.results) {
        currentPayload = parsed;
      }
    } catch {
      // Fallback to fetch
    }
  }

  if (!currentPayload) {
    try {
      const resp = await fetch(`/api/scraper/results?source=${sourceParam}`);
      if (resp.ok) {
        currentPayload = await resp.json() as ScraperRunPayload;
        localStorage.setItem(`scraper-results:${sourceParam}`, JSON.stringify(currentPayload));
      }
    } catch (err: unknown) {
      console.error('Failed to fetch scraper results:', (err as Error).message);
    }
  }

  renderResultsUI();
}

function buildQueryUrl(source: 'linkedin' | 'google', query: Record<string, string>): string {
  const parts: string[] = [];
  if (query.role) parts.push(query.role);
  if (query.seniority) parts.push(query.seniority);
  if (query.stack) parts.push(query.stack);

  if (source === 'linkedin') {
    if (query.employmentType) parts.push(query.employmentType);
    if (query.region) parts.push(query.region);
    if (query.country) parts.push(query.country);
    if (query.currency) parts.push(query.currency);
    const fullQuery = parts.join(' ');
    return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(fullQuery)}`;
  } else {
    if (query.employmentType) parts.push(query.employmentType);
    // Google search uses site: domains for job boards
    const defaultDomains = ['teamtailor.com', 'greenhouse.io', 'lever.co', 'workday.com', 'jobs.ashbyhq.com'];
    const siteQuery = defaultDomains.map(d => `site:${d}`).join(' OR ');
    parts.push(`(${siteQuery})`);
    parts.push('("careers" OR "jobs" OR "open positions")');

    // Combine country and region into a single quoted group, e.g. ("LATAM" OR "Argentina")
    const locationParts: string[] = [];
    if (query.region) locationParts.push(query.region);
    if (query.country) locationParts.push(query.country);
    if (locationParts.length > 0) {
      parts.push(`(${locationParts.map(l => `"${l}"`).join(' OR ')})`);
    }

    if (query.currency) parts.push(query.currency);
    const fullQuery = parts.join(' ');
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  }
}

function renderResultsUI(): void {
  // Always update badge first, even when there are no results
  const badge = document.getElementById('source-badge');
  if (badge && currentPayload) {
    badge.textContent = currentPayload.source === 'linkedin' ? 'LinkedIn' : 'Google';
    badge.className = `source-badge ${currentPayload.source}`;
  }

  if (!currentPayload || !currentPayload.results || currentPayload.results.length === 0) {
    const noResults = document.getElementById('no-results');
    if (noResults) noResults.style.display = 'block';
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.style.display = 'none';
    return;
  }

  const timestampElem = document.getElementById('meta-timestamp');
  if (timestampElem) {
    timestampElem.textContent = currentPayload.timestamp
      ? new Date(currentPayload.timestamp).toLocaleString()
      : 'N/A';
  }

  const totalElem = document.getElementById('meta-total');
  if (totalElem) {
    totalElem.textContent = String(currentPayload.totalResults || currentPayload.results.length);
  }

  const queryElem = document.getElementById('meta-query');
  if (queryElem && currentPayload.query) {
    const q = currentPayload.query;
    const parts = [q.role, q.seniority, q.stack, q.employmentType, q.region, q.country, q.currency].filter(Boolean);
    queryElem.textContent = parts.length > 0 ? parts.join(' • ') : 'All jobs';
  }

  // Build query URL and show link
  const queryLinkWrapper = document.getElementById('query-link-wrapper');
  const queryLink = document.getElementById('query-link') as HTMLAnchorElement;
  if (queryLinkWrapper && queryLink && currentPayload.query) {
    const source = currentPayload.source;
    const url = buildQueryUrl(source, currentPayload.query);
    queryLink.href = url;
    queryLinkWrapper.style.display = 'inline';
  }

  renderPage(currentPage);
}

function renderPage(page: number): void {
  if (!currentPayload || !currentPayload.results) return;

  const totalPages = Math.ceil(currentPayload.results.length / RESULTS_PER_PAGE) || 1;
  currentPage = Math.max(1, Math.min(page, totalPages));

  const startIdx = (currentPage - 1) * RESULTS_PER_PAGE;
  const endIdx = startIdx + RESULTS_PER_PAGE;
  const pageResults = currentPayload.results.slice(startIdx, endIdx);

  const container = document.getElementById('results-list');
  if (!container) return;

  container.innerHTML = '';

  for (const item of pageResults) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.dataset.url = item.url;
    card.dataset.snippet = item.snippet || '';
    card.dataset.aiSummary = item.aiSummary || '';

    // Click to expand/collapse (accordion: collapse all other cards first)
    card.addEventListener('click', (e: MouseEvent) => {
      // Don't toggle if clicking on a link or button
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button')) {
        return;
      }
      // Collapse all other expanded cards before toggling the clicked one
      const expandedCards = container.querySelectorAll('.result-card.expanded');
      expandedCards.forEach((expanded: Element) => {
        if (expanded !== card) {
          expanded.classList.remove('expanded');
        }
      });
      card.classList.toggle('expanded');
    });

    // Header: title + Check JD button (button in header so it's always visible)
    const header = document.createElement('div');
    header.className = 'result-card-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'result-title';
    titleEl.textContent = item.title;

    // Check JD button (in header so it's always visible, not lost in long text)
    const checkJdBtn = document.createElement('button');
    checkJdBtn.className = 'result-check-jd-btn';
    checkJdBtn.textContent = 'Check JD 🔍';
    checkJdBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      openJdEditModal(item);
    });

    const headerActions = document.createElement('div');
    headerActions.className = 'result-card-header-actions';
    headerActions.appendChild(checkJdBtn);

    header.appendChild(titleEl);
    header.appendChild(headerActions);
    card.appendChild(header);

    // Footer (always visible): company + action buttons
    const footer = document.createElement('div');
    footer.className = 'result-footer';

    const footerLeft = document.createElement('div');
    footerLeft.className = 'result-footer-left';

    if (item.company) {
      const company = document.createElement('span');
      company.className = 'result-company';
      company.textContent = item.company;
      footerLeft.appendChild(company);
    }

    if (item.postedDate) {
      const date = document.createElement('span');
      date.className = 'result-posted-date';
      date.textContent = item.postedDate;
      footerLeft.appendChild(date);
    }

    const applyBtn = document.createElement('a');
    applyBtn.className = 'result-link-btn';
    applyBtn.href = item.url;
    applyBtn.target = '_blank';
    applyBtn.rel = 'noopener noreferrer';
    applyBtn.textContent = 'Apply ↗';

    footer.appendChild(footerLeft);
    footer.appendChild(applyBtn);
    card.appendChild(footer);

    // Expanded body: snippet + AI summary + parameters
    const body = document.createElement('div');
    body.className = 'result-card-body';

    if (item.snippet) {
      const snippet = document.createElement('div');
      const trimmedAtChar = 100;
      snippet.className = 'result-snippet';
      const snippetText = item.snippet.length > trimmedAtChar
        ? item.snippet.substring(0, trimmedAtChar) + '...'
        : item.snippet;
      snippet.textContent = snippetText;
      body.appendChild(snippet);
    }

    if (item.aiSummary) {
      const aiSummary = document.createElement('div');
      aiSummary.className = 'result-ai-summary';
      // Use marked library to render markdown
      const marked = (window as unknown as Record<string, unknown>).marked;
      if (marked && typeof marked === 'object' && 'parse' in marked) {
        aiSummary.innerHTML = (marked as { parse: (s: string) => string }).parse(item.aiSummary);
      } else {
        aiSummary.textContent = item.aiSummary;
      }
      body.appendChild(aiSummary);
    }

    // Parameters row (AI-extracted job parameters)
    if (item.parameters && item.parameters.length > 0) {
      const parameters = document.createElement('div');
      parameters.className = 'result-parameters';
      parameters.textContent = `Parameters found: ${item.parameters.join(' • ')}`;
      body.appendChild(parameters);
    }

    card.appendChild(body);

    container.appendChild(card);
  }

  const pagination = document.getElementById('pagination');
  if (pagination) pagination.style.display = 'flex';

  const pageInfo = document.getElementById('page-info');
  if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

  const prevBtn = document.getElementById('btn-prev-page') as HTMLButtonElement;
  const nextBtn = document.getElementById('btn-next-page') as HTMLButtonElement;

  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = currentPage === totalPages;
}

function prevPage(): void {
  if (currentPage > 1) {
    renderPage(currentPage - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function nextPage(): void {
  if (!currentPayload || !currentPayload.results) return;
  const totalPages = Math.ceil(currentPayload.results.length / RESULTS_PER_PAGE);
  if (currentPage < totalPages) {
    renderPage(currentPage + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ─── ATS Sidebar ──────────────────────────────────────────────────────

function openAtsSidebar(): void {
  const sidebar = document.getElementById('ats-sidebar');
  if (sidebar) sidebar.classList.add('open');
  document.body.classList.add('ats-open');
}

function closeAtsSidebar(): void {
  const sidebar = document.getElementById('ats-sidebar');
  if (sidebar) sidebar.classList.remove('open');
  document.body.classList.remove('ats-open');
}

function applyAtsResultsToUI(screening: Record<string, unknown>): void {
  const circle = document.getElementById('ats-score-circle')!;
  circle.textContent = String(screening.overall_score);

  let tierClass = 'low';
  if (screening.tier === 'STRONG_MATCH') tierClass = 'good';
  else if (screening.tier === 'GOOD_MATCH') tierClass = 'mid';
  circle.className = 'result-score-circle ' + tierClass;

  document.getElementById('ats-score-text')!.textContent = screening.tier as string;
  const feedbackEl = document.getElementById('ats-feedback')!;
  feedbackEl.textContent = (screening.feedback as string) || '\u2014';
  feedbackEl.style.color = '';

  const breakdown = screening.breakdown as Record<string, unknown>;
  const elSkills = document.getElementById('ats-br-skills')!;
  const elExp = document.getElementById('ats-br-experience')!;
  const elEdu = document.getElementById('ats-br-education')!;

  elSkills.textContent = `${breakdown.skills_score}%`;
  elExp.textContent = `${breakdown.experience_years_score}%`;
  elEdu.textContent = breakdown.education_match ? 'PASS' : 'FAIL';

  elSkills.style.color = (breakdown.skills_score as number) >= 80 ? '#10b981' : (breakdown.skills_score as number) >= 60 ? '#f59e0b' : '#ef4444';
  elExp.style.color = (breakdown.experience_years_score as number) >= 80 ? '#10b981' : (breakdown.experience_years_score as number) >= 60 ? '#f59e0b' : '#ef4444';
  elEdu.style.color = breakdown.education_match ? '#10b981' : '#ef4444';

  const kwEl = document.getElementById('ats-keywords')!;
  const missingKeywords = screening.missingKeywords as string[] | undefined;
  if (missingKeywords && missingKeywords.length > 0) {
    kwEl.innerHTML = missingKeywords
      .map(k => `<span class="result-keyword">${k}</span>`)
      .join('');
  } else {
    kwEl.textContent = 'None detected \u2014 great match!';
    kwEl.style.color = '#86efac';
  }

  document.getElementById('ats-scan-again-msg')!.style.display = 'none';
  document.getElementById('ats-breakdown-section')!.style.display = 'block';

  // Hide loading
  document.getElementById('ats-loading')!.classList.remove('show');

  openAtsSidebar();
}

// ─── JD Edit Modal ────────────────────────────────────────────────────

// Strip markdown syntax from a string to produce plain text
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/#+\s*/g, '')
    .replace(/>\s*/g, '')
    .replace(/[-*+]\s+/g, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function openJdEditModal(item: ScraperResult): void {
  const modal = document.getElementById('jd-edit-modal');
  const textarea = document.getElementById('jd-edit-textarea') as HTMLTextAreaElement;
  const loading = document.getElementById('jd-fetch-loading');
  const scanBtn = document.getElementById('btn-scan-jd') as HTMLButtonElement;

  if (!modal) return;

  // Build richer fallback content from available fields so the modal is never empty
  const fallbackParts: string[] = [];
  if (item.title) fallbackParts.push(item.title);
  if (item.company) fallbackParts.push(`Company: ${item.company}`);
  if (item.snippet) fallbackParts.push(item.snippet);
  if (item.aiSummary) fallbackParts.push(stripMarkdown(item.aiSummary));
  const fallbackContent = fallbackParts.join('\n\n');

  // Pre-fill with fallback content as starting point
  textarea.value = fallbackContent;
  textarea.disabled = true;
  scanBtn.disabled = true;
  if (loading) loading.classList.add('show');

  modal.classList.add('show');

  // Fetch the full job description
  fetchJobDescription(item.url)
    .then((fullText) => {
      textarea.value = fullText || fallbackContent;
      textarea.disabled = false;
      scanBtn.disabled = false;
      if (loading) loading.classList.remove('show');
    })
    .catch(() => {
      // Fallback to pre-built content
      textarea.value = fallbackContent;
      textarea.disabled = false;
      scanBtn.disabled = false;
      if (loading) loading.classList.remove('show');
    });
}

async function fetchJobDescription(url: string): Promise<string> {
  try {
    const resp = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (resp.ok) {
      const data = await resp.json() as { text: string };
      return data.text;
    }
  } catch {
    // Fallback
  }
  return '';
}

function closeJdEditModal(): void {
  const modal = document.getElementById('jd-edit-modal');
  if (modal) modal.classList.remove('show');
}

async function runAtsScanFromResults(): Promise<void> {
  const textarea = document.getElementById('jd-edit-textarea') as HTMLTextAreaElement;
  const jdText = textarea.value.trim();
  if (!jdText) {
    alert('Please enter a job description text.');
    return;
  }

  closeJdEditModal();

  // Show loading in ATS sidebar
  const loading = document.getElementById('ats-loading');
  if (loading) loading.classList.add('show');
  openAtsSidebar();

  try {
    const resp = await fetch('/api/ats/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription: jdText }),
    });

    if (!resp.ok) {
      const errData = await resp.json() as { error?: string };
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json() as Record<string, unknown>;
    if (data.error) throw new Error(data.error as string);

    applyAtsResultsToUI(data);
  } catch (err: unknown) {
    if (loading) loading.classList.remove('show');
    const feedbackEl = document.getElementById('ats-feedback')!;
    feedbackEl.textContent = 'ATS scan error: ' + (err as Error).message;
    feedbackEl.style.color = '#ef4444';
    document.getElementById('ats-scan-again-msg')!.style.display = 'none';
    document.getElementById('ats-breakdown-section')!.style.display = 'none';
  }
}

// ─── Dot animation helper ─────────────────────────────────────────────
// Add CSS for dot animation if not present
(function ensureDotAnimStyle(): void {
  if (document.getElementById('dot-anim-style')) return;
  const style = document.createElement('style');
  style.id = 'dot-anim-style';
  style.textContent = `
    .dot-anim::after {
      content: '';
      animation: dotdot 1.4s infinite;
    }
    @keyframes dotdot {
      0% { content: ''; }
      33% { content: '.'; }
      66% { content: '..'; }
      100% { content: '...'; }
    }
  `;
  document.head.appendChild(style);
})();

// Global Escape Key Listener for JD Modal & ATS Sidebar
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    const jdModal = document.getElementById('jd-edit-modal');
    if (jdModal && jdModal.classList.contains('show')) {
      closeJdEditModal();
      return;
    }
    const atsSidebar = document.getElementById('ats-sidebar');
    if (atsSidebar && atsSidebar.classList.contains('open')) {
      closeAtsSidebar();
      return;
    }
  }
});

// Global exports
(window as unknown as Record<string, unknown>).prevPage = prevPage;
(window as unknown as Record<string, unknown>).nextPage = nextPage;
(window as unknown as Record<string, unknown>).closeAtsSidebar = closeAtsSidebar;
(window as unknown as Record<string, unknown>).closeJdEditModal = closeJdEditModal;
(window as unknown as Record<string, unknown>).runAtsScanFromResults = runAtsScanFromResults;
(window as unknown as Record<string, unknown>).switchResultsTab = switchResultsTab;

document.addEventListener('DOMContentLoaded', () => {
  initResultsPage();
});