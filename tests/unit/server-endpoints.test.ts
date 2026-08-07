import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import * as http from 'node:http';

const TEST_PORT = 3447;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ChildProcess | null = null;

interface HttpResponse {
  status: number;
  data: unknown;
}

function httpJson(method: string, path: string, body?: unknown): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
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
      execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      // process already gone
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
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test' },
    stdio: 'ignore',
    detached: true,
  });
  await waitForServer(`${BASE_URL}/config.json`);
});

after(() => {
  stopServer();
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