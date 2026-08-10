import { stripMarkdown, buildQueryUrl, confirmDelete, confirmUnsave, showToast } from './utils';
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
}

// ─── State ───────────────────────────────────────────────────────────────

let currentPayload: ScraperRunPayload | null = null;
let currentPage = 1;
const RESULTS_PER_PAGE = 10;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentRunId: string | null = null;
let currentSource: 'linkedin' | 'google' = 'linkedin';
let currentTab: 'scraping' | 'saved' | 'dashboard' = 'scraping';

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

function switchTab(tab: 'scraping' | 'saved' | 'dashboard'): void {
  currentTab = tab;

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
  const activeTab = localStorage.getItem('findJob.activeTab') as 'scraping' | 'saved' | 'dashboard' | null;

  const sidebar = document.getElementById('findjob-sidebar');
  if (sidebar) {
    if (sidebarOpen === 'false') {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
    }
  }

  if (activeTab && ['scraping', 'saved', 'dashboard'].includes(activeTab)) {
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
        if (data && data.timestamp && data.runId) {
          if (data.runId === currentRunId) {
            if (pollInterval) clearInterval(pollInterval);
            currentPayload = data;
            sessionStorage.setItem('scraper-results', JSON.stringify(data));
            const source = data.source as 'linkedin' | 'google';
            localStorage.setItem(`scraper-results:${source}`, JSON.stringify(data));
            renderScrapingResults();
          }
        }
      } else if (resp.status === 400 || resp.status >= 500) {
        handleScrapeFailure('Scrape request was rejected by the server.');
      }
    } catch {
      // Ignore polling fetch errors
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

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data as { type?: string; error?: string } | undefined;
  if (data && data.type === 'scrapeFailed') {
    handleScrapeFailure(data.error || 'The scraping process could not be completed. Please try again.');
  }
});

async function loadDataAndRender(sourceParam: 'linkedin' | 'google'): Promise<void> {
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

  renderScrapingResults();
}

function renderScrapingResults(): void {
  if (currentTab !== 'scraping') return;

  const badge = document.getElementById('source-badge');
  if (badge && currentPayload) {
    badge.textContent = currentPayload.source === 'linkedin' ? 'LinkedIn' : 'Google';
    badge.className = `source-badge ${currentPayload.source}`;
  }

  if (!currentPayload || !currentPayload.results || currentPayload.results.length === 0) {
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
    });

    // Header: title + actions
    const header = document.createElement('div');
    header.className = 'result-card-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'result-title';
    titleEl.textContent = item.title;

    const headerActions = document.createElement('div');
    headerActions.className = 'result-card-actions';

    // Check JD button
    const checkJdBtn = document.createElement('button');
    checkJdBtn.className = 'result-check-jd-btn';
    checkJdBtn.textContent = 'Check JD 🔍';
    checkJdBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      openJdEditModal(item);
    });
    headerActions.appendChild(checkJdBtn);

    // Action buttons
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

let draggedCardUrl: string | null = null;

async function renderDashboard(): Promise<void> {
  if (currentTab !== 'dashboard') return;

  const board = document.getElementById('dashboard-board');
  const noResults = document.getElementById('dashboard-no-results');
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

    if (jobs.length === 0) {
      if (noResults) noResults.style.display = 'block';
      return;
    }
    if (noResults) noResults.style.display = 'none';

    const jobsByList = new Map<DashboardListId, ScraperResult[]>();
    for (const job of jobs) {
      const listId = STATUS_TO_LIST[job.status || 'No News'] || 'applied';
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
    const card = createBoardCard(job);
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
      savedAt: new Date().toISOString(),
      appliedAt: new Date().toISOString(),
      saved: true,
      applied: true,
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

function createBoardCard(job: ScraperResult): HTMLElement {
  const card = document.createElement('div');
  card.className = 'board-card';
  card.draggable = true;
  card.dataset.url = job.url;

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
    const menu = card.querySelector('.board-card-menu');
    if (menu) {
      menu.classList.toggle('show');
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
    setTimeout(() => card.classList.add('dragging'), 0);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedCardUrl = null;
  });

  return card;
}

function startRename(card: HTMLElement, titleEl: HTMLElement, job: ScraperResult): void {
  const currentTitle = job.title || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentTitle;
  input.style.cssText = 'width: 100%; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 8px; color: #e2e8f0; font-family: Comfortaa, sans-serif; font-size: 13px; outline: none;';

  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = async (save: boolean) => {
    const newTitle = save ? input.value.trim() : currentTitle;
    if (save && newTitle && newTitle !== currentTitle) {
      try {
        const resp = await fetch('/api/job-data/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: job.url, title: newTitle }),
        });
        if (!resp.ok) throw new Error('Failed to rename job');
        showToast({ message: 'Job renamed', type: 'success' });
      } catch (err: unknown) {
        showToast({ message: 'Failed to rename job: ' + (err as Error).message, type: 'error' });
      }
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

function handleDashboardDelete(job: ScraperResult): void {
  confirmDelete(
    'job',
    async () => {
      try {
        const resp = await fetch('/api/job-data/dashboard/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: job.url }),
        });
        if (!resp.ok) throw new Error('Failed to delete job');
        showToast({ message: 'Job removed from dashboard', type: 'success' });
        renderDashboard();
      } catch (err: unknown) {
        showToast({ message: 'Failed to delete job: ' + (err as Error).message, type: 'error' });
      }
    },
    { variant: 'danger' }
  );
}

function initBoardDragAndDrop(): void {
  const containers = document.querySelectorAll('.board-cards-container');
  containers.forEach(container => {
    container.addEventListener('dragover', (e: Event) => {
      e.preventDefault();
      if (!draggedCardUrl) return;
      const afterElement = getDragAfterElement(container, (e as DragEvent).clientY);
      const card = document.querySelector(`.board-card[data-url="${draggedCardUrl}"]`);
      if (!card) return;
      if (afterElement == null) {
        container.appendChild(card);
      } else {
        container.insertBefore(card, afterElement);
      }
    });

    container.addEventListener('drop', async (e: Event) => {
      e.preventDefault();
      if (!draggedCardUrl) return;
      const newListId = (container as HTMLElement).dataset.listId as DashboardListId;
      const newStatus = LIST_TO_STATUS[newListId];
      try {
        const resp = await fetch('/api/job-data/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: draggedCardUrl, status: newStatus }),
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
        showToast({ message: 'Job removed from results', type: 'success' });
        renderScrapingResults();
      } catch (err: unknown) {
        showToast({ message: 'Failed to remove job: ' + (err as Error).message, type: 'error' });
      }
    }
  );
}

async function handleApply(item: ScraperResult, source: 'linkedin' | 'google'): Promise<void> {
  try {
    const resp = await fetch('/api/job-data/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item, source }),
    });
    if (!resp.ok) throw new Error('Failed to apply to job');
    showToast({ message: 'Job moved to dashboard', type: 'success' });
    renderScrapingResults();
  } catch (err: unknown) {
    showToast({ message: 'Failed to apply to job: ' + (err as Error).message, type: 'error' });
  }
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
  if (!currentPayload || !currentPayload.results) return;
  const totalPages = Math.ceil(currentPayload.results.length / RESULTS_PER_PAGE);
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

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
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

  elSkills.style.color = scoreColor(breakdown.skills_score as number);
  elExp.style.color = scoreColor(breakdown.experience_years_score as number);
  elEdu.style.color = breakdown.education_match ? '#10b981' : '#ef4444';

  const kwEl = document.getElementById('ats-keywords')!;
  const missingKeywords = screening.missingKeywords as string[] | undefined;
  if (missingKeywords && missingKeywords.length > 0) {
    kwEl.textContent = '';
    for (const k of missingKeywords) {
      const span = document.createElement('span');
      span.className = 'result-keyword';
      span.textContent = k;
      kwEl.appendChild(span);
    }
  } else {
    kwEl.textContent = 'None detected \u2014 great match!';
    kwEl.style.color = '#86efac';
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
    .then((fullText) => {
      textarea.value = fullText || fallbackContent;
      textarea.disabled = false;
      scanBtn.disabled = false;
      if (loading) loading.classList.remove('show');
    })
    .catch(() => {
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

// ─── Global Keyboard ─────────────────────────────────────────────────────

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

// ─── Global Exports ──────────────────────────────────────────────────────

(window as unknown as Record<string, unknown>).prevPage = prevPage;
(window as unknown as Record<string, unknown>).nextPage = nextPage;
(window as unknown as Record<string, unknown>).closeAtsSidebar = closeAtsSidebar;
(window as unknown as Record<string, unknown>).closeJdEditModal = closeJdEditModal;
(window as unknown as Record<string, unknown>).runAtsScanFromResults = runAtsScanFromResults;
(window as unknown as Record<string, unknown>).switchResultsTab = switchResultsTab;
(window as unknown as Record<string, unknown>).switchTab = switchTab;
(window as unknown as Record<string, unknown>).toggleSidebar = toggleSidebar;

// ─── Init ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadSidebarState();

  const urlParams = new URLSearchParams(window.location.search);
  const sourceParam = (urlParams.get('source') || 'linkedin').toLowerCase() as 'linkedin' | 'google';
  const isLoadingParam = urlParams.get('loading') === 'true';
  const runIdParam = urlParams.get('runId');

  if (runIdParam) {
    currentRunId = runIdParam;
  }

  if (isLoadingParam) {
    showLoadingUI(sourceParam);
    startPolling(sourceParam);
    return;
  }

  switchResultsTab(sourceParam);
});