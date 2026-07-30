interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  author?: string;
  company?: string;
  postedDate?: string;
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

  await loadDataAndRender(sourceParam);
}

function showLoadingUI(source: 'linkedin' | 'google'): void {
  const badge = document.getElementById('source-badge');
  if (badge) {
    badge.textContent = source === 'linkedin' ? '🔗 LinkedIn' : '🔍 Google';
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
          Extracting job listings, parsing company information, and generating AI relevance summaries. This may take 5–15 seconds...
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
        if (data && data.results && data.results.length > 0 && data.timestamp) {
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

function renderResultsUI(): void {
  if (!currentPayload || !currentPayload.results || currentPayload.results.length === 0) {
    const noResults = document.getElementById('no-results');
    if (noResults) noResults.style.display = 'block';
    const pagination = document.getElementById('pagination');
    if (pagination) pagination.style.display = 'none';
    return;
  }

  const badge = document.getElementById('source-badge');
  if (badge) {
    badge.textContent = currentPayload.source === 'linkedin' ? '🔗 LinkedIn' : '🔍 Google';
    badge.className = `source-badge ${currentPayload.source}`;
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
    const parts = [q.keywords, q.role, q.stack, q.employmentType, q.region, q.currency].filter(Boolean);
    queryElem.textContent = parts.length > 0 ? parts.join(' • ') : 'All jobs';
  }

  if (currentPayload.summary) {
    const card = document.getElementById('summary-card');
    const text = document.getElementById('summary-text');
    if (card && text) {
      card.style.display = 'block';
      // Use marked library to render markdown
      const marked = (window as unknown as Record<string, unknown>).marked;
      if (marked && typeof marked === 'object' && 'parse' in marked) {
        text.innerHTML = (marked as { parse: (s: string) => string }).parse(currentPayload.summary);
      } else {
        text.textContent = currentPayload.summary;
      }
    }
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

    const header = document.createElement('div');
    header.className = 'result-card-header';

    const titleLink = document.createElement('a');
    titleLink.className = 'result-title';
    titleLink.href = item.url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.textContent = item.title;

    header.appendChild(titleLink);
    card.appendChild(header);

    if (item.snippet) {
      const snippet = document.createElement('div');
      snippet.className = 'result-snippet';
      snippet.textContent = item.snippet;
      card.appendChild(snippet);
    }

    const footer = document.createElement('div');
    footer.className = 'result-footer';

    const info = document.createElement('span');
    info.textContent = item.company ? `Company: ${item.company}` : item.source.toUpperCase();

    const linkBtn = document.createElement('a');
    linkBtn.className = 'result-link-btn';
    linkBtn.href = item.url;
    linkBtn.target = '_blank';
    linkBtn.rel = 'noopener noreferrer';
    linkBtn.innerHTML = 'View listing ↗';

    footer.appendChild(info);
    footer.appendChild(linkBtn);
    card.appendChild(footer);

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

// Global exports
(window as unknown as Record<string, unknown>).prevPage = prevPage;
(window as unknown as Record<string, unknown>).nextPage = nextPage;

document.addEventListener('DOMContentLoaded', () => {
  initResultsPage();
});
