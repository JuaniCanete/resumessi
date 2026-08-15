import { stripMarkdown, buildQueryUrl, confirmDelete, confirmUnsave, showToast, showApplyModal } from './utils';
import { getScraperResultsStorageKey } from '../src/scraper/runtime-utils';
import type { ScraperResult } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────

interface ScraperRunPayload {
  timestamp: string | null;
  source: 'linkedin' | 'google';
  query: Record<string, string>;
  totalResults: number;
  results: ScraperResult[];
  summary?: string;
  runId?: string;
  provider?: string;
  metadataExtractionStatus?: 'extracting' | 'done';
}

// ─── State ───────────────────────────────────────────────────────────────

const payloadsBySource: Record<'linkedin' | 'google', ScraperRunPayload | null> = {
  linkedin: null,
  google: null,
};
let currentPage = 1;
const RESULTS_PER_PAGE = 10;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentRunId: string | null = null;
let currentSource: 'linkedin' | 'google' = 'linkedin';
let currentTab: 'scraping' | 'saved' | 'dashboard' | 'resume' = 'scraping';
let isLoadingResults = false;
const extractionStatus: Record<'linkedin' | 'google', 'idle' | 'extracting' | 'done'> = {
  linkedin: 'idle',
  google: 'idle',
};

// Track expanded card URL per source to preserve on re-render
const expandedCardUrl: Record<'linkedin' | 'google', string | null> = {
  linkedin: null,
  google: null,
};

// Scraper state
let scraperController: AbortController | null = null;
let currentScraperPlatform: 'linkedin' | 'google' = 'linkedin';

// Providers modal state
let selectedProviderForModal: string | null = null;
let cachedConfig: Record<string, unknown> | null = null;

// DANGEROUS_TAGS for sanitization
const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'style',
  'form', 'input', 'textarea', 'button', 'select', 'option',
  'base', 'frame', 'frameset', 'applet', 'audio', 'video', 'source', 'track',
]);

function sanitizeHtml(dirtyHtml: string): string {
  const template = document.createElement('template');
  template.innerHTML = dirtyHtml;
  const walk = (node: Node): void => {
    let child = node.firstChild;
    while (child) {
      const next = child.nextSibling;
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (DANGEROUS_TAGS.has(tag)) {
          el.remove();
        } else {
          for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            if (name.startsWith('on')) {
              el.removeAttribute(attr.name);
            } else if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
              (value.startsWith('javascript:') || value.startsWith('vbscript:') || value.startsWith('data:'))) {
              el.removeAttribute(attr.name);
            } else if (name === 'style' && (value.includes('expression(') || value.includes('url(javascript:'))) {
              el.removeAttribute(attr.name);
            }
          }
          walk(el);
        }
      }
      child = next;
    }
  };
  walk(template.content);
  return template.innerHTML;
}

// ─── Sidebar Navigation ──────────────────────────────────────────────────

function toggleSidebar(): void {
  const sidebar = document.getElementById('findjob-sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed');
  const isCollapsed = sidebar.classList.contains('collapsed');
  localStorage.setItem('findJob.sidebarOpen', String(!isCollapsed));
}

function switchTab(tab: 'scraping' | 'saved' | 'dashboard' | 'resume'): void {
  currentTab = tab;

  if (tab === 'resume') {
    window.location.href = '/public/main.html';
    return;
  }

  // Update sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tab);
  });

  // Show/hide tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    (content as HTMLElement).style.display = 'none';
  });
  const activeContent = document.getElementById(`tab-${tab}`);
  if (activeContent) activeContent.style.display = 'block';

  // Render content for the active tab
  if (tab === 'scraping') {
    renderScrapingResults();
  } else if (tab === 'saved') {
    renderSavedJobs();
  } else if (tab === 'dashboard') {
    renderDashboard();
  }

  localStorage.setItem('findJob.activeTab', tab);
}

function loadSidebarState(): void {
  const sidebarOpen = localStorage.getItem('findJob.sidebarOpen');
  const activeTab = localStorage.getItem('findJob.activeTab') as 'scraping' | 'saved' | 'dashboard' | 'resume' | null;

  const sidebar = document.getElementById('findjob-sidebar');
  if (sidebar) {
    if (sidebarOpen === 'false') {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
    }
  }

  if (activeTab && activeTab !== 'resume') {
    switchTab(activeTab);
  }
}

// ─── Scraping Results Tab ────────────────────────────────────────────────

function switchResultsTab(source: 'linkedin' | 'google'): void {
  currentSource = source;
  updateResultsTabs(source);
  loadDataAndRender(source);
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

  const badge = document.getElementById('source-badge');
  if (badge) {
    badge.textContent = source === 'linkedin' ? 'LinkedIn' : 'Google';
    badge.className = `source-badge ${source}`;
  }
}

function showLoadingUI(source: 'linkedin' | 'google'): void {
  isLoadingResults = true;
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

function showRefreshMessage(): void {
  const msg = document.getElementById('refresh-message');
  if (msg) {
    msg.textContent = 'Applying changes . . .';
    msg.style.display = 'block';
    setTimeout(() => {
      msg.style.display = 'none';
    }, 2000);
  }
}

function startPolling(source: 'linkedin' | 'google'): void {
  if (pollInterval) clearInterval(pollInterval);

  // Safety: stop polling after 3 minutes no matter what, and always hide overlay.
  let settledTicks = 0;
  let totalTicks = 0;
  const MAX_TICKS = 90; // 90 * 2000ms = 180s
  const MAX_SETTLED_TICKS = 3; // grace ticks after background processing completes

  pollInterval = setInterval(async () => {
    totalTicks += 1;
    try {
      const resp = await fetch(`/api/scraper/results?source=${source}`);
      if (resp.ok) {
        const data = await resp.json() as ScraperRunPayload;
        if (data && data.timestamp && data.runId && data.runId === currentRunId) {
          payloadsBySource[source] = data;
          sessionStorage.setItem('scraper-results', JSON.stringify(data));
          localStorage.setItem(`scraper-results:${source}`, JSON.stringify(data));
          isLoadingResults = false;
          const overlay = document.getElementById('scraper-overlay');
          if (overlay) overlay.style.display = 'none';

          // Track metadata extraction status
          const prevStatus = extractionStatus[source];
          if (data.metadataExtractionStatus) {
            extractionStatus[source] = data.metadataExtractionStatus;
          } else {
            // No extraction status in response means extraction is not running (idle/done)
            extractionStatus[source] = 'idle';
          }

          // Only re-render if we're viewing this source's tab
          if (source === currentSource) {
            renderScrapingResults();
          }

          // Show toast when extraction finishes
          if (prevStatus === 'extracting' && extractionStatus[source] === 'done') {
            showToast({ message: 'Metadata extraction finished successfully.', type: 'success' });
          }

          // Background summarization + parameter extraction may still be writing
          // to the results file after the scrape returns. Keep polling (and
          // re-rendering) until the provider is set AND every result has a
          // parameters array, then allow a couple of grace ticks before stopping.
          const backgroundDone = !!(data.provider && Array.isArray(data.results) &&
            data.results.length > 0 &&
            data.results.every(r => Array.isArray(r.parameters)));
          if (backgroundDone) {
            settledTicks += 1;
            if (settledTicks >= MAX_SETTLED_TICKS) {
              if (pollInterval) clearInterval(pollInterval);
              pollInterval = null;
            }
          } else {
            settledTicks = 0;
          }
        }
      } else if (resp.status === 400 || resp.status >= 500) {
        handleScrapeFailure('Scrape request was rejected by the server.');
      }
    } catch {
      // Ignore polling fetch errors
    }

    // Failsafe: stop polling and hide overlay after the cap
    if (totalTicks >= MAX_TICKS) {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = null;
      const overlay = document.getElementById('scraper-overlay');
      if (overlay) overlay.style.display = 'none';
      isLoadingResults = false;
      renderScrapingResults();
    }
  }, 2000);
}

function handleScrapeFailure(errorMessage: string): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  const list = document.getElementById('results-list');
  if (list) list.innerHTML = '';

  const errorEl = document.getElementById('scrape-error');
  if (errorEl) {
    const msgEl = document.getElementById('scrape-error-message');
    if (msgEl) msgEl.textContent = errorMessage || 'The scraping process could not be completed. Please try again.';
    errorEl.style.display = 'block';
  }

  const noResults = document.getElementById('no-results');
  if (noResults) noResults.style.display = 'none';
  const pagination = document.getElementById('pagination');
  if (pagination) pagination.style.display = 'none';
}

async function loadDataAndRender(sourceParam: 'linkedin' | 'google'): Promise<void> {
  currentSource = sourceParam;

  const rawSession = sessionStorage.getItem('scraper-results');
  if (rawSession) {
    try {
      const parsed = JSON.parse(rawSession) as ScraperRunPayload;
      if (parsed.source === sourceParam && parsed.results) {
        payloadsBySource[sourceParam] = parsed;
        if (parsed.metadataExtractionStatus) {
          extractionStatus[sourceParam] = parsed.metadataExtractionStatus;
        }
      }
    } catch {
      // Fallback to fetch
    }
  }

  if (!payloadsBySource[sourceParam]) {
    try {
      const resp = await fetch(`/api/scraper/results?source=${sourceParam}`);
      if (resp.ok) {
        const data = await resp.json() as ScraperRunPayload;
        payloadsBySource[sourceParam] = data;
        localStorage.setItem(`scraper-results:${sourceParam}`, JSON.stringify(data));
        // Always update extraction status based on server response
        // If no metadataExtractionStatus in response, default to 'idle' (no extraction running)
        if (data.metadataExtractionStatus) {
          extractionStatus[sourceParam] = data.metadataExtractionStatus;
        } else {
          extractionStatus[sourceParam] = 'idle';
        }
      }
    } catch (err: unknown) {
      console.error('Failed to fetch scraper results:', (err as Error).message);
    }
  }

  renderScrapingResults();
}

function renderScrapingResults(): void {
  if (currentTab !== 'scraping') return;
  if (isLoadingResults) return;

  const activePayload = payloadsBySource[currentSource];
  const isExtracting = extractionStatus[currentSource] === 'extracting';

  const badge = document.getElementById('source-badge');
  if (badge && activePayload) {
    badge.textContent = activePayload.source === 'linkedin' ? 'LinkedIn' : 'Google';
    badge.className = `source-badge ${activePayload.source}`;
  }

  // Show extraction loading banner if metadata is being extracted
  const extractionBanner = document.getElementById('extraction-loading');
  if (extractionBanner) {
    extractionBanner.style.display = isExtracting ? 'block' : 'none';
  }

  if (!activePayload || !activePayload.results || activePayload.results.length === 0) {
    const list = document.getElementById('results-list');
    if (list) list.innerHTML = '';

    const timestampElem = document.getElementById('meta-timestamp');
    if (timestampElem) timestampElem.textContent = 'No results';
    const totalElem = document.getElementById('meta-total');
    if (totalElem) totalElem.textContent = 'N/A';
    const queryElem = document.getElementById('meta-query');
    if (queryElem) queryElem.textContent = 'N/A';
    const queryLinkWrapper = document.getElementById('query-link-wrapper');
    if (queryLinkWrapper) queryLinkWrapper.style.display = 'none';

    const noResults = document.getElementById('no-results');
    if (noResults) noResults.style.display = 'block';
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.style.display = 'none';
    return;
  }

  const noResults = document.getElementById('no-results');
  if (noResults) noResults.style.display = 'none';

  const timestampElem = document.getElementById('meta-timestamp');
  if (timestampElem) {
    timestampElem.textContent = activePayload.timestamp
      ? new Date(activePayload.timestamp).toLocaleString()
      : 'N/A';
  }

  const totalElem = document.getElementById('meta-total');
  if (totalElem) {
    totalElem.textContent = String(activePayload.totalResults || activePayload.results.length);
  }

  const queryElem = document.getElementById('meta-query');
  if (queryElem && activePayload.query) {
    const q = activePayload.query;
    const parts = [q.role, q.seniority, q.keywords, q.employmentType, q.region, q.country, q.currency].filter(Boolean);
    queryElem.textContent = parts.length > 0 ? parts.join(' • ') : 'All jobs';
  }

  const queryLinkWrapper = document.getElementById('query-link-wrapper');
  const queryLink = document.getElementById('query-link') as HTMLAnchorElement;
  if (queryLinkWrapper && queryLink && activePayload.query) {
    const source = activePayload.source;
    const url = buildQueryUrl(source, activePayload.query);
    queryLink.href = url;
    queryLinkWrapper.style.display = 'inline';
  }

  renderPage(currentPage);
}

function renderPage(page: number): void {
  const activePayload = payloadsBySource[currentSource];
  if (!activePayload || !activePayload.results) return;

  const totalPages = Math.ceil(activePayload.results.length / RESULTS_PER_PAGE) || 1;
  currentPage = Math.max(1, Math.min(page, totalPages));

  const startIdx = (currentPage - 1) * RESULTS_PER_PAGE;
  const endIdx = startIdx + RESULTS_PER_PAGE;
  const pageResults = activePayload.results.slice(startIdx, endIdx);

  const container = document.getElementById('results-list');
  if (!container) return;

  container.innerHTML = '';

  for (const item of pageResults) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.dataset.url = item.url;
    card.dataset.snippet = item.snippet || '';
    card.dataset.aiSummary = item.aiSummary || '';

    card.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button')) {
        return;
      }
      const expandedCards = container.querySelectorAll('.result-card.expanded');
      expandedCards.forEach((expanded: Element) => {
        if (expanded !== card) {
          expanded.classList.remove('expanded');
        }
      });
      card.classList.toggle('expanded');
      // Track expanded card URL for preservation across re-renders
      if (card.classList.contains('expanded')) {
        expandedCardUrl[currentSource] = item.url;
      } else {
        expandedCardUrl[currentSource] = null;
      }
    });

    // Header: title + actions
    const header = document.createElement('div');
    header.className = 'result-card-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'result-title';
    titleEl.textContent = item.title;

    const headerActions = document.createElement('div');
    headerActions.className = 'result-card-actions';

    // Action buttons
    const RunATSBtn = document.createElement('button');
    RunATSBtn.className = 'card-action-btn runATS';
    RunATSBtn.textContent = 'Run ATS';
    RunATSBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      openJdEditModal(item);
    });
    headerActions.appendChild(RunATSBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'card-action-btn save';
    saveBtn.textContent = item.saved ? 'Saved ✓' : 'Save';
    saveBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleSave(item, currentSource);
    });
    headerActions.appendChild(saveBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-action-btn remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleRemove(item, currentSource);
    });
    headerActions.appendChild(removeBtn);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'card-action-btn apply';
    applyBtn.textContent = 'Applied?';
    applyBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleApply(item, currentSource);
    });
    headerActions.appendChild(applyBtn);

    header.appendChild(titleEl);
    header.appendChild(headerActions);
    card.appendChild(header);

    // Footer: company + apply link
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

    const applyLinkBtn = document.createElement('a');
    applyLinkBtn.className = 'result-link-btn';
    applyLinkBtn.href = item.url;
    applyLinkBtn.target = '_blank';
    applyLinkBtn.rel = 'noopener noreferrer';
    applyLinkBtn.textContent = 'Apply ↗';
    footer.appendChild(footerLeft);
    footer.appendChild(applyLinkBtn);
    card.appendChild(footer);

    // Expanded body
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
      const marked = (window as unknown as Record<string, unknown>).marked;
      if (marked && typeof marked === 'object' && 'parse' in marked) {
        const rendered = (marked as { parse: (s: string) => string }).parse(item.aiSummary);
        aiSummary.innerHTML = sanitizeHtml(rendered);
      } else {
        aiSummary.textContent = item.aiSummary;
      }
      body.appendChild(aiSummary);
    }

    if (item.queryAffinity) {
      const queryAffinity = document.createElement('div');
      queryAffinity.className = 'result-queryAffinity';
      const color = item.queryAffinity === 'High' ? '#10b981' : item.queryAffinity === 'Medium' ? '#f59e0b' : '#ef4444';
      queryAffinity.innerHTML = `<span style="color: ${color}; font-weight: 600;">Query Affinity: ${item.queryAffinity}</span>`;
      body.appendChild(queryAffinity);
    }

    if (item.parameters && item.parameters.length > 0) {
      const parameters = document.createElement('div');
      parameters.className = 'result-parameters';
      parameters.textContent = `Parameters found: ${item.parameters.join(' • ')}`;
      body.appendChild(parameters);
    }

    card.appendChild(body);
    container.appendChild(card);
  }

  // Restore expanded card if it's on the current page
  const savedUrl = expandedCardUrl[currentSource];
  if (savedUrl) {
    const savedCard = container.querySelector(`.result-card[data-url="${savedUrl}"]`);
    if (savedCard) {
      savedCard.classList.add('expanded');
    }
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

// ─── Saved Jobs Tab ──────────────────────────────────────────────────────

async function renderSavedJobs(): Promise<void> {
  if (currentTab !== 'saved') return;

  const container = document.getElementById('saved-results-list');
  const noResults = document.getElementById('saved-no-results');
  if (!container) return;

  container.innerHTML = '';

  try {
    const resp = await fetch('/api/job-data/saved');
    if (!resp.ok) throw new Error('Failed to load saved jobs');
    const allSaved = await resp.json() as ScraperResult[];

    const totalElem = document.getElementById('saved-meta-total');
    if (totalElem) totalElem.textContent = String(allSaved.length);

    const sourcesElem = document.getElementById('saved-meta-sources');
    if (sourcesElem) {
      const sources = new Set(allSaved.map(r => r.source));
      sourcesElem.textContent = sources.size > 0 ? Array.from(sources).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ') : 'None';
    }

    if (allSaved.length === 0) {
      if (noResults) noResults.style.display = 'block';
      return;
    }
    if (noResults) noResults.style.display = 'none';

    for (const item of allSaved) {
      const card = createJobCard(item, 'saved');
      container.appendChild(card);
    }
  } catch (err: unknown) {
    console.error('Failed to load saved jobs:', (err as Error).message);
    showToast({ message: 'Failed to load saved jobs', type: 'error' });
  }
}

// ─── Job Dashboard Tab ───────────────────────────────────────────────────

const DASHBOARD_LISTS = [
  { id: 'applied', title: 'Applied' },
  { id: 'screening', title: 'Screening' },
  { id: 'tech', title: 'Tech round' },
  { id: 'client', title: 'Client interview' },
  { id: 'offer', title: 'Offer/Cultural fit' },
  { id: 'hired', title: 'Hired' },
] as const;

type DashboardListId = typeof DASHBOARD_LISTS[number]['id'];

const ROUND_LIST_IDS: Set<DashboardListId> = new Set(['screening', 'tech', 'client', 'offer']);

function isRoundStatus(listId: DashboardListId): boolean {
  return ROUND_LIST_IDS.has(listId);
}

const STATUS_TO_LIST: Record<string, DashboardListId> = {
  'No News': 'applied',
  'Interviewing': 'screening',
  'Offer': 'offer',
  'Rejected': 'hired',
};

const LIST_TO_STATUS: Record<DashboardListId, string> = {
  applied: 'No News',
  screening: 'Interviewing',
  tech: 'Interviewing',
  client: 'Interviewing',
  offer: 'Offer',
  hired: 'Rejected',
};

function getColumnForJob(job: ScraperResult): DashboardListId {
  if (job.column && (DASHBOARD_LISTS as readonly { id: DashboardListId }[]).some(l => l.id === job.column)) {
    return job.column as DashboardListId;
  }
  return STATUS_TO_LIST[job.status || 'No News'] || 'applied';
}

  let draggedCardUrl: string | null = null;
  let draggedCardId: string | null = null;
  let draggedCardSourceListId: DashboardListId | null = null;

async function renderDashboard(): Promise<void> {
  if (currentTab !== 'dashboard') return;

  const board = document.getElementById('dashboard-board');
  if (!board) return;

  board.innerHTML = '';

  try {
    const resp = await fetch('/api/job-data/dashboard');
    if (!resp.ok) throw new Error('Failed to load dashboard');
    const jobs = await resp.json() as ScraperResult[];

    const totalElem = document.getElementById('dashboard-meta-total');
    if (totalElem) totalElem.textContent = String(jobs.length);

    const statusesElem = document.getElementById('dashboard-meta-statuses');
    if (statusesElem) {
      const statuses = new Set(jobs.map(j => j.status || 'No News'));
      statusesElem.textContent = statuses.size > 0 ? Array.from(statuses).join(', ') : 'None';
    }

    const jobsByList = new Map<DashboardListId, ScraperResult[]>();
    for (const job of jobs) {
      const listId = getColumnForJob(job);
      const list = jobsByList.get(listId) || [];
      list.push(job);
      jobsByList.set(listId, list);
    }

    for (const listDef of DASHBOARD_LISTS) {
      const listJobs = jobsByList.get(listDef.id) || [];
      const listEl = createBoardList(listDef, listJobs);
      board.appendChild(listEl);
    }

    initBoardDragAndDrop();
  } catch (err: unknown) {
    console.error('Failed to load dashboard:', (err as Error).message);
    showToast({ message: 'Failed to load dashboard', type: 'error' });
  }
}

function createBoardList(listDef: { id: DashboardListId; title: string }, jobs: ScraperResult[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'board-list';
  list.dataset.listId = listDef.id;

  const header = document.createElement('div');
  header.className = 'board-list-header';
  header.textContent = listDef.title;

  const count = document.createElement('span');
  count.className = 'board-list-count';
  count.textContent = String(jobs.length);
  header.appendChild(count);

  list.appendChild(header);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'board-cards-container';
  cardsContainer.dataset.listId = listDef.id;

  for (const job of jobs) {
    const card = createBoardCard(job, listDef.id);
    cardsContainer.appendChild(card);
  }

  list.appendChild(cardsContainer);

  const addBtn = document.createElement('button');
  addBtn.className = 'board-add-card-btn';
  addBtn.textContent = '+ Add a card';
  addBtn.addEventListener('click', () => showBoardComposer(addBtn));
  list.appendChild(addBtn);

  const composer = document.createElement('div');
  composer.className = 'board-card-composer';
  composer.innerHTML = `
    <textarea placeholder="Enter job title or note..."></textarea>
    <div class="board-composer-actions">
      <button class="board-btn-confirm">Add card</button>
      <button class="board-btn-cancel">&times;</button>
    </div>
  `;

  const textarea = composer.querySelector('textarea') as HTMLTextAreaElement;
  const confirmBtn = composer.querySelector('.board-btn-confirm') as HTMLButtonElement;
  const cancelBtn = composer.querySelector('.board-btn-cancel') as HTMLButtonElement;
  confirmBtn.addEventListener('click', async () => {

    const text = textarea.value.trim();
    if (!text) return;

    const newJob: ScraperResult = {
      title: text,
      url: '',
      snippet: '',
      source: 'linkedin',
      company: '',
      status: LIST_TO_STATUS[listDef.id] as 'No News' | 'Interviewing' | 'Offer' | 'Rejected',
      column: listDef.id,
      savedAt: new Date().toISOString(),
      appliedAt: new Date().toISOString(),
      saved: true,
      applied: true,
      id: 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    };

    try {
      const resp = await fetch('/api/job-data/dashboard/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob),
      });
      if (!resp.ok) throw new Error('Failed to add job');
      showToast({ message: 'Job added to dashboard', type: 'success' });
      renderDashboard();
    } catch (err: unknown) {
      showToast({ message: 'Failed to add job: ' + (err as Error).message, type: 'error' });
    }
  });

  cancelBtn.addEventListener('click', () => hideBoardComposer(cancelBtn));

  list.appendChild(composer);

  return list;
}

function createBoardCard(job: ScraperResult, listId: DashboardListId): HTMLElement {
  const card = document.createElement('div');
  card.className = 'board-card';
  card.draggable = true;
  card.dataset.url = job.url;
  if (job.id) {
    card.dataset.id = job.id;
  }

  if (isRoundStatus(listId)) {
    const roundsContainer = document.createElement('div');
    roundsContainer.className = 'board-card-rounds';

    const roundsToggle = document.createElement('button');
    roundsToggle.className = 'board-card-rounds-toggle';
    roundsToggle.textContent = (job.interviewRounds || 0) > 0 ? '+/-' : '+';

    const tooltip = document.createElement('span');
    tooltip.className = 'board-card-rounds-tooltip';
    tooltip.textContent = 'Counter control for rounds within current status';
    roundsToggle.appendChild(tooltip);

    roundsToggle.addEventListener('mouseenter', () => {
      const rect = roundsToggle.getBoundingClientRect();
      tooltip.style.left = `${rect.right - 220}px`;
      tooltip.style.top = `${rect.top - 8}px`;
      tooltip.style.transform = 'translateY(-100%)';
    });

    roundsToggle.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const menu = roundsContainer.querySelector('.board-card-rounds-menu');
      const allMenus = document.querySelectorAll('.board-card-rounds-menu.show');
      allMenus.forEach((m) => {
        if (m !== menu) m.classList.remove('show');
      });
      if (menu) {
        const menuEl = menu as HTMLElement;
        const rect = roundsToggle.getBoundingClientRect();
        menuEl.style.left = `${rect.right - 110}px`;
        menuEl.style.top = `${rect.bottom + 4}px`;
        menuEl.classList.toggle('show');
      }
    });

    const roundsCount = document.createElement('span');
    roundsCount.className = 'board-card-rounds-count';
    roundsCount.textContent = String(job.interviewRounds || 0);

    const roundsMenu = document.createElement('div');
    roundsMenu.className = 'board-card-rounds-menu';

    const incrementItem = document.createElement('button');
    incrementItem.className = 'board-card-rounds-menu-item';
    incrementItem.textContent = 'Increment';
    incrementItem.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      roundsMenu.classList.remove('show');
      updateInterviewRounds(job, 1);
    });

    const decrementItem = document.createElement('button');
    decrementItem.className = 'board-card-rounds-menu-item';
    if ((job.interviewRounds || 0) === 0) {
      decrementItem.classList.add('disabled');
    }
    decrementItem.textContent = 'Decrement';
    decrementItem.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      if ((job.interviewRounds || 0) > 0) {
        roundsMenu.classList.remove('show');
        updateInterviewRounds(job, -1);
      }
    });

    roundsMenu.appendChild(incrementItem);
    roundsMenu.appendChild(decrementItem);

    roundsContainer.appendChild(roundsToggle);
    roundsContainer.appendChild(roundsCount);
    roundsContainer.appendChild(roundsMenu);

    card.appendChild(roundsContainer);
  }

  const title = document.createElement('div');
  title.className = 'board-card-title';
  title.textContent = job.title || 'Untitled Job';
  card.appendChild(title);

  if (job.company) {
    const company = document.createElement('div');
    company.className = 'board-card-company';
    company.textContent = job.company;
    card.appendChild(company);
  }

  const footer = document.createElement('div');
  footer.className = 'board-card-footer';
  footer.style.position = 'relative';

  const sourceBadge = document.createElement('span');
  sourceBadge.className = `board-card-source ${job.source}`;
  sourceBadge.textContent = job.source === 'linkedin' ? 'LinkedIn' : 'Google';
  footer.appendChild(sourceBadge);

  if (job.postedDate) {
    const date = document.createElement('span');
    date.className = 'board-card-meta';
    date.textContent = job.postedDate;
    footer.appendChild(date);
  }

  const menuBtn = document.createElement('button');
  menuBtn.className = 'board-card-menu-btn';
  menuBtn.textContent = '⋯';
  menuBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    const currentMenu = card.querySelector('.board-card-menu');
    const allMenus = document.querySelectorAll('.board-card-menu.show');
    allMenus.forEach((m) => {
      if (m !== currentMenu) m.classList.remove('show');
    });
    if (currentMenu) {
      const menuEl = currentMenu as HTMLElement;
      const rect = menuBtn.getBoundingClientRect();
      menuEl.style.left = `${rect.right - 140}px`;
      menuEl.style.top = `${rect.bottom + 4}px`;
      menuEl.classList.toggle('show');
    }
  });
  footer.appendChild(menuBtn);

  card.appendChild(footer);

  const menu = document.createElement('div');
  menu.className = 'board-card-menu';

  const renameItem = document.createElement('button');
  renameItem.className = 'board-card-menu-item';
  renameItem.textContent = 'Rename';
  renameItem.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    menu.classList.remove('show');
    startRename(card, title, job);
  });
  menu.appendChild(renameItem);

  const deleteItem = document.createElement('button');
  deleteItem.className = 'board-card-menu-item danger';
  deleteItem.textContent = 'Delete';
  deleteItem.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    menu.classList.remove('show');
    handleDashboardDelete(job);
  });
  menu.appendChild(deleteItem);

  card.appendChild(menu);

  card.addEventListener('dragstart', (e: DragEvent) => {
    draggedCardUrl = job.url;
    draggedCardId = job.id || null;
    // Capture source column at drag start (before card might move during dragover)
    const sourceContainer = card.closest('.board-cards-container') as HTMLElement | null;
    draggedCardSourceListId = (sourceContainer?.dataset.listId as DashboardListId) || null;
    setTimeout(() => card.classList.add('dragging'), 0);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCardUrl = null;
    draggedCardId = null;
    draggedCardSourceListId = null;
  });

  return card;
}

function startRename(card: HTMLElement, titleEl: HTMLElement, job: ScraperResult): void {
  const currentTitle = job.title || '';
  const currentTitleEl = card.querySelector('.board-card-title') || titleEl;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentTitle;
  input.style.cssText = 'width: 100%; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 8px; color: #e2e8f0; font-family: Comfortaa, sans-serif; font-size: 13px; outline: none;';

  currentTitleEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = async (save: boolean) => {
    const newTitle = save ? input.value.trim() : currentTitle;
    const titleChanged = save && newTitle && newTitle !== currentTitle;
    if (titleChanged) {
      try {
        const body: Record<string, string> = { title: newTitle };
        if (job.url) {
          body.url = job.url;
        } else if (job.id) {
          body.id = job.id;
        }
        const resp = await fetch('/api/job-data/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error('Failed to rename job');
        showToast({ message: 'Job renamed', type: 'success' });
      } catch (err: unknown) {
        showToast({ message: 'Error: ' + (err as Error).message, type: 'error' });
      }
    } else if (save) {
      // Save without changes - acknowledge but don't call API
      showToast({ message: 'No changes made', type: 'info' });
    }

    const newTitleEl = document.createElement('div');
    newTitleEl.className = 'board-card-title';
    newTitleEl.textContent = newTitle || 'Untitled Job';
    input.replaceWith(newTitleEl);
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      finish(false);
    }
  });
}

function updateInterviewRounds(job: ScraperResult, delta: number): void {
  fetch('/api/job-data/rounds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: job.url, id: job.id, delta }),
  }).then((resp) => {
    if (resp.ok) {
      renderDashboard();
    }
  }).catch(() => {
    // ignore
  });
}

function handleDashboardDelete(job: ScraperResult): void {
  confirmDelete(
    'job',
    async () => {
      try {
        const body: Record<string, string> = {};
        if (job.url) {
          body.url = job.url;
        } else if (job.id) {
          body.id = job.id;
        }
        const resp = await fetch('/api/job-data/dashboard/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({ error: 'Failed to delete job' }));
          throw new Error(errData.error || 'Failed to delete job');
        }
        showToast({ message: 'Job removed from dashboard', type: 'success' });
        renderDashboard();
      } catch (err: unknown) {
        showToast({ message: 'Error: ' + (err as Error).message, type: 'error' });
      }
    },
    { variant: 'danger', message: 'This card will be removed from the board. Do you want to continue?' }
  );
}

function initBoardDragAndDrop(): void {
  const containers = document.querySelectorAll('.board-cards-container');
  containers.forEach(container => {
    container.addEventListener('dragover', (e: Event) => {
      e.preventDefault();
      if (!draggedCardUrl && !draggedCardId) return;
      const afterElement = getDragAfterElement(container, (e as DragEvent).clientY);
      const card = draggedCardUrl
        ? document.querySelector(`.board-card[data-url="${draggedCardUrl}"]`) as HTMLElement | null
        : document.querySelector(`.board-card[data-id="${draggedCardId}"]`) as HTMLElement | null;
      if (!card) return;
      if (afterElement == null) {
        container.appendChild(card);
      } else {
        container.insertBefore(card, afterElement);
      }
    });

    container.addEventListener('drop', async (e: Event) => {
      e.preventDefault();
      if (!draggedCardUrl && !draggedCardId) return;
      const newListId = (container as HTMLElement).dataset.listId as DashboardListId;
      // Use the source column captured at dragstart (before dragover moves the card)
      const currentListId = draggedCardSourceListId;
      if (currentListId && newListId && currentListId === newListId) {
        showToast({ message: 'Already in this column', type: 'info' });
        return;
      }
      const newStatus = LIST_TO_STATUS[newListId];
      try {
        const body: Record<string, string> = { status: newStatus, column: newListId };
        if (draggedCardUrl) {
          body.url = draggedCardUrl;
        } else if (draggedCardId) {
          body.id = draggedCardId;
        }
        const resp = await fetch('/api/job-data/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) throw new Error('Failed to update status');
        showToast({ message: 'Status updated', type: 'success' });
        renderDashboard();
      } catch (err: unknown) {
        showToast({ message: 'Failed to update status: ' + (err as Error).message, type: 'error' });
      }
    });
  });
}

function getDragAfterElement(container: Element, y: number): Element | null {
  const draggableElements = [...container.querySelectorAll('.board-card:not(.dragging)')];
  const result = draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: -Infinity } as { offset: number; element?: Element });
  return result.element || null;
}

function showBoardComposer(btn: HTMLButtonElement): void {
  btn.style.display = 'none';
  const composer = btn.nextElementSibling as HTMLElement;
  if (!composer) return;
  composer.style.display = 'flex';
  const textarea = composer.querySelector('textarea') as HTMLTextAreaElement;
  if (textarea) textarea.focus();
}

function hideBoardComposer(btn: HTMLButtonElement): void {
  const composer = btn.closest('.board-card-composer') as HTMLElement;
  if (!composer) return;
  composer.style.display = 'none';
  const addBtn = composer.previousElementSibling as HTMLElement;
  if (addBtn) addBtn.style.display = 'flex';
  const textarea = composer.querySelector('textarea');
  if (textarea) (textarea as HTMLTextAreaElement).value = '';
}

// ─── Card Creation Helper ────────────────────────────────────────────────

function createJobCard(item: ScraperResult, view: 'scraping' | 'saved' | 'dashboard'): HTMLElement {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.dataset.url = item.url;

  // Header
  const header = document.createElement('div');
  header.className = 'result-card-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'result-title';
  titleEl.textContent = item.title;

  const headerActions = document.createElement('div');
  headerActions.className = 'result-card-actions';

  // Source badge
  const sourceBadge = document.createElement('span');
  sourceBadge.className = `result-source-badge ${item.source}`;
  sourceBadge.textContent = item.source === 'linkedin' ? 'LinkedIn' : 'Google';
  headerActions.appendChild(sourceBadge);

  // Status badge (dashboard only)
  if (view === 'dashboard' && item.status) {
    const statusBadge = document.createElement('span');
    statusBadge.className = 'result-source-badge';
    statusBadge.style.background = 'rgba(37, 99, 235, 0.2)';
    statusBadge.style.color = '#60a5fa';
    statusBadge.style.border = '1px solid rgba(37, 99, 235, 0.3)';
    statusBadge.textContent = item.status as string;
    headerActions.appendChild(statusBadge);
  }

  // Actions based on view
  if (view === 'scraping') {
    const saveBtn = document.createElement('button');
    saveBtn.className = 'card-action-btn save';
    saveBtn.textContent = item.saved ? 'Saved ✓' : 'Save';
    saveBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleSave(item, item.source);
    });
    headerActions.appendChild(saveBtn);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'card-action-btn apply';
    applyBtn.textContent = 'Applied?';
    applyBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleApply(item, item.source);
    });
    headerActions.appendChild(applyBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-action-btn remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleRemove(item, item.source);
    });
    headerActions.appendChild(removeBtn);
  } else if (view === 'saved') {
    const unsaveBtn = document.createElement('button');
    unsaveBtn.className = 'card-action-btn unsave';
    unsaveBtn.textContent = 'Unsave';
    unsaveBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleUnsave(item, item.source);
    });
    headerActions.appendChild(unsaveBtn);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'card-action-btn apply';
    applyBtn.textContent = 'Applied?';
    applyBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      handleApply(item, item.source);
    });
    headerActions.appendChild(applyBtn);
  } else if (view === 'dashboard') {
    // Future: status transition dropdown
    const statusLabel = document.createElement('span');
    statusLabel.style.cssText = 'font-size: 11px; color: #94a3b8;';
    statusLabel.textContent = `Saved: ${item.savedAt ? new Date(item.savedAt).toLocaleDateString() : 'N/A'}`;
    headerActions.appendChild(statusLabel);
  }

  header.appendChild(titleEl);
  header.appendChild(headerActions);
  card.appendChild(header);

  // Footer
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

  const applyLinkBtn = document.createElement('a');
  applyLinkBtn.className = 'result-link-btn';
  applyLinkBtn.href = item.url;
  applyLinkBtn.target = '_blank';
  applyLinkBtn.rel = 'noopener noreferrer';
  applyLinkBtn.textContent = 'Apply ↗';
  footer.appendChild(footerLeft);
  footer.appendChild(applyLinkBtn);
  card.appendChild(footer);

  // Expanded body
  const body = document.createElement('div');
  body.className = 'result-card-body';

  if (item.snippet) {
    const snippet = document.createElement('div');
    snippet.className = 'result-snippet';
    snippet.textContent = item.snippet.length > 100 ? item.snippet.substring(0, 100) + '...' : item.snippet;
    body.appendChild(snippet);
  }

  if (item.aiSummary) {
    const aiSummary = document.createElement('div');
    aiSummary.className = 'result-ai-summary';
    const marked = (window as unknown as Record<string, unknown>).marked;
    if (marked && typeof marked === 'object' && 'parse' in marked) {
      const rendered = (marked as { parse: (s: string) => string }).parse(item.aiSummary);
      aiSummary.innerHTML = sanitizeHtml(rendered);
    } else {
      aiSummary.textContent = item.aiSummary;
    }
    body.appendChild(aiSummary);
  }

  if (item.parameters && item.parameters.length > 0) {
    const parameters = document.createElement('div');
    parameters.className = 'result-parameters';
    parameters.textContent = `Parameters found: ${item.parameters.join(' • ')}`;
    body.appendChild(parameters);
  }

  card.appendChild(body);
  return card;
}

// ─── Card Actions ────────────────────────────────────────────────────────

async function handleSave(item: ScraperResult, source: 'linkedin' | 'google'): Promise<void> {
  try {
    const resp = await fetch('/api/job-data/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, source }),
    });
    if (!resp.ok) throw new Error('Failed to save job');
    showToast({ message: 'Job saved successfully', type: 'success' });
    renderScrapingResults();
  } catch (err: unknown) {
    showToast({ message: 'Failed to save job: ' + (err as Error).message, type: 'error' });
  }
}

function handleRemove(item: ScraperResult, source: 'linkedin' | 'google'): void {
  confirmDelete(
    'job',
    async () => {
      try {
        const resp = await fetch('/api/job-data/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, source }),
        });
        if (!resp.ok) throw new Error('Failed to remove job');

        if (payloadsBySource[source] && payloadsBySource[source]!.results) {
          payloadsBySource[source]!.results = payloadsBySource[source]!.results.filter(r => r.url !== item.url);
          payloadsBySource[source]!.totalResults = payloadsBySource[source]!.results.length;
          const totalPages = Math.ceil(payloadsBySource[source]!.results.length / RESULTS_PER_PAGE) || 1;
          if (currentPage > totalPages) {
            currentPage = 1;
          }
        }

        showRefreshMessage();
        renderScrapingResults();
      } catch (err: unknown) {
        showToast({ message: 'Error: ' + (err as Error).message, type: 'error' });
      }
    }
  );
}

async function handleApply(item: ScraperResult, source: 'linkedin' | 'google'): Promise<void> {
  showApplyModal({
    item,
    onConfirm: async (name: string) => {
      try {
        const resp = await fetch('/api/job-data/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item, source, customTitle: name }),
        });
        if (resp.status === 409) {
          const data = await resp.json() as { error?: string };
          showToast({ message: data.error || 'Card is already on board', type: 'error' });
          return;
        }
        if (!resp.ok) throw new Error('Failed to apply to job');
        showToast({ message: 'Job moved to dashboard', type: 'success' });
        renderScrapingResults();
      } catch (err: unknown) {
        showToast({ message: 'Failed to apply to job: ' + (err as Error).message, type: 'error' });
      }
    },
  });
}

function handleUnsave(item: ScraperResult, source: 'linkedin' | 'google'): void {
  confirmUnsave(
    'job',
    async () => {
      try {
        const resp = await fetch('/api/job-data/unsave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url, source }),
        });
        if (!resp.ok) throw new Error('Failed to unsave job');
        showToast({ message: 'Job removed from saved jobs', type: 'success' });
        renderSavedJobs();
      } catch (err: unknown) {
        showToast({ message: 'Failed to unsave job: ' + (err as Error).message, type: 'error' });
      }
    }
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────

function prevPage(): void {
  if (currentPage > 1) {
    renderPage(currentPage - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function nextPage(): void {
  const activePayload = payloadsBySource[currentSource];
  if (!activePayload || !activePayload.results) return;
  const totalPages = Math.ceil(activePayload.results.length / RESULTS_PER_PAGE);
  if (currentPage < totalPages) {
    renderPage(currentPage + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ─── ATS Sidebar ─────────────────────────────────────────────────────────

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

function loadScanResults(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem('ats-scan-results');
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.warn('Could not load scan results:', e);
    return null;
  }
}

// ─── Cover Letter Modal Functions ─────────────────────────────────────

function openCoverLetterModal(): void {
  const modal = document.getElementById('cover-letter-modal');
  if (!modal) return;

  document.getElementById('cover-letter-settings')!.style.display = 'flex';
  document.getElementById('cover-letter-loading')!.style.display = 'none';
  document.getElementById('cover-letter-error')!.style.display = 'none';
  document.getElementById('cover-letter-result')!.style.display = 'none';
  document.getElementById('cover-letter-actions')!.style.display = 'flex';
  document.getElementById('cover-letter-result-actions')!.style.display = 'none';

  (document.getElementById('cl-tone') as HTMLSelectElement).value = 'Formal';
  (document.getElementById('cl-english-level') as HTMLSelectElement).value = 'C1';
  (document.getElementById('cl-focus') as HTMLInputElement).value = '';
  (document.getElementById('cl-char-limit') as HTMLInputElement).value = '';

  modal.style.display = 'flex';
}

function closeCoverLetterModal(): void {
  const modal = document.getElementById('cover-letter-modal');
  if (modal) modal.style.display = 'none';
}

async function generateCoverLetter(): Promise<void> {
  const jdTextarea = document.getElementById('jd-edit-textarea') as HTMLTextAreaElement | null;
  const jd = jdTextarea ? jdTextarea.value.trim() : '';
  if (!jd) {
    showToast({ message: 'Please review a Job Description first using the "Check JD" button on a job card.', type: 'error' });
    return;
  }

  const tone = (document.getElementById('cl-tone') as HTMLSelectElement).value;
  const englishLevel = (document.getElementById('cl-english-level') as HTMLSelectElement).value;
  const focusAreas = (document.getElementById('cl-focus') as HTMLInputElement).value.trim();
  const charLimitInput = (document.getElementById('cl-char-limit') as HTMLInputElement).value.trim();
  const charLimit = charLimitInput === '' ? undefined : parseInt(charLimitInput, 10);

  document.getElementById('cover-letter-settings')!.style.display = 'none';
  document.getElementById('cover-letter-actions')!.style.display = 'none';
  document.getElementById('cover-letter-loading')!.style.display = 'block';
  document.getElementById('cover-letter-error')!.style.display = 'none';

  const selectedProvider = localStorage.getItem('selected-ai-provider') || null;

  const atsResults = loadScanResults();
  const atsScore = atsResults ? String(atsResults.overall_score || 'N/A') : 'N/A';
  const atsTier = atsResults ? String(atsResults.tier || 'N/A') : 'N/A';
  const atsMissingKeywords = atsResults && Array.isArray(atsResults.missingKeywords)
    ? (atsResults.missingKeywords as string[]).join(', ') || 'None'
    : 'None';
  const atsFeedback = atsResults ? String(atsResults.feedback || 'No feedback available') : 'No ATS scan performed';

  try {
    const response = await fetch('/api/generate-cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobDescription: jd,
        tone,
        englishLevel,
        focusAreas,
        charLimit,
        provider: selectedProvider,
        atsScore,
        atsTier,
        atsMissingKeywords,
        atsFeedback,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: 'Failed to generate cover letter' }));
      throw new Error(errData.error || errData.suggestion || `HTTP ${response.status}`);
    }

    const coverLetterText = await response.text();

    document.getElementById('cover-letter-loading')!.style.display = 'none';
    document.getElementById('cover-letter-result')!.style.display = 'block';
    document.getElementById('cover-letter-result-actions')!.style.display = 'flex';
    (document.getElementById('cover-letter-text') as HTMLTextAreaElement).value = coverLetterText;
  } catch (err: unknown) {
    document.getElementById('cover-letter-loading')!.style.display = 'none';
    document.getElementById('cover-letter-error')!.style.display = 'block';
    document.getElementById('cover-letter-error-text')!.textContent = 'Error: ' + (err as Error).message;
    document.getElementById('cover-letter-actions')!.style.display = 'flex';
  }
}

function copyCoverLetter(): void {
  const text = (document.getElementById('cover-letter-text') as HTMLTextAreaElement).value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast({ message: 'Cover letter copied to clipboard', type: 'success' });
  });
}

function downloadCoverLetter(): void {
  const text = (document.getElementById('cover-letter-text') as HTMLTextAreaElement).value;
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cover-letter.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function applyAtsResultsToUI(screening: Record<string, unknown>): void {
  // Persist the scan under a findJob-specific key so it survives navigation
  // without overwriting the main page's scan (which uses 'ats-scan-results').
  try {
    sessionStorage.setItem('ats-scan-results-findjob', JSON.stringify(screening));
  } catch {
    // ignore storage errors
  }

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

  elSkills.style.color = scoreColor(breakdown.skills_score as number);
  elExp.style.color = scoreColor(breakdown.experience_years_score as number);
  elEdu.style.color = breakdown.education_match ? '#10b981' : '#ef4444';

  const kwEl = document.getElementById('ats-keywords')!;
  const missingKeywords = screening.missingKeywords as string[] | undefined;
  const feedbackStr = (screening.feedback as string) || '';
  const isNoFurtherScoring = feedbackStr.toLowerCase().includes('no further scoring') || screening.overall_score === 0;

  if (missingKeywords && missingKeywords.length > 0) {
    kwEl.textContent = '';
    kwEl.style.color = '';
    for (const k of missingKeywords) {
      const span = document.createElement('span');
      span.className = 'result-keyword';
      span.textContent = k;
      kwEl.appendChild(span);
    }
  } else if (isNoFurtherScoring) {
    kwEl.textContent = 'N/A';
    kwEl.style.color = 'rgba(255,255,255,0.7)';
  } else {
    kwEl.textContent = 'None detected \u2014 great match!';
    kwEl.style.color = '#86efac';
  }

  const poweredByContainer = document.getElementById('ats-poweredBy');
  if (poweredByContainer) {
    const provider = (screening.provider as string) || '';
    const model = (screening.model as string) || '';
    const span = poweredByContainer.querySelector('.ai-powered');
    if (span) {
      span.textContent = provider && model ? `${provider}/${model}` : provider || model || '\u2014';
    } else {
      poweredByContainer.textContent = provider && model ? `${provider}/${model}` : provider || model || '\u2014';
    }
  }

  document.getElementById('ats-scan-again-msg')!.style.display = 'none';
  document.getElementById('ats-breakdown-section')!.style.display = 'block';

  document.getElementById('ats-loading')!.classList.remove('show');
  openAtsSidebar();
}

// ─── JD Edit Modal ───────────────────────────────────────────────────────

function openJdEditModal(item: ScraperResult): void {
  const modal = document.getElementById('jd-edit-modal');
  const textarea = document.getElementById('jd-edit-textarea') as HTMLTextAreaElement;
  const loading = document.getElementById('jd-fetch-loading');
  const scanBtn = document.getElementById('btn-scan-jd') as HTMLButtonElement;

  if (!modal) return;

  const fallbackParts: string[] = [];
  if (item.title) fallbackParts.push(item.title);
  if (item.company) fallbackParts.push(`Company: ${item.company}`);
  if (item.snippet) fallbackParts.push(item.snippet);
  if (item.aiSummary) fallbackParts.push(stripMarkdown(item.aiSummary));
  const fallbackContent = fallbackParts.join('\n\n');

  textarea.value = fallbackContent;
  textarea.disabled = true;
  scanBtn.disabled = true;
  if (loading) loading.classList.add('show');

  modal.classList.add('show');

  fetchJobDescription(item.url)
    .then(async (rawText) => {
      const textToClean = rawText || fallbackContent;
      try {
        const cleanResp = await fetch('/api/ats/clean-jd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobDescription: textToClean,
            url: item.url,
            source: item.source,
          }),
        });

        if (cleanResp.status === 409) {
          const errData = await cleanResp.json() as { error?: string; message?: string };
          closeJdEditModal();
          showJdCollectionModal(errData.message || 'This link belongs to a collection of jobs. ATS scan is not possible.');
          return;
        }

        if (cleanResp.ok) {
          const cleanData = await cleanResp.json() as { cleanedJD?: string };
          textarea.value = cleanData.cleanedJD || textToClean;
        } else {
          textarea.value = textToClean;
        }
      } catch {
        textarea.value = textToClean;
      }

      textarea.disabled = false;
      scanBtn.disabled = false;
      if (loading) loading.classList.remove('show');
    })
    .catch((err) => {
      // Session-expired: surface the message instead of silently running
      // clean-jd on the fallback content (which would recreate the bug).
      if (err instanceof Error && err.message.includes('LinkedIn session expired')) {
        closeJdEditModal();
        showJdCollectionModal(err.message);
        return;
      }
      textarea.value = fallbackContent;
      textarea.disabled = false;
      scanBtn.disabled = false;
      if (loading) loading.classList.remove('show');
    });
}

function showJdCollectionModal(message: string): void {
  const modal = document.getElementById('jd-collection-modal');
  const msgEl = document.getElementById('jd-collection-message');
  if (modal) modal.style.display = 'flex';
  if (msgEl) msgEl.textContent = message;
}

function closeJdCollectionModal(): void {
  const modal = document.getElementById('jd-collection-modal');
  if (modal) modal.style.display = 'none';
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
    // Surface a LinkedIn session-expiry so the caller can tell the user to
    // regenerate the session, instead of silently falling back to the login page.
    if (resp.status === 503) {
      const errData = await resp.json() as { error?: string; message?: string };
      if (errData.error === 'LINKEDIN_SESSION_EXPIRED') {
        throw new Error(errData.message || 'LinkedIn session expired. Run: tsx scripts/linkedin-auth.ts');
      }
    }
  } catch (err) {
    // Re-throw the session-expired error; swallow all other errors (fallback).
    if (err instanceof Error && err.message.includes('LinkedIn session expired')) {
      throw err;
    }
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
    showToast({ message: 'Please enter a job description text.', type: 'error' });
    return;
  }

  closeJdEditModal();

  const loading = document.getElementById('ats-loading');
  if (loading) loading.classList.add('show');
  openAtsSidebar();

  try {
    const selectedProvider = localStorage.getItem('selected-ai-provider') || null;
    const resp = await fetch('/api/ats/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription: jdText, provider: selectedProvider }),
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

// ─── Dot Animation ───────────────────────────────────────────────────────

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

// ─── Job Scraper UI Logic ───────────────────────────────────────────
async function openJobScraperModal(): Promise<void> {
  const dropdown = document.getElementById('actions-dropdown');
  if (dropdown) dropdown.classList.add('hidden');

  // Reset form fields
  const roleInput = document.getElementById('scraper-role') as HTMLInputElement;
  if (roleInput) roleInput.value = '';
  const keywordsInput = document.getElementById('scraper-keywords') as HTMLInputElement;
  if (keywordsInput) keywordsInput.value = '';
  const senioritySelect = document.getElementById('scraper-seniority') as HTMLSelectElement;
  if (senioritySelect) senioritySelect.value = '';
  const datePostedSelect = document.getElementById('scraper-date-posted') as HTMLSelectElement;
  if (datePostedSelect) datePostedSelect.value = 'week';
  const workTypeSelect = document.getElementById('scraper-work-type') as HTMLSelectElement;
  if (workTypeSelect) workTypeSelect.value = '';
  const employmentSelect = document.getElementById('scraper-employment') as HTMLSelectElement;
  if (employmentSelect) employmentSelect.value = '';
  const googleSeniorityInput = document.getElementById('scraper-seniority-google') as HTMLInputElement;
  if (googleSeniorityInput) googleSeniorityInput.value = '';
  const googleEmploymentInput = document.getElementById('scraper-employment-google') as HTMLInputElement;
  if (googleEmploymentInput) googleEmploymentInput.value = '';
  const countryInput = document.getElementById('scraper-country') as HTMLInputElement;
  if (countryInput) countryInput.value = '';
  const regionSelect = document.getElementById('scraper-region') as HTMLSelectElement;
  if (regionSelect) regionSelect.value = '';
  const currencySelect = document.getElementById('scraper-currency') as HTMLSelectElement;
  if (currencySelect) currencySelect.value = '';

  // Reset domain checkboxes: all default sites checked by default (so the
  // initial query includes them), and the master select-all checkbox too
  const domainBoxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:not(#select-all-domains)')) as HTMLInputElement[];
  domainBoxes.forEach(cb => { cb.checked = true; });
  const selectAllCb = document.getElementById('select-all-domains') as HTMLInputElement | null;
  if (selectAllCb) selectAllCb.checked = true;

  clearRoleError();

  const modal = document.getElementById('job-scraper-modal');
  if (modal) modal.style.display = 'flex';

  switchScraperPlatform('linkedin');
  updateQueryPreview();
  await refreshScrapingResultsButton();
}

function closeJobScraperModal(): void {
  const modal = document.getElementById('job-scraper-modal');
  if (modal) modal.style.display = 'none';
}

function clearRoleError(): void {
  const errSpan = document.getElementById('scraper-role-error');
  if (errSpan) errSpan.style.display = 'none';
  const roleInput = document.getElementById('scraper-role');
  if (roleInput) roleInput.style.border = '1px solid rgba(255,255,255,0.15)';
}

function switchScraperPlatform(platform: 'linkedin' | 'google'): void {
  currentScraperPlatform = platform;
  const btnLinkedin = document.getElementById('toggle-platform-linkedin');
  const btnGoogle = document.getElementById('toggle-platform-google');
  const linkedinRow1 = document.getElementById('scraper-row-linkedin-1');
  const linkedinRow2 = document.getElementById('scraper-row-linkedin-2');
  const googleSeniorityField = document.getElementById('scraper-field-seniority-google');
  const googleEmploymentField = document.getElementById('scraper-field-employment-google');
  const googleSection = document.getElementById('google-domains-section');
  const countryField = document.getElementById('scraper-field-country');
  const regionField = document.getElementById('scraper-field-region');
  const currencyField = document.getElementById('scraper-field-currency');

  if (platform === 'linkedin') {
    if (btnLinkedin) {
      btnLinkedin.style.background = 'var(--accent)';
      btnLinkedin.style.color = '#fff';
    }
    if (btnGoogle) {
      btnGoogle.style.background = 'transparent';
      btnGoogle.style.color = 'rgba(255,255,255,0.7)';
    }
    // LinkedIn: show LinkedIn rows (seniority, date posted, work type, employment, country, region, currency); hide Google fields
    if (linkedinRow1) linkedinRow1.style.display = 'grid';
    if (linkedinRow2) linkedinRow2.style.display = 'grid';
    if (countryField) countryField.style.display = 'block';
    if (regionField) regionField.style.display = 'block';
    if (currencyField) currencyField.style.display = 'block';
    if (googleSeniorityField) googleSeniorityField.style.display = 'none';
    if (googleEmploymentField) googleEmploymentField.style.display = 'none';
    if (googleSection) googleSection.style.display = 'none';
  } else {
    if (btnGoogle) {
      btnGoogle.style.background = 'var(--accent)';
      btnGoogle.style.color = '#fff';
    }
    if (btnLinkedin) {
      btnLinkedin.style.background = 'transparent';
      btnLinkedin.style.color = 'rgba(255,255,255,0.7)';
    }
    // Google: show Google fields (seniority, employment, country, region, currency, domains); hide LinkedIn rows
    if (linkedinRow1) linkedinRow1.style.display = 'none';
    if (linkedinRow2) linkedinRow2.style.display = 'none';
    if (countryField) countryField.style.display = 'block';
    if (regionField) regionField.style.display = 'block';
    if (currencyField) currencyField.style.display = 'block';
    if (googleSeniorityField) googleSeniorityField.style.display = 'block';
    if (googleEmploymentField) googleEmploymentField.style.display = 'block';
    if (googleSection) googleSection.style.display = 'block';
  }

  updateQueryPreview();
}

function updateQueryPreview(): string {
  const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
  const seniority = currentScraperPlatform === 'google'
    ? (document.getElementById('scraper-seniority-google') as HTMLInputElement)?.value.trim() || ''
    : (document.getElementById('scraper-seniority') as HTMLSelectElement)?.value || '';
  const employmentType = currentScraperPlatform === 'google'
    ? (document.getElementById('scraper-employment-google') as HTMLInputElement)?.value.trim() || ''
    : (document.getElementById('scraper-employment') as HTMLSelectElement)?.value || '';
  const country = (document.getElementById('scraper-country') as HTMLInputElement)?.value.trim() || '';
  const region = (document.getElementById('scraper-region') as HTMLSelectElement)?.value || '';
  const currency = (document.getElementById('scraper-currency') as HTMLSelectElement)?.value || '';
  const datePosted = (document.getElementById('scraper-date-posted') as HTMLSelectElement)?.value || '';
  const workType = (document.getElementById('scraper-work-type') as HTMLSelectElement)?.value || '';
  const keywords = (document.getElementById('scraper-keywords') as HTMLInputElement)?.value.trim() || '';

  const checkedBoxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:checked:not(#select-all-domains)')) as HTMLInputElement[];
  const customDomains = currentScraperPlatform === 'google' ? checkedBoxes.map(cb => cb.value.trim()).filter(Boolean) : undefined;

  // Sync the master "Select All" checkbox with the individual domain checkboxes
  if (currentScraperPlatform === 'google') {
    const selectAll = document.getElementById('select-all-domains') as HTMLInputElement | null;
    if (selectAll) {
      const allDomainBoxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:not(#select-all-domains)')) as HTMLInputElement[];
      const allChecked = allDomainBoxes.length > 0 && allDomainBoxes.every(cb => cb.checked);
      selectAll.checked = allChecked;
    }
  }

  // Delegate to the shared URL builder (single source of truth)
  const generatedUrl = buildQueryUrl(currentScraperPlatform, {
    source: currentScraperPlatform,
    role,
    seniority,
    employmentType,
    country,
    region,
    currency,
    datePosted,
    workType,
    keywords,
    customDomains,
  });

  const previewElem = document.getElementById('query-url-preview');
  if (previewElem) {
    previewElem.textContent = decodeURIComponent(generatedUrl);
  }
  return generatedUrl;
}

function toggleAllDomains(master: HTMLInputElement): void {
  const checkboxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:not(#select-all-domains)')) as HTMLInputElement[];
  checkboxes.forEach(cb => { cb.checked = master.checked; });
  updateQueryPreview();
}

function addCustomDomain(): void {
  const input = document.getElementById('custom-domain-input') as HTMLInputElement;
  if (!input) return;
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!val) return;

  const checklist = document.getElementById('domains-checklist');
  if (checklist) {
    const label = document.createElement('label');
    label.style.fontSize = '12px';
    label.style.color = '#ddd';
    label.style.cursor = 'pointer';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = val;
    cb.checked = true;
    cb.onchange = () => updateQueryPreview();

    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${val}`));
    checklist.appendChild(label);
  }

  input.value = '';
  updateQueryPreview();
}

function openQueryInBrowser(): void {
  // Validate first
  const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
  if (!role) {
    const errSpan = document.getElementById('scraper-role-error');
    if (errSpan) errSpan.style.display = 'block';
    const roleInput = document.getElementById('scraper-role');
    if (roleInput) roleInput.style.border = '1px solid #ef4444';
    return;
  }

  const url = updateQueryPreview();
  window.open(url, '_blank');
}

async function startScraping(): Promise<void> {
  const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
  if (!role) {
    const errSpan = document.getElementById('scraper-role-error');
    if (errSpan) errSpan.style.display = 'block';
    const roleInput = document.getElementById('scraper-role');
    if (roleInput) roleInput.style.border = '1px solid #ef4444';
    return;
  }

  const seniority = currentScraperPlatform === 'google'
    ? (document.getElementById('scraper-seniority-google') as HTMLInputElement)?.value.trim() || ''
    : (document.getElementById('scraper-seniority') as HTMLSelectElement)?.value || '';
  const employmentType = currentScraperPlatform === 'google'
    ? (document.getElementById('scraper-employment-google') as HTMLInputElement)?.value.trim() || ''
    : (document.getElementById('scraper-employment') as HTMLSelectElement)?.value || '';
  const country = (document.getElementById('scraper-country') as HTMLInputElement)?.value.trim() || '';
  const region = (document.getElementById('scraper-region') as HTMLSelectElement)?.value || '';
  const currency = (document.getElementById('scraper-currency') as HTMLSelectElement)?.value || '';
  const datePosted = (document.getElementById('scraper-date-posted') as HTMLSelectElement)?.value || '';
  const workType = (document.getElementById('scraper-work-type') as HTMLSelectElement)?.value || '';
  const keywords = (document.getElementById('scraper-keywords') as HTMLInputElement)?.value.trim() || '';

  const checkedBoxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:checked:not(#select-all-domains)')) as HTMLInputElement[];
  const customDomains = currentScraperPlatform === 'google' ? checkedBoxes.map(cb => cb.value.trim()).filter(Boolean) : undefined;

  const queryPayload = {
    source: currentScraperPlatform,
    role,
    seniority,
    employmentType,
    country,
    region,
    currency,
    datePosted,
    workType,
    keywords,
    customDomains,
  };

  closeJobScraperModal();

  const overlay = document.getElementById('scraper-overlay');
  const label = document.getElementById('scraper-source-label');
  const fallbackBtn = document.getElementById('btn-open-results-fallback');
  if (label) label.textContent = currentScraperPlatform === 'linkedin' ? 'LinkedIn' : 'Google';
  if (fallbackBtn) fallbackBtn.style.display = 'none';
  if (overlay) overlay.style.display = 'flex';

  switchTab('scraping');
  switchResultsTab(currentScraperPlatform);

  scraperController = new AbortController();

  try {
    const resp = await fetch('/api/scraper/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryPayload),
      signal: scraperController.signal,
    });

    if (!resp.ok) {
      if (overlay) overlay.style.display = 'none';
      const err = await resp.json();
      const errMsg = err.error || 'Failed to execute scraper';
      showToast({ message: 'Scraper error: ' + errMsg, type: 'error' });
      return;
    }

    const data = await resp.json();
    // Record the run ID so the poller can match the completed run and hide the
    // overlay once the results file (and background enrichments) are ready.
    if (data && data.runId) {
      currentRunId = data.runId;
    }
    payloadsBySource[currentScraperPlatform] = data;
    
    // If no results returned, show toast and don't start polling
    if (!data.results || data.results.length === 0) {
      if (overlay) overlay.style.display = 'none';
      showToast({ message: 'No results found for this search.', type: 'warning' });
      renderScrapingResults();
      return;
    }
    
    extractionStatus[currentScraperPlatform] = 'extracting';
    sessionStorage.setItem('scraper-results', JSON.stringify(data));
    localStorage.setItem(getScraperResultsStorageKey(currentScraperPlatform), JSON.stringify(data));
    refreshScrapingResultsButton();

    // Show extraction loading state immediately
    renderScrapingResults();

    startPolling(currentScraperPlatform);
  } catch (err: unknown) {
    if (overlay) overlay.style.display = 'none';
    if ((err as Error).name !== 'AbortError') {
      showToast({ message: 'Scraping error: ' + (err as Error).message, type: 'error' });
    }
  }
}

async function refreshScrapingResultsButton(): Promise<void> {
  const btn = document.getElementById('btn-open-scraping-results');
  if (!btn) return;

  const hasResults = await hasSavedScraperResults();
  btn.style.display = hasResults ? 'block' : 'none';
}

async function hasSavedScraperResults(): Promise<boolean> {
  const sources: Array<'linkedin' | 'google'> = ['linkedin', 'google'];
  // First check localStorage (results from current session)
  for (const source of sources) {
    const savedRaw = localStorage.getItem(getScraperResultsStorageKey(source));
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw);
        if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
          return true;
        }
      } catch {
        // ignore malformed local cache values
      }
    }
  }
  // Then check server for existing result files on disk
  for (const source of sources) {
    try {
      const resp = await fetch(`/api/scraper/results?source=${source}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          // Cache in localStorage for future checks
          localStorage.setItem(getScraperResultsStorageKey(source), JSON.stringify(data));
          return true;
        }
      }
    } catch {
      // ignore network errors
    }
  }
  return false;
}

function openLatestScrapingResults(): void {
  const sources: Array<'linkedin' | 'google'> = ['linkedin', 'google'];
  for (const source of sources) {
    const savedRaw = localStorage.getItem(getScraperResultsStorageKey(source));
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw);
        if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
          window.open(`/public/findJob.html?source=${source}`, '_blank');
          return;
        }
      } catch {
        // ignore malformed local cache values
      }
    }
  }

  window.open('/public/findJob.html?source=linkedin', '_blank');
}

function cancelScraping(): void {
  if (scraperController) {
    scraperController.abort();
    scraperController = null;
  }
  const overlay = document.getElementById('scraper-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ─── Global Keyboard ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    const scraperModal = document.getElementById('job-scraper-modal');
    if (scraperModal && scraperModal.style.display !== 'none') {
      closeJobScraperModal();
      return;
    }

    const scraperOverlay = document.getElementById('scraper-overlay');
    if (scraperOverlay && scraperOverlay.style.display !== 'none') {
      cancelScraping();
      return;
    }

    const jdModal = document.getElementById('jd-edit-modal');
    if (jdModal && jdModal.classList.contains('show')) {
      closeJdEditModal();
      return;
    }
    const jdCollectionModal = document.getElementById('jd-collection-modal');
    if (jdCollectionModal && jdCollectionModal.style.display !== 'none') {
      closeJdCollectionModal();
      return;
    }
    const atsSidebar = document.getElementById('ats-sidebar');
    if (atsSidebar && atsSidebar.classList.contains('open')) {
      closeAtsSidebar();
      return;
    }
    const coverLetterModal = document.getElementById('cover-letter-modal');
    if (coverLetterModal && coverLetterModal.style.display === 'flex') {
      closeCoverLetterModal();
      return;
    }
  }
});

document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const insideMenu = target.closest('.board-card-menu') || target.closest('.board-card-menu-btn') || target.closest('.board-card-rounds-menu') || target.closest('.board-card-rounds-toggle');
  if (!insideMenu) {
    document.querySelectorAll('.board-card-menu.show').forEach((menu) => {
      menu.classList.remove('show');
    });
    document.querySelectorAll('.board-card-rounds-menu.show').forEach((menu) => {
      menu.classList.remove('show');
    });
  }
});

// ─── AI Providers Modal Functions ───────────────────────────────────

async function loadEnv(): Promise<Record<string, unknown>> {
  if (cachedConfig) return cachedConfig;
  try {
    const resp = await fetch('/config.json');
    if (resp.ok) {
      cachedConfig = await resp.json() as Record<string, unknown>;
      return cachedConfig;
    }
  } catch (e) {
    console.warn('Could not load config.json, using defaults', e);
  }
  cachedConfig = {};
  return cachedConfig;
}

async function openProvidersModal(): Promise<void> {
  const modal = document.getElementById('providers-modal');
  if (!modal) return;

  const env = await loadEnv();
  const availableProviders = (env.availableProviders as string[]) || [];
  const currentSelected = localStorage.getItem('selected-ai-provider') || (env.primaryProvider as string) || null;
  selectedProviderForModal = currentSelected;

  const subtitleEl = document.getElementById('providers-modal-subtitle');
  const listEl = document.getElementById('providers-list');
  const emptyMsgEl = document.getElementById('providers-empty-message');
  const actionsEl = document.getElementById('providers-modal-actions');
  const cancelBtn = document.getElementById('providers-cancel-btn');
  const confirmBtn = document.getElementById('providers-confirm-btn');

  if (availableProviders.length === 0) {
    if (subtitleEl) subtitleEl.style.display = 'none';
    if (listEl) listEl.style.display = 'none';
    if (emptyMsgEl) emptyMsgEl.style.display = 'block';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (confirmBtn) {
      confirmBtn.style.display = 'inline-block';
      confirmBtn.style.flex = '0 0 auto';
      confirmBtn.style.alignSelf = 'center';
      confirmBtn.style.width = 'auto';
    }
    if (actionsEl) {
      actionsEl.style.flexDirection = 'row';
      actionsEl.style.justifyContent = 'center';
    }
  } else {
    if (subtitleEl) subtitleEl.style.display = 'block';
    if (listEl) listEl.style.display = 'grid';
    if (emptyMsgEl) emptyMsgEl.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    if (confirmBtn) {
      confirmBtn.style.display = 'inline-block';
      confirmBtn.style.flex = '1';
      confirmBtn.style.alignSelf = '';
      confirmBtn.style.width = '';
    }
    if (actionsEl) {
      actionsEl.style.flexDirection = 'row';
      actionsEl.style.justifyContent = 'stretch';
    }
    renderProvidersList(availableProviders, (env.primaryProvider as string) || null);
  }

  modal.style.display = 'flex';
  actionsEl!.style.display = 'flex';
}

function closeProvidersModal(): void {
  const modal = document.getElementById('providers-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function renderProvidersList(providers: string[], selectedProvider: string | null): void {
  const listEl = document.getElementById('providers-list');
  if (!listEl) return;

  const providerIcons: Record<string, string> = {
    cohere: '/public/assets/cohere_icon.png',
    mistral: '/public/assets/mistral_icon.png',
    gemini: '/public/assets/gemini_icon.png',
    groq: '/public/assets/groq_icon.png',
    default: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ctext y="1em" font-size="20"%3E🤖%3C/text%3E%3C/svg%3E',
  };

  const providerModels: Record<string, string> = {
    cohere: 'command-a-reasoning-08-2025-08-2024',
    mistral: 'codestral-2508',
    gemini: 'gemini-3.6-flash',
    groq: 'openai/gpt-oss-120b',
    default: 'Unknown model',
  };

  const providerDescriptions: Record<string, string> = {
    cohere: 'Balanced performance, strong for general tasks',
    mistral: 'Fast, multilingual, great for reasoning',
    gemini: 'Google\'s latest model, vision capable',
    groq: 'Ultra-fast inference, Llama architecture',
    default: 'AI provider for resume generation',
  };

  const currentSelected = localStorage.getItem('selected-ai-provider') || selectedProvider;

  listEl.textContent = '';

  for (const provider of providers) {
    const isSelected = provider === currentSelected;
    const icon = providerIcons[provider] || providerIcons.default;
    const model = providerModels[provider] || providerModels.default;
    const desc = providerDescriptions[provider] || providerDescriptions.default;
    const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);

    const item = document.createElement('div');
    item.className = 'provider-item';
    item.dataset.provider = provider;
    item.addEventListener('click', () => selectProviderInModal(provider));

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'provider-checkbox';
    checkbox.checked = isSelected;
    checkbox.addEventListener('click', (event: Event) => {
      event.stopPropagation();
      selectProviderInModal(provider);
    });

    const header = document.createElement('div');
    header.className = 'provider-header';

    const img = document.createElement('img');
    img.src = icon;
    img.alt = provider;
    img.className = 'provider-img';
    img.addEventListener('error', () => { img.style.display = 'none'; });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'provider-name';
    nameSpan.textContent = displayName;

    header.appendChild(img);
    header.appendChild(nameSpan);

    const modelDiv = document.createElement('div');
    modelDiv.className = 'provider-model';
    modelDiv.textContent = model;

    const descDiv = document.createElement('div');
    descDiv.className = 'provider-description';
    descDiv.textContent = desc;

    item.appendChild(checkbox);
    item.appendChild(header);
    item.appendChild(modelDiv);
    item.appendChild(descDiv);

    listEl.appendChild(item);
  }

  setTimeout(() => {
    document.querySelectorAll('.provider-item').forEach(item => {
      if ((item as HTMLElement).dataset.provider === currentSelected) {
        item.classList.add('selected');
      }
    });
  }, 0);
}

function selectProviderInModal(provider: string): void {
  selectedProviderForModal = provider;
  const items = document.querySelectorAll('.provider-item');
  items.forEach(item => {
    item.classList.remove('selected');
    const checkbox = item.querySelector('.provider-checkbox') as HTMLInputElement;
    if (checkbox) checkbox.checked = false;
  });
  document.querySelectorAll('.provider-item').forEach(item => {
    const el = item as HTMLElement;
    if (el.dataset.provider === provider) {
      el.classList.add('selected');
      const checkbox = el.querySelector('.provider-checkbox') as HTMLInputElement;
      if (checkbox) checkbox.checked = true;
    }
  });
}

function confirmProvidersSelection(): void {
  if (selectedProviderForModal) {
    localStorage.setItem('selected-ai-provider', selectedProviderForModal);
  }
  closeProvidersModal();
}

function cancelProvidersSelection(): void {
  closeProvidersModal();
}

// ─── Global Exports ──────────────────────────────────────────────────────

(window as unknown as Record<string, unknown>).prevPage = prevPage;
(window as unknown as Record<string, unknown>).nextPage = nextPage;
(window as unknown as Record<string, unknown>).closeAtsSidebar = closeAtsSidebar;
(window as unknown as Record<string, unknown>).closeJdEditModal = closeJdEditModal;
(window as unknown as Record<string, unknown>).runAtsScanFromResults = runAtsScanFromResults;
(window as unknown as Record<string, unknown>).switchResultsTab = switchResultsTab;
(window as unknown as Record<string, unknown>).switchTab = switchTab;
(window as unknown as Record<string, unknown>).toggleSidebar = toggleSidebar;
(window as unknown as Record<string, unknown>).openJobScraperModal = openJobScraperModal;
(window as unknown as Record<string, unknown>).closeJobScraperModal = closeJobScraperModal;
(window as unknown as Record<string, unknown>).switchScraperPlatform = switchScraperPlatform;
(window as unknown as Record<string, unknown>).openLatestScrapingResults = openLatestScrapingResults;
(window as unknown as Record<string, unknown>).updateQueryPreview = updateQueryPreview;
(window as unknown as Record<string, unknown>).addCustomDomain = addCustomDomain;
(window as unknown as Record<string, unknown>).toggleAllDomains = toggleAllDomains;
(window as unknown as Record<string, unknown>).openQueryInBrowser = openQueryInBrowser;
(window as unknown as Record<string, unknown>).clearRoleError = clearRoleError;
(window as unknown as Record<string, unknown>).startScraping = startScraping;
(window as unknown as Record<string, unknown>).cancelScraping = cancelScraping;
(window as unknown as Record<string, unknown>).refreshScrapingResultsButton = refreshScrapingResultsButton;
(window as unknown as Record<string, unknown>).closeJdCollectionModal = closeJdCollectionModal;
(window as unknown as Record<string, unknown>).openCoverLetterModal = openCoverLetterModal;
(window as unknown as Record<string, unknown>).closeCoverLetterModal = closeCoverLetterModal;
(window as unknown as Record<string, unknown>).generateCoverLetter = generateCoverLetter;
(window as unknown as Record<string, unknown>).copyCoverLetter = copyCoverLetter;
(window as unknown as Record<string, unknown>).downloadCoverLetter = downloadCoverLetter;
(window as unknown as Record<string, unknown>).openAtsSidebar = openAtsSidebar;
(window as unknown as Record<string, unknown>).openAtsSidebar = openAtsSidebar;
(window as unknown as Record<string, unknown>).openProvidersModal = openProvidersModal;
(window as unknown as Record<string, unknown>).closeProvidersModal = closeProvidersModal;
(window as unknown as Record<string, unknown>).cancelProvidersSelection = cancelProvidersSelection;
(window as unknown as Record<string, unknown>).confirmProvidersSelection = confirmProvidersSelection;
(window as unknown as Record<string, unknown>).clearTestData = clearTestData;

// ─── Init ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isLoadingParam = urlParams.get('loading') === 'true';

  if (isLoadingParam) {
    isLoadingResults = true;
  }

  loadSidebarState();

  const sourceParam = (urlParams.get('source') || 'linkedin').toLowerCase() as 'linkedin' | 'google';
  const runIdParam = urlParams.get('runId');

  if (runIdParam) {
    currentRunId = runIdParam;
  }

  if (isLoadingParam) {
    showLoadingUI(sourceParam);
    currentSource = sourceParam;
    updateResultsTabs(sourceParam);
    startPolling(sourceParam);
    return;
  }

  switchResultsTab(sourceParam);

  // Restore the latest findJob ATS scan (if any) so the sidebar shows it
  // after navigating back to this page.
  try {
    const raw = sessionStorage.getItem('ats-scan-results-findjob');
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      applyAtsResultsToUI(saved);
      openAtsSidebar();
    }
  } catch {
    // ignore malformed saved scan
  }

  // Check for test mode and show warning banner
  fetch('/config.json')
    .then(r => r.json())
    .then(config => {
      const isTestMode = config.NODE_ENV === 'test';
      const warning = document.getElementById('test-data-warning');
      const clearBtn = document.getElementById('clear-test-data-btn');
      if (warning && isTestMode) {
        warning.style.display = 'flex';
      }
      if (clearBtn && isTestMode) {
        clearBtn.style.display = 'inline-flex';
      }
    })
    .catch(() => {
      // Ignore config fetch errors
    });
});

async function clearTestData(): Promise<void> {
  if (!confirm('This will delete ALL dashboard cards. Are you sure?')) return;

  try {
    const resp = await fetch('/api/job-data/dashboard/clear-test', { method: 'POST' });
    if (!resp.ok) throw new Error('Failed to clear test data');
    showToast({ message: 'Test data cleared', type: 'success' });
    renderDashboard();
  } catch (err: unknown) {
    showToast({ message: 'Failed to clear test data: ' + (err as Error).message, type: 'error' });
  }
}
