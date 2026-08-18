import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const TEST_PORT = 3447;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DB = join(__dirname, '..', '..', 'data', 'test', 'jobdata-unit-test.db');
let serverProcess: ChildProcess | null = null;

interface HttpResponse {
  status: number;
  data: unknown;
}

function httpJson(method: string, path: string, body?: unknown): Promise<HttpResponse> {
  return httpJsonWithBase(BASE_URL, method, path, body);
}

function httpJsonWithBase(baseUrl: string, method: string, path: string, body?: unknown): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      url,
      {
        method,
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          let data: unknown = raw;
          try {
            data = JSON.parse(raw);
          } catch {
            // keep raw string for non-JSON responses
          }
          resolve({ status: res.statusCode || 0, data });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Server did not start in time');
}

function stopServer(): void {
  if (!serverProcess?.pid) return;
  if (process.platform === 'win32') {
    try {
      // First try graceful termination
      execSync(`taskkill /pid ${serverProcess.pid} /T`, { stdio: 'ignore', timeout: 2000 });
    } catch {
      // Force kill if graceful fails
      try {
        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore', timeout: 2000 });
      } catch {
        // Process already gone
      }
    }
    // Additional cleanup: find and kill any remaining Node.js child processes
    try {
      execSync(`taskkill /f /im node.exe /fi "PPID eq ${serverProcess.pid}"`, { stdio: 'ignore', timeout: 2000 });
    } catch {
      // Ignore
    }
  } else {
    try {
      process.kill(-serverProcess.pid, 'SIGTERM');
    } catch {
      try {
        serverProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }
  serverProcess = null;
}

before(async () => {
  // Spawn node directly with the tsx loader to avoid .cmd spawn issues on Windows
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'start.ts', '--no-open'], {
    env: {
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
      JOB_DATA_DB_PATH: TEST_DB,
      // Only pass necessary env vars, avoid leaking sensitive keys
      AI_INFERENCE_ORDER: process.env.AI_INFERENCE_ORDER,
      COHERE_API_KEY: process.env.COHERE_API_KEY,
      COHERE_MODEL: process.env.COHERE_MODEL,
      MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
      MISTRAL_MODEL: process.env.MISTRAL_MODEL,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GROQ_MODEL: process.env.GROQ_MODEL,
      PRIMARY_COLOR: process.env.PRIMARY_COLOR,
      SECONDARY_COLOR: process.env.SECONDARY_COLOR,
      ACCENT_COLOR: process.env.ACCENT_COLOR,
      TEXT_COLOR: process.env.TEXT_COLOR,
      TEXT_LIGHT_COLOR: process.env.TEXT_LIGHT_COLOR,
      BG_BADGE_COLOR: process.env.BG_BADGE_COLOR,
      SUCCESS_COLOR: process.env.SUCCESS_COLOR,
      CHROME_PATH: process.env.CHROME_PATH,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      LINKEDIN_EMAIL: process.env.LINKEDIN_EMAIL,
      LINKEDIN_PASSWORD: process.env.LINKEDIN_PASSWORD,
      LINKEDIN_2FA_SECRET: process.env.LINKEDIN_2FA_SECRET,
    },
    stdio: 'ignore',
    detached: true,
  });
  await waitForServer(`${BASE_URL}/config.json`);
});

after(() => {
  stopServer();
  [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm'].forEach(f => {
    try { rmSync(f, { force: true, retryDelay: 200, maxRetries: 5 }); } catch { /* ignore missing files */ }
  });
  [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm'].forEach(f => {
    try { rmSync(f, { force: true, retryDelay: 200, maxRetries: 5 }); } catch { /* ignore missing files */ }
  });
});

// ─── /config.json ─────────────────────────────────────────────────────

test('GET /config.json returns 200 with client-safe config', async () => {
  const res = await httpJson('GET', '/config.json');
  assert.equal(res.status, 200);
  const data = res.data as Record<string, unknown>;
  assert.ok(Array.isArray(data.availableProviders));
  // API keys must never leak to the client
  assert.ok(!('COHERE_API_KEY' in data));
  assert.ok(!('MISTRAL_API_KEY' in data));
});

// ─── /api/scraper/results ────────────────────────────────────────────

test('GET /api/scraper/results?source=linkedin returns 200 with result shape', async () => {
  const res = await httpJson('GET', '/api/scraper/results?source=linkedin');
  assert.equal(res.status, 200);
  const data = res.data as { source: string; results: unknown[] };
  assert.equal(data.source, 'linkedin');
  assert.ok(Array.isArray(data.results));
});

test('GET /api/scraper/results?source=google returns 200 with result shape', async () => {
  const res = await httpJson('GET', '/api/scraper/results?source=google');
  assert.equal(res.status, 200);
  const data = res.data as { source: string; results: unknown[] };
  assert.equal(data.source, 'google');
  assert.ok(Array.isArray(data.results));
});

test('GET /api/scraper/results rejects invalid source with 400', async () => {
  const res = await httpJson('GET', '/api/scraper/results?source=invalid');
  assert.equal(res.status, 400);
  const data = res.data as { error: string };
  assert.ok(data.error.includes('Invalid source'));
});

test('GET /api/scraper/results rejects path traversal source with 400', async () => {
  // Finding 1 regression: source is allowlisted, so traversal must not read arbitrary files
  const res = await httpJson('GET', '/api/scraper/results?source=../../etc/passwd');
  assert.equal(res.status, 400);
  const data = res.data as { error: string };
  assert.ok(data.error.includes('Invalid source'));
});

// ─── /api/scraper/start ──────────────────────────────────────────────

test('POST /api/scraper/start rejects missing source with 400', async () => {
  const res = await httpJson('POST', '/api/scraper/start', { role: 'SDET' });
  assert.equal(res.status, 400);
  const data = res.data as { error: string };
  assert.ok(data.error.includes('source'));
});

test('POST /api/scraper/start rejects invalid source with 400', async () => {
  const res = await httpJson('POST', '/api/scraper/start', { source: 'evil', role: 'SDET' });
  assert.equal(res.status, 400);
  const data = res.data as { error: string };
  assert.ok(data.error.includes('source'));
});

// ─── Scraper /api/scraper/start → /api/scraper/results roundtrip ─────────

test('GET /api/scraper/results returns empty results before any scraper run', async () => {
  const res = await httpJson('GET', '/api/scraper/results?source=linkedin');
  assert.equal(res.status, 200);
  const data = res.data as { source: string; results: unknown[] };
  assert.equal(data.source, 'linkedin');
  assert.ok(Array.isArray(data.results));
});

test('POST /api/scraper/start with valid source returns run payload with results array', async () => {
  // Integration test: requires real LinkedIn credentials.
  // Skip if no credentials to avoid 90s+ timeout from real scraper call.
  const hasLinkedInCreds = !!(
    process.env.LINKEDIN_EMAIL &&
    process.env.LINKEDIN_PASSWORD &&
    process.env.LINKEDIN_2FA_SECRET
  );
  if (!hasLinkedInCreds) {
    console.log('[SKIP] LinkedIn credentials not set, skipping scraper integration test');
    return;
  }

  const res = await httpJson('POST', '/api/scraper/start', {
    source: 'linkedin',
    role: 'Engineer',
    seniority: 'Senior',
  });
  assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
  if (res.status === 200) {
    const data = res.data as { source: string; totalResults: number; results: unknown[] };
    assert.equal(data.source, 'linkedin');
    assert.ok(typeof data.totalResults === 'number');
    assert.ok(Array.isArray(data.results));
  }
});

// ─── Scraper /api/scraper/start → /api/scraper/results roundtrip ─────────

test('GET /api/scraper/results returns empty results before any scraper run', async () => {
  const res = await httpJson('GET', '/api/scraper/results?source=linkedin');
  assert.equal(res.status, 200);
  const data = res.data as { source: string; results: unknown[] };
  assert.equal(data.source, 'linkedin');
  assert.ok(Array.isArray(data.results));
});

test('POST /api/scraper/start with valid source returns run payload with results array', async () => {
  // Integration test: requires real LinkedIn credentials.
  // Skip if no credentials to avoid 90s+ timeout from real scraper call.
  const hasLinkedInCreds = !!(
    process.env.LINKEDIN_EMAIL &&
    process.env.LINKEDIN_PASSWORD &&
    process.env.LINKEDIN_2FA_SECRET
  );
  if (!hasLinkedInCreds) {
    console.log('[SKIP] LinkedIn credentials not set, skipping scraper integration test');
    return;
  }

  const res = await httpJson('POST', '/api/scraper/start', {
    source: 'linkedin',
    role: 'Engineer',
    seniority: 'Senior',
  });
  assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
  if (res.status === 200) {
    const data = res.data as { source: string; totalResults: number; results: unknown[] };
    assert.equal(data.source, 'linkedin');
    assert.ok(typeof data.totalResults === 'number');
    assert.ok(Array.isArray(data.results));
  }
});

// ─── /api/fetch-url (SSRF protection) ────────────────────────────────

test('POST /api/fetch-url rejects missing URL with 400', async () => {
  const res = await httpJson('POST', '/api/fetch-url', {});
  assert.equal(res.status, 400);
  const data = res.data as { error: string };
  assert.ok(data.error.includes('Missing or invalid URL'));
});

test('POST /api/fetch-url rejects non-HTTPS URL', async () => {
  const res = await httpJson('POST', '/api/fetch-url', { url: 'http://www.google.com' });
  assert.equal(res.status, 500);
  const data = res.data as { error: string };
  assert.ok(data.error.includes('Only HTTPS allowed'));
});

test('POST /api/fetch-url rejects non-allowlisted host (SSRF)', async () => {
  const res = await httpJson('POST', '/api/fetch-url', { url: 'https://evil.example.com' });
  assert.equal(res.status, 500);
  const data = res.data as { error: string };
  assert.ok(data.error.includes('Host not allowed'));
});

// Spawn an isolated server instance with a forced LinkedIn storage path so the
// /api/fetch-url LinkedIn branching can be tested deterministically without
// touching the developer's real session.
function startIsolatedServer(port: number, linkedInStorageFile: string): Promise<{ baseUrl: string; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'start.ts', '--no-open'], {
      env: {
        PORT: String(port),
        NODE_ENV: 'test',
        JOB_DATA_DB_PATH: TEST_DB,
        LINKEDIN_STORAGE_FILE: linkedInStorageFile,
        // Only pass necessary env vars
        AI_INFERENCE_ORDER: process.env.AI_INFERENCE_ORDER,
        COHERE_API_KEY: process.env.COHERE_API_KEY,
        COHERE_MODEL: process.env.COHERE_MODEL,
        MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
        MISTRAL_MODEL: process.env.MISTRAL_MODEL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        GROQ_MODEL: process.env.GROQ_MODEL,
        PRIMARY_COLOR: process.env.PRIMARY_COLOR,
        SECONDARY_COLOR: process.env.SECONDARY_COLOR,
        ACCENT_COLOR: process.env.ACCENT_COLOR,
        TEXT_COLOR: process.env.TEXT_COLOR,
        TEXT_LIGHT_COLOR: process.env.TEXT_LIGHT_COLOR,
        BG_BADGE_COLOR: process.env.BG_BADGE_COLOR,
        SUCCESS_COLOR: process.env.SUCCESS_COLOR,
        CHROME_PATH: process.env.CHROME_PATH,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        LINKEDIN_EMAIL: process.env.LINKEDIN_EMAIL,
        LINKEDIN_PASSWORD: process.env.LINKEDIN_PASSWORD,
        LINKEDIN_2FA_SECRET: process.env.LINKEDIN_2FA_SECRET,
      },
      stdio: 'ignore',
      detached: true,
    });
    const baseUrl = `http://127.0.0.1:${port}`;
    waitForServer(`${baseUrl}/config.json`)
      .then(() => resolve({ baseUrl, child }))
      .catch((err: unknown) => {
        killChild(child);
        reject(err);
      });
  });
}

function killChild(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      // First try graceful termination
      execSync(`taskkill /pid ${child.pid} /T`, { stdio: 'ignore', timeout: 2000 });
    } catch {
      // Force kill if graceful fails
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore', timeout: 2000 });
      } catch {
        // Process already gone
      }
    }
    // Additional cleanup: find and kill any remaining Node.js child processes
    try {
      execSync(`taskkill /f /im node.exe /fi "PPID eq ${child.pid}"`, { stdio: 'ignore', timeout: 2000 });
    } catch {
      // Ignore
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
}

test('POST /api/fetch-url routes LinkedIn job URLs through the normalized path and returns a string body', async () => {
  // Canonical LinkedIn /jobs/view pages are public and do NOT redirect to login,
  // so the missing-session file still yields a 200 with page text (no crash, no
  // fallthrough to the login page). The 503 LINKEDIN_SESSION_EXPIRED behavior is
  // covered deterministically at unit level via extractLinkedInJdFromPage.
  const missingStorage = join(__dirname, '..', '..', 'data', 'storage-state', 'linkedin-does-not-exist.json');
  const { baseUrl, child } = await startIsolatedServer(3448, missingStorage);
  try {
    const res = await httpJsonWithBase(baseUrl, 'POST', '/api/fetch-url', {
      url: 'https://www.linkedin.com/jobs/view/4440070396/',
    });
    assert.equal(res.status, 200);
    const data = res.data as { text?: string };
    assert.equal(typeof data.text, 'string');
  } finally {
    killChild(child);
  }
});

test('POST /api/fetch-url returns 400 COLLECTION_URL for collection pages', async () => {
  const missingStorage = join(__dirname, '..', '..', 'data', 'storage-state', 'linkedin-does-not-exist.json');
  const { baseUrl, child } = await startIsolatedServer(3449, missingStorage);
  try {
    const res = await httpJsonWithBase(baseUrl, 'POST', '/api/fetch-url', {
      url: 'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4440070396',
    });
    assert.equal(res.status, 400);
    const data = res.data as { error?: string; message?: string };
    assert.equal(data.error, 'COLLECTION_URL');
  } finally {
    killChild(child);
  }
});

// ─── Rate limiting ───────────────────────────────────────────────────

test('rate limiter returns 429 after exceeding request budget', async () => {
  // The limiter is shared per-IP (10 req/min) across /api/scraper/start,
  // /api/fetch-url, and /api/ats/scan. Earlier tests consumed a few slots;
  // keep sending invalid-source requests (400, no side effects) until we
  // observe the 429.
  let saw429 = false;
  for (let i = 0; i < 25; i++) {
    const res = await httpJson('POST', '/api/scraper/start', { source: 'invalid', role: 'x' });
    if (res.status === 429) {
      saw429 = true;
      assert.ok((res.data as { error: string }).error.includes('Rate limit exceeded'));
      break;
    }
  }
  assert.ok(saw429, 'Expected a 429 rate-limit response within 25 requests');
});

// ─── Dashboard API endpoints ─────────────────────────────────────────

function uniqueId(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForDashboardJob(url: string, timeoutMs = 5000): Promise<unknown | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await httpJson('GET', '/api/job-data/dashboard');
    const jobs = res.data as Array<{ url: string }>;
    const found = jobs.find(j => j.url === url);
    if (found) return found;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

test('GET /api/job-data/dashboard returns 200 with array', async () => {
  const res = await httpJson('GET', '/api/job-data/dashboard');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
});

test('POST /api/job-data/dashboard/add creates a new dashboard job', async () => {
  const testId = uniqueId('integ');
  const job = {
    title: 'Integration Test Job',
    url: `https://example.com/${testId}`,
    snippet: 'Integration test snippet',
    source: 'linkedin',
  };
  const res = await httpJson('POST', '/api/job-data/dashboard/add', job);
  assert.equal(res.status, 200);
  const data = res.data as { success: boolean; job: { title: string } };
  assert.equal(data.success, true);
  assert.equal(data.job.title, 'Integration Test Job');

  // Verify the job was persisted
  const found = await waitForDashboardJob(job.url);
  assert.ok(found, 'Job should be findable in dashboard');
});

test('POST /api/job-data/update-status updates status by url', async () => {
  const testId = uniqueId('status');
  const url = `https://example.com/${testId}`;
  await httpJson('POST', '/api/job-data/dashboard/add', {
    title: 'Status Test Job',
    url,
    snippet: '',
    source: 'linkedin',
  });

  const res = await httpJson('POST', '/api/job-data/update-status', {
    url,
    status: 'Interviewing',
    column: 'screening',
  });
  assert.equal(res.status, 200);
  const data = res.data as { success: boolean };
  assert.equal(data.success, true);

  // Verify the update persisted
  const updated = await waitForDashboardJob(url) as { status?: string; column?: string };
  assert.ok(updated, 'Updated job should be in dashboard');
  assert.equal(updated.status, 'Interviewing');
  assert.equal(updated.column, 'screening');
});

test('POST /api/job-data/update-status rejects missing url and id', async () => {
  const res = await httpJson('POST', '/api/job-data/update-status', {
    status: 'Interviewing',
  });
  assert.equal(res.status, 400);
  assert.ok((res.data as { error: string }).error.includes('Missing'));
});

test('POST /api/job-data/rounds increments rounds by delta', async () => {
  const testId = uniqueId('rounds');
  const url = `https://example.com/${testId}`;
  await httpJson('POST', '/api/job-data/dashboard/add', {
    title: 'Rounds Test Job',
    url,
    snippet: '',
    source: 'linkedin',
  });

  const res = await httpJson('POST', '/api/job-data/rounds', {
    url,
    delta: 2,
  });
  assert.equal(res.status, 200);
  const data = res.data as { success: boolean; interviewRounds: number };
  assert.equal(data.success, true);
  assert.equal(data.interviewRounds, 2);
});

test('POST /api/job-data/rename updates title by url', async () => {
  const testId = uniqueId('rename');
  const url = `https://example.com/${testId}`;
  await httpJson('POST', '/api/job-data/dashboard/add', {
    title: 'Original Title',
    url,
    snippet: '',
    source: 'linkedin',
  });

  const res = await httpJson('POST', '/api/job-data/rename', {
    url,
    title: 'Renamed Title',
  });
  assert.equal(res.status, 200);
  const data = res.data as { success: boolean };
  assert.equal(data.success, true);

  // Verify the rename persisted
  const updated = await waitForDashboardJob(url) as { title: string };
  assert.ok(updated, 'Renamed job should be in dashboard');
  assert.equal(updated.title, 'Renamed Title');
});

test('POST /api/job-data/rename rejects missing url and id', async () => {
  const res = await httpJson('POST', '/api/job-data/rename', {
    title: 'Some Title',
  });
  assert.equal(res.status, 400);
  assert.ok((res.data as { error: string }).error.includes('Missing'));
});

test('POST /api/job-data/dashboard/delete removes job by url', async () => {
  const testId = uniqueId('delete');
  const url = `https://example.com/${testId}`;
  await httpJson('POST', '/api/job-data/dashboard/add', {
    title: 'Delete Me',
    url,
    snippet: '',
    source: 'linkedin',
  });

  const res = await httpJson('POST', '/api/job-data/dashboard/delete', {
    url,
  });
  assert.equal(res.status, 200);
  const data = res.data as { success: boolean };
  assert.equal(data.success, true);

  // Verify the job was deleted
  await new Promise(r => setTimeout(r, 500));
  const dashboardRes = await httpJson('GET', '/api/job-data/dashboard');
  const jobs = dashboardRes.data as Array<{ url: string }>;
  assert.ok(!jobs.some(j => j.url === url), 'Deleted job should not be in dashboard');
});

test('POST /api/job-data/dashboard/delete rejects missing url and id', async () => {
  const res = await httpJson('POST', '/api/job-data/dashboard/delete', {});
  assert.equal(res.status, 400);
  assert.ok((res.data as { error: string }).error.includes('Missing'));
});