/**
 * Unified Job Data Storage Module (SQLite-backed)
 * Single source of truth for scraping results, saved jobs, and job dashboard
 * Uses better-sqlite3 for persistent, ACID-compliant storage
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

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
  saved?: boolean;
  savedAt?: string;
  applied?: boolean;
  appliedAt?: string;
  removed?: boolean;
  status?: 'No News' | 'Interviewing' | 'Offer' | 'Rejected';
  column?: string;
  interviewRounds?: number;
  notes?: string;
  id?: string;
}

export interface ScraperRunPayload {
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
const DB_PATH = process.env.JOB_DATA_DB_PATH || join(DATA_DIR, 'jobdata.db');

// In-memory cache for scraper run payloads
let cachedRuns: Record<string, ScraperRunPayload> = {};

// --- Database initialization ---

function ensureDataDir(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  // Migration: add extractionDone column if missing
  try {
    db.exec('ALTER TABLE scraping_results ADD COLUMN extractionDone INTEGER DEFAULT 0');
  } catch {
    // Column already exists
  }
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS scraping_results (
      url TEXT,
      source TEXT NOT NULL,
      title TEXT,
      snippet TEXT,
      company TEXT,
      postedDate TEXT,
      aiSummary TEXT,
      queryAffinity TEXT,
      parameters TEXT,
      saved INTEGER DEFAULT 0,
      savedAt TEXT,
      applied INTEGER DEFAULT 0,
      appliedAt TEXT,
      removed INTEGER DEFAULT 0,
      runId TEXT,
      timestamp TEXT,
      status TEXT,
      column TEXT,
      interviewRounds INTEGER,
      notes TEXT,
      jobId TEXT,
      extractionDone INTEGER DEFAULT 0,
      PRIMARY KEY (url, source)
    );

    CREATE TABLE IF NOT EXISTS scraper_runs (
      source TEXT PRIMARY KEY,
      timestamp TEXT,
      query TEXT,
      totalResults INTEGER,
      summary TEXT,
      runId TEXT,
      provider TEXT,
      metadataExtractionStatus TEXT
    );

    CREATE TABLE IF NOT EXISTS saved_jobs (
      url TEXT,
      source TEXT NOT NULL,
      title TEXT,
      snippet TEXT,
      company TEXT,
      postedDate TEXT,
      aiSummary TEXT,
      queryAffinity TEXT,
      parameters TEXT,
      savedAt TEXT,
      applied INTEGER DEFAULT 0,
      appliedAt TEXT,
      status TEXT,
      column TEXT,
      interviewRounds INTEGER,
      notes TEXT,
      jobId TEXT,
      PRIMARY KEY (url, source)
    );

    CREATE TABLE IF NOT EXISTS job_dashboard (
      url TEXT,
      jobId TEXT,
      title TEXT NOT NULL,
      snippet TEXT,
      company TEXT,
      postedDate TEXT,
      aiSummary TEXT,
      queryAffinity TEXT,
      parameters TEXT,
      source TEXT,
      status TEXT,
      column TEXT,
      interviewRounds INTEGER DEFAULT 0,
      notes TEXT,
      savedAt TEXT,
      appliedAt TEXT,
      PRIMARY KEY (url, jobId)
    );
  `);
}

function formatRowForSqlite(row: ScraperResult, source: 'linkedin' | 'google'): Record<string, unknown> {
  return {
    url: row.url || null,
    source: source,
    title: row.title || null,
    snippet: row.snippet || null,
    company: row.company || null,
    postedDate: row.postedDate || null,
    aiSummary: row.aiSummary || null,
    queryAffinity: row.queryAffinity || null,
    parameters: row.parameters ? JSON.stringify(row.parameters) : null,
    saved: row.saved ? 1 : 0,
    savedAt: row.savedAt || null,
    applied: row.applied ? 1 : 0,
    appliedAt: row.appliedAt || null,
    removed: row.removed ? 1 : 0,
    status: row.status || null,
    column: row.column || null,
    interviewRounds: row.interviewRounds || null,
    notes: row.notes || null,
    id: row.id || null,
    extractionDone: 0,
  };
}

function formatDashboardRowForSqlite(row: ScraperResult): Record<string, unknown> {
  return {
    url: row.url || null,
    jobId: row.id || null,
    title: row.title || null,
    snippet: row.snippet || null,
    company: row.company || null,
    postedDate: row.postedDate || null,
    aiSummary: row.aiSummary || null,
    queryAffinity: row.queryAffinity || null,
    parameters: row.parameters ? JSON.stringify(row.parameters) : null,
    source: row.source || null,
    status: row.status || null,
    column: row.column || null,
    interviewRounds: row.interviewRounds || null,
    notes: row.notes || null,
    savedAt: row.savedAt || null,
    appliedAt: row.appliedAt || null,
  };
}

function parseRowFromSqlite(row: Record<string, unknown>): ScraperResult {
  return {
    title: (row.title as string) || '',
    url: (row.url as string) || '',
    snippet: (row.snippet as string) || '',
    source: (row.source as 'linkedin' | 'google') || 'linkedin',
    author: row.author as string | undefined,
    company: row.company as string | undefined,
    postedDate: row.postedDate as string | undefined,
    aiSummary: row.aiSummary as string | undefined,
    queryAffinity: (row.queryAffinity as 'High' | 'Medium' | 'Low') || undefined,
    parameters: row.parameters ? JSON.parse(row.parameters as string) : undefined,
    saved: (row.saved as number) ? true : false,
    savedAt: row.savedAt as string | undefined,
    applied: (row.applied as number) ? true : false,
    appliedAt: row.appliedAt as string | undefined,
    removed: (row.removed as number) ? true : false,
    status: row.status as 'No News' | 'Interviewing' | 'Offer' | 'Rejected' | undefined,
    column: row.column as string | undefined,
    interviewRounds: row.interviewRounds as number | undefined,
    notes: row.notes as string | undefined,
    id: row.id as string | undefined,
  };
}

function parseDashboardRowFromSqlite(row: Record<string, unknown>): ScraperResult {
  return {
    title: (row.title as string) || '',
    url: (row.url as string) || '',
    snippet: (row.snippet as string) || '',
    source: (row.source as 'linkedin' | 'google') || 'linkedin',
    company: row.company as string | undefined,
    postedDate: row.postedDate as string | undefined,
    aiSummary: row.aiSummary as string | undefined,
    queryAffinity: (row.queryAffinity as 'High' | 'Medium' | 'Low') || undefined,
    parameters: row.parameters ? JSON.parse(row.parameters as string) : undefined,
    status: row.status as 'No News' | 'Interviewing' | 'Offer' | 'Rejected' | undefined,
    column: row.column as string | undefined,
    interviewRounds: row.interviewRounds as number | undefined,
    notes: row.notes as string | undefined,
    id: (row.jobId as string) || undefined,
    savedAt: row.savedAt as string | undefined,
    appliedAt: row.appliedAt as string | undefined,
  };
}

// --- Initialization ---

export function initStorage(): void {
}

// --- Scraping Results (Scraper) ---

export async function getScrapingRun(source: 'linkedin' | 'google'): Promise<ScraperRunPayload | null> {
  if (cachedRuns[source]) return cachedRuns[source];
  const database = getDb();
  const runRow = database.prepare('SELECT * FROM scraper_runs WHERE source = ?').get(source) as Record<string, unknown> | undefined;
  if (!runRow) return null;

  const resultRows = database.prepare(
    'SELECT * FROM scraping_results WHERE source = ? AND removed = 0'
  ).all(source) as Record<string, unknown>[];

  const results: ScraperResult[] = resultRows.map(parseRowFromSqlite);

  const payload: ScraperRunPayload = {
    timestamp: runRow.timestamp ? (runRow.timestamp as string) : null,
    source: source,
    query: runRow.query ? JSON.parse(runRow.query as string) : {},
    totalResults: results.length,
    results: results,
    summary: runRow.summary as string | undefined,
    runId: runRow.runId as string | undefined,
    provider: runRow.provider as string | undefined,
    metadataExtractionStatus: runRow.metadataExtractionStatus as 'extracting' | 'done' | undefined,
  };
  cachedRuns[source] = payload;
  return payload;
}

export async function setScrapingRun(
  source: 'linkedin' | 'google',
  run: {
    timestamp: string;
    query: Record<string, string>;
    runId: string;
    results: ScraperResult[];
  }
): Promise<void> {
  const database = getDb();
  const dbTransaction = database.transaction(() => {
    const insertRun = database.prepare(`
      INSERT OR REPLACE INTO scraper_runs
        (source, timestamp, query, totalResults, summary, runId, provider, metadataExtractionStatus)
      VALUES
        (@source, @timestamp, @query, @totalResults, @summary, @runId, @provider, @metadataExtractionStatus)
    `);
    // If 0 results, mark as idle (no extraction needed), else extracting
    const extractionStatus = run.results.length === 0 ? 'idle' : 'extracting';
    insertRun.run({
      source: source,
      timestamp: run.timestamp,
      query: JSON.stringify(run.query),
      totalResults: run.results.length,
      summary: '',
      runId: run.runId,
      provider: '',
      metadataExtractionStatus: extractionStatus,
    });

    // UPSERT each result, preserving removed/saved/applied flags from existing rows
    const checkExisting = database.prepare(
      'SELECT removed, saved, savedAt, applied, appliedAt, status, column, interviewRounds, notes, extractionDone FROM scraping_results WHERE url = ? AND source = ?'
    );
    const upsertResult = database.prepare(`
      INSERT INTO scraping_results
        (url, source, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         saved, savedAt, applied, appliedAt, removed, status, column, interviewRounds, notes, jobId, runId, timestamp, extractionDone)
      VALUES
        (@url, @source, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @saved, @savedAt, @applied, @appliedAt, @removed, @status, @column,
         @interviewRounds, @notes, @jobId, @runId, @timestamp, @extractionDone)
      ON CONFLICT(url, source) DO UPDATE SET
        title = excluded.title,
        snippet = excluded.snippet,
        company = excluded.company,
        postedDate = excluded.postedDate,
        aiSummary = excluded.aiSummary,
        queryAffinity = excluded.queryAffinity,
        parameters = excluded.parameters,
        saved = excluded.saved,
        savedAt = excluded.savedAt,
        applied = excluded.applied,
        appliedAt = excluded.appliedAt,
        removed = excluded.removed,
        status = excluded.status,
        column = excluded.column,
        interviewRounds = excluded.interviewRounds,
        notes = excluded.notes,
        jobId = excluded.jobId,
        runId = excluded.runId,
        timestamp = excluded.timestamp,
        extractionDone = excluded.extractionDone
    `);

    for (const result of run.results) {
      const existing = checkExisting.get(result.url, source) as Record<string, unknown> | undefined;
      const base = formatRowForSqlite(result, source);
      const rowToInsert: Record<string, unknown> = {
        ...base,
        jobId: base.id,
        removed: existing ? (existing.removed as number) : 0,
        saved: existing ? (existing.saved as number) : base.saved,
        savedAt: existing ? (existing.savedAt as string) : base.savedAt,
        applied: existing ? (existing.applied as number) : base.applied,
        appliedAt: existing ? (existing.appliedAt as string) : base.appliedAt,
        status: existing ? (existing.status as string) : base.status,
        column: existing ? (existing.column as string) : base.column,
        interviewRounds: existing ? (existing.interviewRounds as number) : base.interviewRounds,
        notes: existing ? (existing.notes as string) : base.notes,
        extractionDone: existing ? (existing.extractionDone as number) : 0,
        runId: run.runId,
        timestamp: run.timestamp,
      };
      upsertResult.run(rowToInsert);
    }
  });
  dbTransaction();
  cachedRuns[source] = {
    timestamp: run.timestamp,
    source: source,
    query: run.query,
    totalResults: run.results.length,
    results: run.results,
    runId: run.runId,
    metadataExtractionStatus: 'extracting',
  };
}

export async function updateScrapingResultSummary(
  source: 'linkedin' | 'google',
  updates: { summary?: string; provider?: string; metadataExtractionStatus?: 'done' },
  results: ScraperResult[]
): Promise<void> {
  const database = getDb();
  const dbTransaction = database.transaction(() => {
    const updateRun = database.prepare(`
      UPDATE scraper_runs SET summary = COALESCE(@summary, summary), provider = COALESCE(@provider, provider),
        metadataExtractionStatus = COALESCE(@metadataExtractionStatus, metadataExtractionStatus)
      WHERE source = @source
    `);
    updateRun.run({
      source: source,
      summary: updates.summary || null,
      provider: updates.provider || null,
      metadataExtractionStatus: updates.metadataExtractionStatus || null,
    });

    const updateResult = database.prepare(`
      UPDATE scraping_results SET aiSummary = @aiSummary, queryAffinity = @queryAffinity, parameters = @parameters, extractionDone = @extractionDone
      WHERE url = @url AND source = @source
    `);
    const upsertResult = database.prepare(`
      INSERT INTO scraping_results
        (url, source, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         saved, savedAt, applied, appliedAt, removed, status, column, interviewRounds, notes, jobId, runId, timestamp, extractionDone)
      VALUES
        (@url, @source, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @saved, @savedAt, @applied, @appliedAt, @removed, @status, @column,
         @interviewRounds, @notes, @jobId, @runId, @timestamp, @extractionDone)
      ON CONFLICT(url, source) DO UPDATE SET
        aiSummary = excluded.aiSummary,
        queryAffinity = excluded.queryAffinity,
        parameters = excluded.parameters,
        extractionDone = excluded.extractionDone
    `);

    const extractionDone = updates.metadataExtractionStatus === 'done' ? 1 : 0;

    for (const result of results) {
      const existing = database.prepare(
        'SELECT removed, saved, savedAt, applied, appliedAt, status, column, interviewRounds, notes, runId, timestamp FROM scraping_results WHERE url = ? AND source = ?'
      ).get(result.url, source) as Record<string, unknown> | undefined;

      if (existing) {
        updateResult.run({
          aiSummary: result.aiSummary || null,
          queryAffinity: result.queryAffinity || null,
          parameters: result.parameters ? JSON.stringify(result.parameters) : null,
          extractionDone,
          url: result.url,
          source: source,
        });
      } else {
        upsertResult.run({
          ...formatRowForSqlite(result, source),
          removed: 0,
          runId: '',
          timestamp: new Date().toISOString(),
          extractionDone,
        });
      }
    }
  });
  dbTransaction();

  // Update cache
  if (cachedRuns[source]) {
    cachedRuns[source].summary = updates.summary || cachedRuns[source].summary;
    cachedRuns[source].provider = updates.provider || cachedRuns[source].provider;
    cachedRuns[source].metadataExtractionStatus = updates.metadataExtractionStatus || cachedRuns[source].metadataExtractionStatus;
    if (results.length > 0) {
      for (const result of results) {
        const cached = cachedRuns[source].results.find(r => r.url === result.url);
        if (cached) {
          cached.aiSummary = result.aiSummary;
          cached.queryAffinity = result.queryAffinity;
          cached.parameters = result.parameters;
        }
      }
    }
  }
}

export function clearScrapingRunCache(source?: 'linkedin' | 'google'): void {
  if (source) {
    delete cachedRuns[source];
  } else {
    cachedRuns = {};
  }
}

// --- Legacy compatible functions ---

export const LOCALSTORAGE_KEYS = {
  scrapingResults: (source: 'linkedin' | 'google') => `jobData:scrapingResults:${source}`,
  savedJobs: (source: 'linkedin' | 'google') => `jobData:savedJobs:${source}`,
  jobDashboard: 'jobData:jobDashboard',
  sidebarState: 'findJob:sidebarState',
} as const;

export function syncToLocalStorage(_data: JobData): void {
  // No-op: localStorage mirror no longer needed with SQLite
}

export function loadFromLocalStorage(): Partial<JobData> | null {
  // No-op: data comes from SQLite
  return null;
}

// Sidebar state persistence (kept as localStorage since it's pure client state)
export interface SidebarState {
  open: boolean;
  activeTab: 'scraping' | 'saved' | 'dashboard';
}

export function saveSidebarState(state: SidebarState): void {
  try {
    localStorage.setItem(LOCALSTORAGE_KEYS.sidebarState, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

export function loadSidebarState(): SidebarState | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEYS.sidebarState);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loadJobData(): Promise<JobData> {
  const database = getDb();
  const linkedinResults = database.prepare(
    "SELECT * FROM scraping_results WHERE source = 'linkedin' AND removed = 0"
  ).all() as Record<string, unknown>[];
  const googleResults = database.prepare(
    "SELECT * FROM scraping_results WHERE source = 'google' AND removed = 0"
  ).all() as Record<string, unknown>[];
  const linkedinSaved = database.prepare(
    "SELECT * FROM saved_jobs WHERE source = 'linkedin'"
  ).all() as Record<string, unknown>[];
  const googleSaved = database.prepare(
    "SELECT * FROM saved_jobs WHERE source = 'google'"
  ).all() as Record<string, unknown>[];
  const dashboard = database.prepare('SELECT * FROM job_dashboard').all() as Record<string, unknown>[];

  return {
    scrapingResults: {
      linkedin: linkedinResults.map(parseRowFromSqlite),
      google: googleResults.map(parseRowFromSqlite),
    },
    savedJobs: {
      linkedin: linkedinSaved.map(parseSavedRowFromSqlite),
      google: googleSaved.map(parseSavedRowFromSqlite),
    },
    jobDashboard: dashboard.map(parseDashboardRowFromSqlite),
  };
}

function parseSavedRowFromSqlite(row: Record<string, unknown>): ScraperResult {
  return {
    title: (row.title as string) || '',
    url: (row.url as string) || '',
    snippet: (row.snippet as string) || '',
    source: (row.source as 'linkedin' | 'google') || 'linkedin',
    company: row.company as string | undefined,
    postedDate: row.postedDate as string | undefined,
    aiSummary: row.aiSummary as string | undefined,
    queryAffinity: (row.queryAffinity as 'High' | 'Medium' | 'Low') || undefined,
    parameters: row.parameters ? JSON.parse(row.parameters as string) : undefined,
    saved: true,
    savedAt: row.savedAt as string | undefined,
    applied: row.applied ? true : false,
    appliedAt: row.appliedAt as string | undefined,
    status: row.status as 'No News' | 'Interviewing' | 'Offer' | 'Rejected' | undefined,
    column: row.column as string | undefined,
    interviewRounds: row.interviewRounds as number | undefined,
    notes: row.notes as string | undefined,
    id: row.id as string | undefined,
  };
}

export async function saveJobData(data: JobData): Promise<void> {
  const database = getDb();
  const dbTransaction = database.transaction(() => {
    const insertScraping = database.prepare(`
      INSERT OR REPLACE INTO scraping_results
        (url, source, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         saved, savedAt, applied, appliedAt, removed, status, column, interviewRounds, notes, jobId, runId, timestamp)
      VALUES
        (@url, @source, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @saved, @savedAt, @applied, @appliedAt, @removed, @status, @column,
         @interviewRounds, @notes, @id, @runId, @timestamp)
    `);
    const insertSaved = database.prepare(`
      INSERT OR REPLACE INTO saved_jobs
        (url, source, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         savedAt, applied, appliedAt, status, column, interviewRounds, notes, jobId)
      VALUES
        (@url, @source, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @savedAt, @applied, @appliedAt, @status, @column, @interviewRounds, @notes, @id)
    `);
    const insertDashboard = database.prepare(`
      INSERT OR REPLACE INTO job_dashboard
        (url, jobId, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         source, status, column, interviewRounds, notes, savedAt, appliedAt)
      VALUES
        (@url, @jobId, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @source, @status, @column, @interviewRounds, @notes, @savedAt, @appliedAt)
    `);

    for (const item of data.scrapingResults.linkedin) {
      const formatted = formatRowForSqlite(item, 'linkedin');
      insertScraping.run({ ...formatted, runId: null, timestamp: null });
    }
    for (const item of data.scrapingResults.google) {
      const formatted = formatRowForSqlite(item, 'google');
      insertScraping.run({ ...formatted, runId: null, timestamp: null });
    }
    for (const item of data.savedJobs.linkedin) {
      insertSaved.run(formatSavedRowForSqlite(item, 'linkedin'));
    }
    for (const item of data.savedJobs.google) {
      insertSaved.run(formatSavedRowForSqlite(item, 'google'));
    }
    for (const item of data.jobDashboard) {
      insertDashboard.run(formatDashboardRowForSqlite(item));
    }
  });
  dbTransaction();
  cachedRuns = {};
}

function formatSavedRowForSqlite(row: ScraperResult, source: 'linkedin' | 'google'): Record<string, unknown> {
  return {
    url: row.url || null,
    source: source,
    title: row.title || null,
    snippet: row.snippet || null,
    company: row.company || null,
    postedDate: row.postedDate || null,
    aiSummary: row.aiSummary || null,
    queryAffinity: row.queryAffinity || null,
    parameters: row.parameters ? JSON.stringify(row.parameters) : null,
    savedAt: row.savedAt || new Date().toISOString(),
    applied: row.applied ? 1 : 0,
    appliedAt: row.appliedAt || null,
    status: row.status || null,
    column: row.column || null,
    interviewRounds: row.interviewRounds || null,
    notes: row.notes || null,
    id: row.id || null,
  };
}

export async function getScrapingResults(source: 'linkedin' | 'google'): Promise<ScraperResult[]> {
  const database = getDb();
  const rows = database.prepare(
    'SELECT * FROM scraping_results WHERE source = ? AND removed = 0'
  ).all(source) as Record<string, unknown>[];
  return rows.map(parseRowFromSqlite);
}

export async function getAllScrapingResults(): Promise<ScraperResult[]> {
  const database = getDb();
  const rows = database.prepare(
    'SELECT * FROM scraping_results WHERE removed = 0'
  ).all() as Record<string, unknown>[];
  return rows.map(parseRowFromSqlite);
}

export async function setScrapingResults(source: 'linkedin' | 'google', results: ScraperResult[]): Promise<void> {
  const database = getDb();
  const dbTransaction = database.transaction(() => {
    const checkExisting = database.prepare(
      'SELECT removed, saved, savedAt, applied, appliedAt, status, column, interviewRounds, notes, runId, timestamp FROM scraping_results WHERE url = ? AND source = ?'
    );
    const upsertResult = database.prepare(`
      INSERT INTO scraping_results
        (url, source, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         saved, savedAt, applied, appliedAt, removed, status, column, interviewRounds, notes, jobId, runId, timestamp)
      VALUES
        (@url, @source, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @saved, @savedAt, @applied, @appliedAt, @removed, @status, @column,
         @interviewRounds, @notes, @id, @runId, @timestamp)
      ON CONFLICT(url, source) DO UPDATE SET
        title = excluded.title,
        snippet = excluded.snippet,
        company = excluded.company,
        postedDate = excluded.postedDate,
        aiSummary = excluded.aiSummary,
        queryAffinity = excluded.queryAffinity,
        parameters = excluded.parameters,
        saved = excluded.saved,
        savedAt = excluded.savedAt,
        applied = excluded.applied,
        appliedAt = excluded.appliedAt,
        removed = excluded.removed,
        status = excluded.status,
        column = excluded.column,
        interviewRounds = excluded.interviewRounds,
        notes = excluded.notes,
        jobId = excluded.jobId,
        runId = excluded.runId,
        timestamp = excluded.timestamp
    `);

    for (const result of results) {
      const existing = checkExisting.get(result.url, source) as Record<string, unknown> | undefined;
      const base = formatRowForSqlite(result, source);
      const rowToInsert: Record<string, unknown> = {
        ...base,
        removed: existing ? (existing.removed as number) : 0,
        saved: existing ? (existing.saved as number) : base.saved,
        savedAt: existing ? (existing.savedAt as string) : base.savedAt,
        applied: existing ? (existing.applied as number) : base.applied,
        appliedAt: existing ? (existing.appliedAt as string) : base.appliedAt,
        status: existing ? (existing.status as string) : base.status,
        column: existing ? (existing.column as string) : base.column,
        interviewRounds: existing ? (existing.interviewRounds as number) : base.interviewRounds,
        notes: existing ? (existing.notes as string) : base.notes,
      };
      upsertResult.run(rowToInsert);
    }
  });
  dbTransaction();
  cachedRuns = {};
}

export async function markScrapingResultRemoved(source: 'linkedin' | 'google', url: string): Promise<void> {
  const database = getDb();
  const updateStmt = database.prepare(
    'UPDATE scraping_results SET removed = 1 WHERE url = ? AND source = ?'
  );
  updateStmt.run(url, source);
  delete cachedRuns[source];
}

export async function saveJobFromScraping(result: ScraperResult, source: 'linkedin' | 'google'): Promise<void> {
  const database = getDb();
  const dbTransaction = database.transaction(() => {
    const savedJob = {
      ...result,
      saved: true,
      savedAt: new Date().toISOString(),
      applied: false,
    };

    const insertSaved = database.prepare(`
      INSERT OR REPLACE INTO saved_jobs
        (url, source, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         savedAt, applied, appliedAt, status, column, interviewRounds, notes, jobId)
      VALUES
        (@url, @source, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @savedAt, @applied, @appliedAt, @status, @column,
         @interviewRounds, @notes, @jobId)
    `);
    const savedRow = formatSavedRowForSqlite(savedJob, source);
    insertSaved.run({ ...savedRow, jobId: savedRow.id });

    const updateScraping = database.prepare(
      'UPDATE scraping_results SET saved = 1, savedAt = ? WHERE url = ? AND source = ?'
    );
    updateScraping.run(savedJob.savedAt, result.url, source);
  });
  dbTransaction();

  const db = getDb();
  const existing = db.prepare('SELECT * FROM saved_jobs WHERE url = ? AND source = ?').get(result.url, source) as Record<string, unknown> | undefined;
  if (existing) {
    const row = parseSavedRowFromSqlite(existing);
    if (!cachedRuns[source]) {
      cachedRuns[source] = { timestamp: null, source, query: {}, totalResults: 0, results: [] };
    }
    const idx = cachedRuns[source].results.findIndex(r => r.url === result.url);
    if (idx >= 0) {
      cachedRuns[source].results[idx] = row;
    }
  }
}

export async function unsaveJob(source: 'linkedin' | 'google', url: string): Promise<void> {
  const database = getDb();
  const dbTransaction = database.transaction(() => {
    database.prepare('DELETE FROM saved_jobs WHERE url = ? AND source = ?').run(url, source);
    database.prepare('UPDATE scraping_results SET saved = 0, savedAt = NULL WHERE url = ? AND source = ?').run(url, source);
  });
  dbTransaction();
  delete cachedRuns[source];
}

export async function getSavedJobs(source?: 'linkedin' | 'google'): Promise<ScraperResult[]> {
  const database = getDb();
  if (source) {
    const rows = database.prepare(
      'SELECT * FROM saved_jobs WHERE source = ?'
    ).all(source) as Record<string, unknown>[];
    return rows.map(parseSavedRowFromSqlite);
  }
  const rows = database.prepare('SELECT * FROM saved_jobs').all() as Record<string, unknown>[];
  return rows.map(parseSavedRowFromSqlite);
}

export async function applyToJob(result: ScraperResult, source: 'linkedin' | 'google', customTitle?: string): Promise<void> {
  const database = getDb();
  const title = customTitle?.trim() || result.title || 'Untitled Job';

  // Duplicate check is URL-based: the dashboard is keyed by (url, jobId), so
  // two distinct jobs at different companies may share the same role title.
  // Only fall back to a title check for URL-less manual entries.
  if (result.url) {
    const urlExisting = database.prepare('SELECT COUNT(*) as count FROM job_dashboard WHERE url = ?').get(result.url) as { count: number };
    if (urlExisting.count > 0) {
      throw new Error('DUPLICATE_URL');
    }
  } else {
    const titleLower = title.toLowerCase();
    const titleExisting = database.prepare('SELECT COUNT(*) as count FROM job_dashboard WHERE LOWER(title) = ?').get(titleLower) as { count: number };
    if (titleExisting.count > 0) {
      throw new Error('DUPLICATE_TITLE');
    }
  }

  const dbTransaction = database.transaction(() => {
    const dashboardJob: ScraperResult = {
      ...result,
      title,
      applied: true,
      appliedAt: new Date().toISOString(),
      status: 'No News',
      column: 'applied',
      notes: '',
    };

    const insertDashboard = database.prepare(`
      INSERT INTO job_dashboard
        (url, jobId, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
         source, status, column, interviewRounds, notes, savedAt, appliedAt)
      VALUES
        (@url, @jobId, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
         @parameters, @source, @status, @column, @interviewRounds, @notes, @savedAt, @appliedAt)
    `);
    insertDashboard.run(formatDashboardRowForSqlite(dashboardJob));

    if (result.saved) {
      database.prepare(
        'UPDATE saved_jobs SET applied = 1, appliedAt = ?, status = ? WHERE url = ? AND source = ?'
      ).run(dashboardJob.appliedAt, 'No News', result.url, source);
    } else {
      database.prepare(
        'UPDATE scraping_results SET applied = 1, appliedAt = ?, status = ? WHERE url = ? AND source = ?'
      ).run(dashboardJob.appliedAt, 'No News', result.url, source);
    }
  });
  dbTransaction();
  cachedRuns = {};
}

export async function getJobDashboard(): Promise<ScraperResult[]> {
  const database = getDb();
  const rows = database.prepare('SELECT rowid, * FROM job_dashboard').all() as (Record<string, unknown> & { rowid: number })[];
  let changed = false;
  const results: ScraperResult[] = [];

  for (const row of rows) {
    let jobId = row.jobId as string | undefined;
    let column = row.column as string | undefined;
    if (!jobId && !row.url) {
      jobId = 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      changed = true;
    }
    if (!column) {
      const status = row.status as string;
      column = status === 'Offer' ? 'offer' : status === 'Rejected' ? 'hired' : status === 'Interviewing' ? 'screening' : 'applied';
      changed = true;
    }
    results.push({
      ...parseDashboardRowFromSqlite(row),
      id: jobId,
      column: column,
      _rowid: row.rowid,
    } as ScraperResult & { _rowid: number });
  }

  if (changed) {
    const dbTransaction = database.transaction(() => {
      for (const result of results) {
        const rowid = (result as ScraperResult & { _rowid?: number })._rowid;
        if (result.url) {
          database.prepare(
            'UPDATE job_dashboard SET jobId = ? WHERE url = ? AND (jobId IS NULL OR jobId = \'\')'
          ).run(result.id, result.url);
          database.prepare(
            'UPDATE job_dashboard SET column = ? WHERE url = ? AND (column IS NULL OR column = \'\')'
          ).run(result.column, result.url);
        } else if (rowid) {
          database.prepare(
            'UPDATE job_dashboard SET jobId = ? WHERE rowid = ? AND (jobId IS NULL OR jobId = \'\')'
          ).run(result.id, rowid);
          database.prepare(
            'UPDATE job_dashboard SET column = ? WHERE rowid = ? AND (column IS NULL OR column = \'\')'
          ).run(result.column, rowid);
        }
      }
    });
    dbTransaction();
  }

  return results;
}

export async function updateDashboardJob(url?: string, updates: Partial<ScraperResult> = {}, id?: string): Promise<void> {
  const database = getDb();
  const setParts: string[] = [];
  const values: unknown[] = [];
  const columnMap: Record<string, string> = { id: 'jobId' };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const column = columnMap[key] || key;
      setParts.push(`${column} = ?`);
      values.push(value instanceof Object ? JSON.stringify(value) : value);
    }
  }

  if (setParts.length === 0) return;

  // AND is used when both url and jobId are present so a mismatched pair
  // never updates two different rows. jobId alone is the authoritative key.
  if (url && id) {
    const stmt = database.prepare(
      `UPDATE job_dashboard SET ${setParts.join(', ')} WHERE url = ? AND jobId = ?`
    );
    stmt.run(...values, url, id);
  } else if (url) {
    const stmt = database.prepare(
      `UPDATE job_dashboard SET ${setParts.join(', ')} WHERE url = ?`
    );
    stmt.run(...values, url);
  } else if (id) {
    const stmt = database.prepare(
      `UPDATE job_dashboard SET ${setParts.join(', ')} WHERE jobId = ?`
    );
    stmt.run(...values, id);
  }
}

export async function insertDashboardJob(job: ScraperResult): Promise<ScraperResult> {
  const database = getDb();
  const dashboardJob: ScraperResult = {
    ...job,
    saved: true,
    applied: true,
    savedAt: job.savedAt || new Date().toISOString(),
    appliedAt: job.appliedAt || new Date().toISOString(),
    status: (job.status || 'No News') as 'No News' | 'Interviewing' | 'Offer' | 'Rejected',
    column: job.column || 'applied',
    notes: job.notes || '',
  };

  const insertDashboard = database.prepare(`
    INSERT INTO job_dashboard
      (url, jobId, title, snippet, company, postedDate, aiSummary, queryAffinity, parameters,
       source, status, column, interviewRounds, notes, savedAt, appliedAt)
    VALUES
      (@url, @jobId, @title, @snippet, @company, @postedDate, @aiSummary, @queryAffinity,
       @parameters, @source, @status, @column, @interviewRounds, @notes, @savedAt, @appliedAt)
  `);
  const row = formatDashboardRowForSqlite(dashboardJob);
  insertDashboard.run(row);

  return dashboardJob;
}

export async function removeDashboardJob(url?: string, id?: string): Promise<void> {
  const database = getDb();
  if (url && id) {
    database.prepare('DELETE FROM job_dashboard WHERE url = ? AND jobId = ?').run(url, id);
  } else if (url) {
    database.prepare('DELETE FROM job_dashboard WHERE url = ?').run(url);
  } else if (id) {
    database.prepare('DELETE FROM job_dashboard WHERE jobId = ?').run(id);
  }
}

// --- Close ---

export function closeStorage(): void {
  if (db) {
    db.close();
    db = null;
  }
}
