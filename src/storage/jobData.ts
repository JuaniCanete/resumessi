/**
 * Unified Job Data Storage Module
 * Single source of truth for scraping results, saved jobs, and job dashboard
 * Uses filesystem (data/job-data.json) as source of truth with localStorage mirror for instant UI
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  author?: string;
  company?: string;
  postedDate?: string;
  aiSummary?: string;
  queryAffinity?: 'High' | 'Medium' | 'Low';
  parameters?: string[];
  // New fields for tracking
  saved?: boolean;
  savedAt?: string;
  applied?: boolean;
  appliedAt?: string;
  removed?: boolean;
  status?: 'No News' | 'Interviewing' | 'Offer' | 'Rejected';
  notes?: string;
}

export interface JobData {
  scrapingResults: {
    linkedin: ScraperResult[];
    google: ScraperResult[];
  };
  savedJobs: {
    linkedin: ScraperResult[];
    google: ScraperResult[];
  };
  jobDashboard: ScraperResult[];
}

const DATA_DIR = join(process.cwd(), 'data');
const JOB_DATA_FILE = join(DATA_DIR, 'job-data.json');

// In-memory cache
let cachedData: JobData | null = null;
let initialized = false;

const DEFAULT_DATA: JobData = {
  scrapingResults: { linkedin: [], google: [] },
  savedJobs: { linkedin: [], google: [] },
  jobDashboard: [],
};

async function ensureDataDir(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

export async function loadJobData(): Promise<JobData> {
  if (initialized && cachedData) return cachedData;

  await ensureDataDir();

  try {
    const content = await readFile(JOB_DATA_FILE, 'utf-8');
    cachedData = JSON.parse(content) as JobData;
    // Ensure all keys exist
    cachedData = {
      scrapingResults: {
        linkedin: cachedData.scrapingResults?.linkedin || [],
        google: cachedData.scrapingResults?.google || [],
      },
      savedJobs: {
        linkedin: cachedData.savedJobs?.linkedin || [],
        google: cachedData.savedJobs?.google || [],
      },
      jobDashboard: cachedData.jobDashboard || [],
    };
  } catch {
    cachedData = DEFAULT_DATA;
    await saveJobData(cachedData);
  }

  initialized = true;
  return cachedData!;
}

export async function saveJobData(data: JobData): Promise<void> {
  await ensureDataDir();
  cachedData = data;
  await writeFile(JOB_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getScrapingResults(source: 'linkedin' | 'google'): Promise<ScraperResult[]> {
  const data = await loadJobData();
  return data.scrapingResults[source].filter(r => !r.removed);
}

export async function getAllScrapingResults(): Promise<ScraperResult[]> {
  const data = await loadJobData();
  return [
    ...data.scrapingResults.linkedin.filter(r => !r.removed),
    ...data.scrapingResults.google.filter(r => !r.removed),
  ];
}

export async function setScrapingResults(source: 'linkedin' | 'google', results: ScraperResult[]): Promise<void> {
  const data = await loadJobData();
  data.scrapingResults[source] = results.map(r => ({ ...r, saved: false, applied: false, removed: false }));
  await saveJobData(data);
}

export async function markScrapingResultRemoved(source: 'linkedin' | 'google', url: string): Promise<void> {
  const data = await loadJobData();
  const idx = data.scrapingResults[source].findIndex(r => r.url === url);
  if (idx >= 0) {
    data.scrapingResults[source][idx].removed = true;
    await saveJobData(data);
  }
}

export async function saveJobFromScraping(result: ScraperResult, source: 'linkedin' | 'google'): Promise<void> {
  const data = await loadJobData();
  const savedJob: ScraperResult = {
    ...result,
    saved: true,
    savedAt: new Date().toISOString(),
    applied: false,
  };
  data.savedJobs[source].push(savedJob);
  // Also mark in scraping results
  const scrapedIdx = data.scrapingResults[source].findIndex(r => r.url === result.url);
  if (scrapedIdx >= 0) {
    data.scrapingResults[source][scrapedIdx].saved = true;
    data.scrapingResults[source][scrapedIdx].savedAt = savedJob.savedAt;
  }
  await saveJobData(data);
}

export async function unsaveJob(source: 'linkedin' | 'google', url: string): Promise<void> {
  const data = await loadJobData();
  data.savedJobs[source] = data.savedJobs[source].filter(r => r.url !== url);
  // Also unmark in scraping results
  const scrapedIdx = data.scrapingResults[source].findIndex(r => r.url === url);
  if (scrapedIdx >= 0) {
    data.scrapingResults[source][scrapedIdx].saved = false;
    data.scrapingResults[source][scrapedIdx].savedAt = undefined;
  }
  await saveJobData(data);
}

export async function getSavedJobs(source?: 'linkedin' | 'google'): Promise<ScraperResult[]> {
  const data = await loadJobData();
  if (source) {
    return data.savedJobs[source];
  }
  return [...data.savedJobs.linkedin, ...data.savedJobs.google];
}

export async function applyToJob(result: ScraperResult, source: 'linkedin' | 'google', customTitle?: string): Promise<void> {
  const data = await loadJobData();
  const title = customTitle?.trim() || result.title || 'Untitled Job';
  const existingTitle = data.jobDashboard.findIndex(j => j.title.toLowerCase() === title.toLowerCase());
  if (existingTitle >= 0) {
    throw new Error('DUPLICATE_TITLE');
  }
  const dashboardJob: ScraperResult = {
    ...result,
    title,
    applied: true,
    appliedAt: new Date().toISOString(),
    status: 'No News',
    notes: '',
  };
  data.jobDashboard.push(dashboardJob);
  if (result.saved) {
    const savedIdx = data.savedJobs[source].findIndex(r => r.url === result.url);
    if (savedIdx >= 0) {
      data.savedJobs[source][savedIdx].applied = true;
      data.savedJobs[source][savedIdx].appliedAt = dashboardJob.appliedAt;
      data.savedJobs[source][savedIdx].status = 'No News';
    }
  } else {
    const scrapedIdx = data.scrapingResults[source].findIndex(r => r.url === result.url);
    if (scrapedIdx >= 0) {
      data.scrapingResults[source][scrapedIdx].applied = true;
      data.scrapingResults[source][scrapedIdx].appliedAt = dashboardJob.appliedAt;
      data.scrapingResults[source][scrapedIdx].status = 'No News';
    }
  }
  await saveJobData(data);
}

export async function getJobDashboard(): Promise<ScraperResult[]> {
  const data = await loadJobData();
  return data.jobDashboard;
}

export async function updateDashboardJob(url: string, updates: Partial<ScraperResult>): Promise<void> {
  const data = await loadJobData();
  const idx = data.jobDashboard.findIndex(r => r.url === url);
  if (idx >= 0) {
    data.jobDashboard[idx] = { ...data.jobDashboard[idx], ...updates };
    await saveJobData(data);
  }
}

export async function removeDashboardJob(url: string): Promise<void> {
  const data = await loadJobData();
  data.jobDashboard = data.jobDashboard.filter(r => r.url !== url);
  await saveJobData(data);
}

// localStorage sync helpers for client-side
export const LOCALSTORAGE_KEYS = {
  scrapingResults: (source: 'linkedin' | 'google') => `jobData:scrapingResults:${source}`,
  savedJobs: (source: 'linkedin' | 'google') => `jobData:savedJobs:${source}`,
  jobDashboard: 'jobData:jobDashboard',
  sidebarState: 'findJob:sidebarState',
} as const;

export function syncToLocalStorage(data: JobData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCALSTORAGE_KEYS.scrapingResults('linkedin'), JSON.stringify(data.scrapingResults.linkedin));
    localStorage.setItem(LOCALSTORAGE_KEYS.scrapingResults('google'), JSON.stringify(data.scrapingResults.google));
    localStorage.setItem(LOCALSTORAGE_KEYS.savedJobs('linkedin'), JSON.stringify(data.savedJobs.linkedin));
    localStorage.setItem(LOCALSTORAGE_KEYS.savedJobs('google'), JSON.stringify(data.savedJobs.google));
    localStorage.setItem(LOCALSTORAGE_KEYS.jobDashboard, JSON.stringify(data.jobDashboard));
  } catch {
    // Ignore localStorage errors (private browsing, quota exceeded, etc.)
  }
}

export function loadFromLocalStorage(): Partial<JobData> | null {
  if (typeof window === 'undefined') return null;
  try {
    return {
      scrapingResults: {
        linkedin: JSON.parse(localStorage.getItem(LOCALSTORAGE_KEYS.scrapingResults('linkedin')) || '[]'),
        google: JSON.parse(localStorage.getItem(LOCALSTORAGE_KEYS.scrapingResults('google')) || '[]'),
      },
      savedJobs: {
        linkedin: JSON.parse(localStorage.getItem(LOCALSTORAGE_KEYS.savedJobs('linkedin')) || '[]'),
        google: JSON.parse(localStorage.getItem(LOCALSTORAGE_KEYS.savedJobs('google')) || '[]'),
      },
      jobDashboard: JSON.parse(localStorage.getItem(LOCALSTORAGE_KEYS.jobDashboard) || '[]'),
    };
  } catch {
    return null;
  }
}

// Sidebar state persistence
export interface SidebarState {
  open: boolean;
  activeTab: 'scraping' | 'saved' | 'dashboard';
}

export function saveSidebarState(state: SidebarState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCALSTORAGE_KEYS.sidebarState, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

export function loadSidebarState(): SidebarState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEYS.sidebarState);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}