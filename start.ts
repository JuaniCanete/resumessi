/*
 * resumessi — Start Script
 *
 * Starts a local HTTP server and opens the app in your browser.
 * Zero external dependencies - uses only Node.js built-in modules.
 *
 * Usage: npm start
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { getProviderConfig, validateInferenceRequest, safeJsonParse } from './src/providers';
import { runInference, runPolish } from './src/router';
import {
  scrapeLinkedIn,
  validateLinkedInStorageState,
  fetchLinkedInJobDescription,
  LinkedInSessionExpiredError,
} from './src/scraper/linkedin';
import { scrapeGoogle } from './src/scraper/google';
import { generateLinkedInStorageState } from './scripts/linkedin-auth';
import { getRequestPath } from './src/scraper/runtime-utils';
import type { ScraperQuery, ScraperResult } from './src/scraper/types';
import {
  loadJobData,
  markScrapingResultRemoved,
  saveJobFromScraping,
  unsaveJob,
  getSavedJobs,
  applyToJob,
  getJobDashboard,
  updateDashboardJob,
  removeDashboardJob,
  getScrapingRun,
  setScrapingRun,
  updateScrapingResultSummary,
  clearScrapingRunCache,
  initStorage,
  insertDashboardJob,
  clearTestDashboardData,
} from './src/storage/jobDataSqlite';
import * as https from 'https';

// Wrap in try-catch for graceful degradation
let pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let formidable: any = null;
try {
  pdfParse = require('pdf-parse-fork');
  formidable = require('formidable');
} catch {
  console.warn('PDF dependencies not installed. Run: npm install pdf-parse-fork formidable');
}

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

// MIME types for common extensions
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.drawio': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Parse .env file into an object — shared by both config functions below.
function parseEnvFile(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    AI_INFERENCE_ORDER: 'cohere,mistral,gemini,groq',
    COHERE_API_KEY: '',
    COHERE_MODEL: 'command-a-reasoning-08-2025-08-2024',
    MISTRAL_API_KEY: '',
    MISTRAL_MODEL: 'codestral-2508',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-3.6-flash',
    GROQ_API_KEY: '',
    GROQ_MODEL: 'openai/gpt-oss-120b',
    PRIMARY_COLOR: '#0a0a0a',
    SECONDARY_COLOR: '#0a0a0a',
    ACCENT_COLOR: '#2563eb',
    TEXT_COLOR: '#171717',
    TEXT_LIGHT_COLOR: '#404040',
    BG_BADGE_COLOR: '#f1f5f9',
    SUCCESS_COLOR: '#0ea5e9',
    CHROME_PATH: '',
    GOOGLE_API_KEY: '',
  };

  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line.startsWith('#') || !line.includes('=')) return;
      const eqIndex = line.indexOf('=');
      const key = line.substring(0, eqIndex).trim();
      let value = line.substring(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (Object.prototype.hasOwnProperty.call(env, key) || key.includes('COLOR') || key === 'AI_INFERENCE_ORDER' || key.startsWith('LINKEDIN_') || key === 'CHROME_PATH') {
        env[key] = value;
      }
    });
  }
  return env;
}

/**
 * Client-safe config — strips API keys before sending to the browser.
 * Used by the /config.json endpoint.
 */
function getConfigFromEnv(): Record<string, string | string[] | null | undefined> {
  const env = parseEnvFile();
  const clientSafe: Record<string, string | string[] | null | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    // Exclude any key that contains 'KEY' or 'SECRET' (case-insensitive)
    if (/KEY|SECRET/i.test(key)) continue;
    clientSafe[key] = value;
  }

  const providerConfig = getProviderConfig(env);

  clientSafe.AI_INFERENCE_ORDER = env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq';
  clientSafe.availableProviders = providerConfig.configured;
  clientSafe.primaryProvider = providerConfig.configured[0] || null;
  clientSafe.NODE_ENV = process.env.NODE_ENV || 'production';

  return clientSafe;
}

/**
 * Full server-only config — includes API keys.
 * NEVER send this to the client. Used only in /api/infer and /api/polish-resume.
 */
function getFullConfigFromEnv(): Record<string, string | undefined> {
  return parseEnvFile();
}

// Helper function for reading request body
function getRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: string) => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Simple in-memory token bucket rate limiter (per IP) for resource-heavy endpoints.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;     // max requests per window per IP
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: http.IncomingMessage): string {
  return req.socket.remoteAddress || 'unknown';
}

// Prune expired rate-limit buckets to avoid unbounded memory growth.
function pruneRateLimitBuckets(): void {
  const now = Date.now();
  for (const [ip, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(ip);
    }
  }
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  if (rateLimitBuckets.size > 1000) {
    pruneRateLimitBuckets();
  }
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Extract structured job parameters (location, remote, salary, etc.) via AI
async function extractJobParameters(results: ScraperResult[], env: Record<string, string | undefined>): Promise<void> {
  if (results.length === 0) return;
  try {
    const promptPath = path.join(ROOT, 'src', 'prompts', 'scraper-parameters.txt');
    const systemPrompt = fs.existsSync(promptPath)
      ? fs.readFileSync(promptPath, 'utf-8')
      : 'You are a job parameter extraction assistant. Return only valid JSON.';

    // Truncate results to avoid oversized prompts (keep token usage predictable)
    const MAX_PROMPT_RESULTS = 10;
    const trimmedResults = results.slice(0, MAX_PROMPT_RESULTS).map((r): Record<string, unknown> => {
      const { snippet, aiSummary, ...rest } = r as unknown as Record<string, unknown>;
      return {
        ...rest,
        snippet: typeof snippet === 'string' ? snippet.substring(0, 200) : '',
        aiSummary: typeof aiSummary === 'string' ? aiSummary.substring(0, 200) : '',
      };
    });

    const prompt = `Scraped Results:\n${JSON.stringify(trimmedResults, null, 2)}`;
    const inferenceResult = await runInference(systemPrompt, prompt, { temperature: 0, max_tokens: 1024, top_p: 0.1 }, env, null, null, null, 'scraper');
    let raw = inferenceResult.text;
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    // Extract first JSON array from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      raw = jsonMatch[0];
    }

    const parsed = JSON.parse(raw) as Array<{ index: number; parameters: string[] }>;
    for (const entry of parsed) {
      if (entry.index >= 0 && entry.index < results.length && Array.isArray(entry.parameters)) {
        results[entry.index].parameters = entry.parameters;
      }
    }
  } catch (err: unknown) {
    console.warn('[Scraper API] Parameter extraction warning:', (err as Error).message);
  }
}

initStorage();

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const requestPath = req.url ? getRequestPath(req.url) : '/';

  // Serve /config.json endpoint — client-safe, NO API keys
  if (requestPath === '/config.json') {
    const config = getConfigFromEnv();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // API Infer — new unified provider router endpoint
  if (requestPath === '/api/infer' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const requestData = JSON.parse(body);

      const validationErrors = validateInferenceRequest(requestData);
      if (validationErrors.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request', details: validationErrors }));
        return;
      }

      const env = getFullConfigFromEnv();
      const { system, prompt, provider, scope = 'generic', temperature, max_tokens, top_p } = requestData;
      const params: Record<string, unknown> = {};
      if (temperature !== undefined) params.temperature = temperature;
      if (max_tokens !== undefined) params.max_tokens = max_tokens;
      if (top_p !== undefined) params.top_p = top_p;

      // Capture provider name for error fallback (accessible in outer scope)
      const attemptedProvider = provider || null;

      try {
        const result = await runInference(system, prompt, params, env, provider, null, null, scope);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          text: result.text,
          provider: result.provider,
          usage: result.usage,
        }));
      } catch (err: unknown) {
        if ((err as Error).message === 'No providers configured. Set at least one *_API_KEY in .env.') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
          return;
        }

        const routerErr = err as { attempts?: Array<{ provider: string; status: number; error: string }>; message?: string };
        const detailedAttempts = routerErr.attempts || [];

        let errorMsg: string;
        if (detailedAttempts.length > 0) {
          const a = detailedAttempts[0];
          errorMsg = `${a.provider} failed with ${a.error}. Retry later or try with another provider.`;
        } else {
          errorMsg = `${attemptedProvider || 'Unknown provider'} failed. Retry later or try with another provider.`;
        }

        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: errorMsg,
          attempts: detailedAttempts,
          suggestion: 'Check your API keys and network connection.',
        }));
      }
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Inference error: ' + (err as Error).message }));
    }
    return;
  }

  // Serve prompt files dynamically
  if (requestPath.startsWith('/api/prompts/')) {
    const promptName = requestPath.replace('/api/prompts/', '');
    const promptPath = path.join(ROOT, 'src', 'prompts', promptName);

    // Security: prevent directory traversal
    if (!promptPath.startsWith(path.join(ROOT, 'src', 'prompts'))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(promptPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Prompt not found' }));
      return;
    }

    try {
      const content = fs.readFileSync(promptPath, 'utf-8');
      const ext = path.extname(promptPath);
      const mimeType = ext === '.md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8';
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load prompt: ' + (err as Error).message }));
    }
    return;
  }

  // API Routes
  if (requestPath === '/api/parse-resume-pdf' && req.method === 'POST') {
    if (!pdfParse || !formidable) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'PDF parsing not available. Install dependencies.' }));
      return;
    }

    const form = new formidable.IncomingForm();
    form.parse(req, async (err: Error | undefined, _fields: Record<string, unknown>, files: Record<string, unknown>) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upload error: ' + err.message }));
        return;
      }

      const rawFileField = Object.values(files)[0];
      const file = Array.isArray(rawFileField) ? rawFileField[0] : rawFileField;
      const parsedFile = file as { filepath?: string; originalFilename?: string } | undefined;

      if (!parsedFile || !parsedFile.filepath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No PDF uploaded' }));
        return;
      }

      const filepath =  parsedFile.filepath;

      try {
        const buffer = fs.readFileSync(filepath);
        const data = await (pdfParse as (buffer: Buffer) => Promise<{ text: string }>)(buffer);
        const text = data.text;

        const estimatedPages = Math.ceil(text.length / 3000);

        if (estimatedPages > 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'PDF_TOO_LARGE',
            message: `Resume is ~${estimatedPages} pages. Recommended is 1-2 pages, take into account that processing this PDF will consume extra tokens.`,
            pages: estimatedPages,
            textPreview: text.substring(0, 10000),
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          text: text,
          pages: estimatedPages,
        }));
      } catch (err: unknown) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to parse PDF: ' + (err as Error).message }));
      } finally {
        try {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    });
    return;
  }

  if (requestPath === '/api/polish-resume' && req.method === 'POST') {
    const body = await getRequestBody(req);
    let resumeData: Record<string, unknown>;
    try {
      resumeData = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
      return;
    }

    // Extract optional provider and scope from request body
    const selectedProvider = resumeData.provider ? String(resumeData.provider) : null;
    const scope = resumeData.scope ? String(resumeData.scope) : 'polish';
    const dataToPolish = resumeData?.resumeData ? resumeData.resumeData as Record<string, unknown> : resumeData;

    let promptTemplate: string;
    try {
      const promptPath = path.join(ROOT, 'src', 'prompts', 'polish.txt');
      promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load polish prompt: ' + (err as Error).message }));
      return;
    }

    const env = getFullConfigFromEnv();

    try {
      const result = await runPolish(dataToPolish, promptTemplate, env, selectedProvider, null, null, scope);
      let raw = result.text;
      raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const polished = JSON.parse(raw);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(polished));
    } catch (err: unknown) {
      if ((err as Error).message === 'No providers configured. Set at least one *_API_KEY in .env.') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
        return;
      }

      const routerErr = err as { attempts?: Array<{ provider: string; status: number; error: string }>; message?: string };
      const detailedAttempts = routerErr.attempts || [];

      let errorMsg: string;
      if (detailedAttempts.length > 0) {
        const a = detailedAttempts[0];
        errorMsg = `${a.provider} failed with ${a.error}. Retry later or try with another provider.`;
      } else {
        errorMsg = `${selectedProvider || 'Unknown provider'} failed. Retry later or try with another provider.`;
      }

      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: errorMsg,
        attempts: detailedAttempts,
        suggestion: 'Check your API keys and network connection.',
      }));
    }
    return;
  }

  if (requestPath === '/api/save-polished' && req.method === 'POST') {
    const body = await getRequestBody(req);
    const polishedData = JSON.parse(body);

    try {
      fs.writeFileSync(
        path.join(ROOT, 'src', 'resume', 'output', 'resume-data-AI-polished.json'),
        JSON.stringify(polishedData, null, 2),
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save polished resume: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/save-resume-data' && req.method === 'POST') {
    const body = await getRequestBody(req);
    try {
      const resumeData = JSON.parse(body);
      // Validate required structure
      if (!resumeData.basics) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid resume data: missing basics' }));
        return;
      }
      fs.writeFileSync(
        path.join(ROOT, 'src', 'resume', 'output', 'resume-data.json'),
        JSON.stringify(resumeData, null, 2),
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save resume data: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/scraper/start' && req.method === 'POST') {
    const rateLimitResult = checkRateLimit(getClientIp(req));
    if (!rateLimitResult.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }));
      return;
    }
    try {
      const body = await getRequestBody(req);
      const query: ScraperQuery = JSON.parse(body);

      if (!query.source || !['linkedin', 'google'].includes(query.source)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Invalid request: 'source' must be 'linkedin' or 'google'" }));
        return;
      }

      const env = getFullConfigFromEnv();
      let rawResults: ScraperResult[] = [];

      if (query.source === 'linkedin') {
        rawResults = await scrapeLinkedIn(query);
      } else {
        rawResults = await scrapeGoogle(query, env);
      }

      const resultPayload = {
        timestamp: new Date().toISOString(),
        source: query.source,
        query,
        totalResults: rawResults.length,
        results: rawResults,
        summary: '',
        runId: crypto.randomUUID(),
        provider: '',
        metadataExtractionStatus: 'extracting',
      };

      await setScrapingRun(query.source as 'linkedin' | 'google', {
        timestamp: resultPayload.timestamp,
        query: query as unknown as Record<string, string>,
        results: rawResults.map(r => ({ ...r })),
        runId: resultPayload.runId,
      });

      // Run AI summarization in the background so the response is not
      // delayed by a slow/failing AI call. When it completes, the results
      // file is updated in place with the summary and per-result aiSummary.
      if (rawResults.length > 0) {
        const resultsCopy = rawResults.map(r => ({ ...r }));
        const envCopy = env;
        const queryCopy = query;
        const sourceCopy = query.source as 'linkedin' | 'google';
        void (async () => {
          try {
            const promptPath = path.join(ROOT, 'src', 'prompts', 'scraper-summarize.txt');
            const systemPrompt = fs.existsSync(promptPath)
              ? fs.readFileSync(promptPath, 'utf-8')
              : 'You are a job scraper summarizer assistant.';

            const prompt = `User Query: ${JSON.stringify(queryCopy)}\n\nScraped Results:\n${JSON.stringify(resultsCopy, null, 2)}`;
            const inferenceResult = await runInference(systemPrompt, prompt, { temperature: 0, max_tokens: 1024, top_p: 0.1 }, envCopy, null, null, null, 'scraper');
            let summaryText = inferenceResult.text;

            try {
              let raw = summaryText;
              raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
              const jsonMatch = raw.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                raw = jsonMatch[0];
              }
              const summaries = JSON.parse(raw) as Array<{ index: number; aiSummary: string; queryAffinity: 'High' | 'Medium' | 'Low' }>;
              for (const entry of summaries) {
                if (entry.index >= 0 && entry.index < resultsCopy.length && typeof entry.aiSummary === 'string') {
                  resultsCopy[entry.index].aiSummary = entry.aiSummary;
                  resultsCopy[entry.index].queryAffinity = entry.queryAffinity;
                }
              }
            } catch (parseErr: unknown) {
              console.warn('[Scraper API] Failed to parse per-result summaries:', (parseErr as Error).message);
            }

            const current = await getScrapingRun(sourceCopy);

            await extractJobParameters(resultsCopy, envCopy);

            await updateScrapingResultSummary(
              sourceCopy,
              { summary: summaryText, provider: inferenceResult.provider, metadataExtractionStatus: 'done' },
              resultsCopy.map(r => ({ ...r, source: sourceCopy, removed: current?.results.find(x => x.url === r.url)?.removed }) as ScraperResult)
            );
            console.log('[Scraper API] Background summarization & parameter extraction completed.');
          } catch (err: unknown) {
            console.warn('[Scraper API] Background summarization failed:', (err as Error).message);
          }
        })();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(resultPayload));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scraper failed: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/scraper/validate-linkedin' && req.method === 'POST') {
    try {
      const valid = await validateLinkedInStorageState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid, authMode: 'codegen' }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/scraper/regenerate-linkedin' && req.method === 'POST') {
    try {
      const success = await generateLinkedInStorageState();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success, message: success ? 'Storage state regenerated' : 'Failed to regenerate storage state' }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/scraper/results' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url || '/', `http://localhost:${PORT}`);
      const source = urlObj.searchParams.get('source') || 'linkedin';
      if (!['linkedin', 'google'].includes(source)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Invalid source. Must be 'linkedin' or 'google'." }));
        return;
      }
      const run = await getScrapingRun(source as 'linkedin' | 'google');
      if (run) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(run));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ timestamp: null, source, totalResults: 0, results: [] }));
      }
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  // API: Job Data - Saved Jobs
  if (requestPath === '/api/job-data/saved' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url || '/', `http://localhost:${PORT}`);
      const source = urlObj.searchParams.get('source') as 'linkedin' | 'google' | null;
      const savedJobs = await getSavedJobs(source || undefined);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(savedJobs));
      return;
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load saved jobs: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/dashboard' && req.method === 'GET') {
    try {
      const dashboard = await getJobDashboard();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dashboard));
      return;
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load dashboard: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/save' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { item, source } = JSON.parse(body) as { item: ScraperResult; source: 'linkedin' | 'google' };
      if (!item || !source) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing item or source' }));
        return;
      }
      await saveJobFromScraping(item, source);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save job: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/unsave' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { url, source } = JSON.parse(body) as { url: string; source: 'linkedin' | 'google' };
      if (!url || !source) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url or source' }));
        return;
      }
      await unsaveJob(source, url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to unsave job: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/remove' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { url, source } = JSON.parse(body) as { url: string; source: 'linkedin' | 'google' };
      if (!url || !source) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url or source' }));
        return;
      }
      await markScrapingResultRemoved(source, url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/apply' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { item, source, customTitle } = JSON.parse(body) as { item: ScraperResult; source: 'linkedin' | 'google'; customTitle?: string };
      if (!item || !source) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing item or source' }));
        return;
      }
      await applyToJob(item, source, customTitle);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      const message = (err as Error).message;
      if (message === 'DUPLICATE_TITLE' || message === 'DUPLICATE_URL') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Card is already on board' }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to apply to job: ' + message }));
      }
    }
    return;
  }

  if (requestPath === '/api/job-data/dashboard/add' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const job = JSON.parse(body) as ScraperResult & { saved?: boolean; applied?: boolean; savedAt?: string; appliedAt?: string; status?: string };
      if (!job || !job.title) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing job title' }));
        return;
      }
      const newJob = {
        ...job,
        savedAt: job.savedAt || new Date().toISOString(),
        appliedAt: job.appliedAt || new Date().toISOString(),
      };
      const result = await insertDashboardJob(newJob);
      clearScrapingRunCache();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, job: result }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to add job: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/update-status' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { url, status, column, id } = JSON.parse(body) as { url?: string; status: string; column?: string; id?: string };
      if ((!url && !id) || !status) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url or id, or status' }));
        return;
      }
      await updateDashboardJob(url, { status: status as 'No News' | 'Interviewing' | 'Offer' | 'Rejected', column, interviewRounds: 0 }, id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update status: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/rounds' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { url, id, delta } = JSON.parse(body) as { url?: string; id?: string; delta?: number };
      if (!url && !id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url or id' }));
        return;
      }
      const data = await loadJobData();
      const dashboard = data.jobDashboard;
      const idx = dashboard.findIndex(r => (url ? r.url === url : false) || (id && r.id && r.id === id));
      if (idx >= 0) {
        const current = dashboard[idx].interviewRounds || 0;
        const newRounds = Math.max(0, current + (delta || 1));
        await updateDashboardJob(url, { interviewRounds: newRounds }, id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, interviewRounds: newRounds }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Job not found' }));
      }
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update rounds: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/rename' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { url, title, id } = JSON.parse(body) as { url?: string; title: string; id?: string };
      if ((!url && !id) || !title) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url or id, or title' }));
        return;
      }
      await updateDashboardJob(url, { title }, id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/dashboard/delete' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const { url, id } = JSON.parse(body) as { url?: string; id?: string };
      if (!url && !id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url or id' }));
        return;
      }
      await removeDashboardJob(url, id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/job-data/dashboard/clear-test' && req.method === 'POST') {
    try {
      // Only allow in test mode
      if (process.env.NODE_ENV !== 'test') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: only available in test mode' }));
        return;
      }
      await clearTestDashboardData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/rollback' && req.method === 'POST') {
    const filePath = path.join(ROOT, 'src', 'resume', 'output', 'resume-data-AI-polished.json');

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to rollback polished resume: ' + (err as Error).message }));
    }
    return;
  }

  // API: Fetch URL content (for Check JD feature)
  if (requestPath === '/api/fetch-url' && req.method === 'POST') {
    const rateLimitResult = checkRateLimit(getClientIp(req));
    if (!rateLimitResult.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }));
      return;
    }
    try {
      const body = await getRequestBody(req);
      const { url } = JSON.parse(body);

      if (!url || typeof url !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid URL' }));
        return;
      }

      // SSRF protection: strict URL allowlist (protocol + hostname)
      const ALLOWED_HOSTS = new Set([
        'www.linkedin.com',
        'linkedin.com',
        'www.google.com',
        'google.com',
      ]);
      const validateUrl = (urlStr: string): URL => {
        const parsed = new URL(urlStr);
        if (parsed.protocol !== 'https:') throw new Error('Only HTTPS allowed');
        if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error('Host not allowed');
        return parsed;
      };
      const parsedUrl = validateUrl(url);

      // Fetch the URL content (follows redirects, sets realistic User-Agent)
      const fetchUrl = (urlStr: string, maxRedirects = 5): Promise<string> => {
        return new Promise((resolve, reject) => {
          const client = urlStr.startsWith('https') ? https : http;
          const req = client.get(urlStr, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }, (response) => {
            // Follow redirects (301, 302, 303, 307, 308)
            if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
              if (maxRedirects <= 0) {
                reject(new Error('Too many redirects'));
                return;
              }
              const redirectUrl = response.headers.location;
              // Handle relative redirects
              const nextUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, urlStr).href;
              try {
                // Redirects must also satisfy the allowlist to prevent SSRF bypass
                validateUrl(nextUrl);
              } catch (err: unknown) {
                reject(new Error(`Redirect blocked: ${(err as Error).message}`));
                return;
              }
              fetchUrl(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
              return;
            }
            let data = '';
            response.on('data', (chunk: string) => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
          });
          req.on('error', reject);
        });
      };

      let html: string;
      if (parsedUrl.hostname.endsWith('linkedin.com')) {
        // Authenticated Playwright fetch for LinkedIn: normalizes wrapper URLs
        // and uses the stored session. A session-expiry must surface to the user
        // (503), never fall through to the unauthenticated https.get (which would
        // re-fetch the login page and recreate the collection misclassification).
        try {
          const linkedInText = await fetchLinkedInJobDescription(url);
          html = linkedInText || '';
        } catch (err: unknown) {
          if (err instanceof LinkedInSessionExpiredError) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'LINKEDIN_SESSION_EXPIRED', message: err.message }));
            return;
          }
          // Other Playwright errors → surface error to user, no unauthenticated fallback
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch LinkedIn job description: ' + (err as Error).message }));
          return;
        }
      } else {
        html = await fetchUrl(url);
      }

      // Simple HTML to text extraction
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: text.substring(0, 15000) }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch URL: ' + (err as Error).message }));
    }
    return;
  }

  // API: Generate Cover Letter
  if (requestPath === '/api/generate-cover-letter' && req.method === 'POST') {
    const rateLimitResult = checkRateLimit(getClientIp(req));
    if (!rateLimitResult.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }));
      return;
    }
    try {
      const body = await getRequestBody(req);
      const { jobDescription, tone, englishLevel, focusAreas, charLimit, atsScore, atsTier, atsMissingKeywords, atsFeedback } = JSON.parse(body) as {
        jobDescription: string;
        tone: string;
        englishLevel: string;
        focusAreas: string;
        charLimit?: string;
        atsScore?: string;
        atsTier?: string;
        atsMissingKeywords?: string;
        atsFeedback?: string;
      };

      if (!jobDescription || typeof jobDescription !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid jobDescription' }));
        return;
      }

      // Load the resume data
      const resumeDataPath = path.join(ROOT, 'src', 'resume', 'output', 'resume-data.json');
      let resumeText = '';
      if (fs.existsSync(resumeDataPath)) {
        const resumeData = JSON.parse(fs.readFileSync(resumeDataPath, 'utf-8'));
        const basics = resumeData.basics || {};
        const name = basics.name || 'Candidate';
        const title = basics.title || '';
        const summary = resumeData.summary || '';
        const experience = resumeData.experience || [];
        const skills = resumeData.skills || {};
        const education = resumeData.education || [];

        let rt = `Name: ${name}\n`;
        if (title) rt += `Title: ${title}\n`;
        if (summary) rt += `\nSummary:\n${summary}\n`;

        if (experience.length > 0) {
          rt += '\nExperience:\n';
          for (const exp of experience) {
            rt += `- ${exp.title} at ${exp.company} (${exp.date})\n`;
            if (exp.bullets) {
              for (const bullet of exp.bullets) {
                rt += `  - ${bullet}\n`;
              }
            }
          }
        }

        if (Object.keys(skills).length > 0) {
          rt += '\nSkills:\n';
          for (const [category, skillList] of Object.entries(skills)) {
            rt += `${category}: ${(skillList as Array<{name: string}>).map((s: {name: string}) => s.name).join(', ')}\n`;
          }
        }

        if (education.length > 0) {
          rt += '\nEducation:\n';
          for (const edu of education) {
            rt += `- ${edu.degree} at ${edu.institution} (${edu.year})\n`;
          }
        }

        resumeText = rt;
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No resume data found. Please load a resume on the main page first.' }));
        return;
      }

      // Load the cover letter prompt template
      const promptPath = path.join(ROOT, 'src', 'prompts', 'cover-letter.txt');
      if (!fs.existsSync(promptPath)) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Cover letter prompt template not found' }));
        return;
      }

      let basePrompt = fs.readFileSync(promptPath, 'utf-8');
      basePrompt = basePrompt.replace('{resume_text}', resumeText);
      basePrompt = basePrompt.replace('{job_description}', jobDescription);
      basePrompt = basePrompt.replace('{ats_score}', atsScore || 'N/A');
      basePrompt = basePrompt.replace('{ats_tier}', atsTier || 'N/A');
      basePrompt = basePrompt.replace('{ats_missing_keywords}', atsMissingKeywords || 'None');
      basePrompt = basePrompt.replace('{ats_feedback}', atsFeedback || 'No ATS scan performed');
      basePrompt = basePrompt.replace('{tone}', tone || 'Formal');
      basePrompt = basePrompt.replace('{english_level}', englishLevel || 'C1');
      basePrompt = basePrompt.replace('{char_limit}', charLimit || 'unlimited');
      basePrompt = basePrompt.replace('{focus_areas}', focusAreas || 'None specified');

      const env = getFullConfigFromEnv();

      try {
        const result = await runInference(
          'You are a cover letter writing assistant. Output only the cover letter text, no markdown, no explanations.',
          basePrompt,
          { temperature: 0.7, max_tokens: 1024, top_p: 0.9 },
          env,
          null,
          null,
          null,
          'cover-letter',
        );

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(result.text);
      } catch (err: unknown) {
        if ((err as Error).message === 'No providers configured. Set at least one *_API_KEY in .env.') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cover letter generation error: ' + (err as Error).message }));
    }
    return;
  }

  if (requestPath === '/api/ats/clean-jd' && req.method === 'POST') {
    const rateLimitResult = checkRateLimit(getClientIp(req));
    if (!rateLimitResult.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }));
      return;
    }
    try {
      const body = await getRequestBody(req);
      const { jobDescription, url, source } = JSON.parse(body) as { jobDescription?: string; url?: string; source?: string };

      if (!jobDescription || typeof jobDescription !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid jobDescription' }));
        return;
      }

      const promptPath = path.join(ROOT, 'src', 'prompts', 'clean-jd.txt');
      if (!fs.existsSync(promptPath)) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Clean JD prompt template not found' }));
        return;
      }

      let basePrompt = fs.readFileSync(promptPath, 'utf-8');
      basePrompt = basePrompt.replace('{url}', url || '');
      basePrompt = basePrompt.replace('{source}', source || 'unknown');
      basePrompt = basePrompt.replace('{raw_text}', jobDescription);

      const env = getFullConfigFromEnv();

      try {
        const result = await runInference(
          'You are a job description cleaner and classifier.',
          basePrompt,
          { temperature: 0, max_tokens: 2048, top_p: 0.1 },
          env,
          null,
          null,
          null,
          'ats-clean',
        );

        let raw = result.text;
        raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          raw = jsonMatch[0];
        }

        const parsedResult = safeJsonParse(raw);
        if (!parsedResult.data) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to parse cleaned JD: ' + parsedResult.error }));
          return;
        }
        const parsed = parsedResult.data as { isCollection: boolean; cleanedJD: string; notes: string };

        if (parsed.isCollection) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'COLLECTION_DETECTED',
            message: 'ATS is not possible as the link belongs to a collection of jobs instead of a job with unique JD. Enter to the link to gather JD or apply is recommended.',
            notes: parsed.notes,
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ cleanedJD: parsed.cleanedJD }));
      } catch (err: unknown) {
        if ((err as Error).message === 'No providers configured. Set at least one *_API_KEY in .env.') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Clean JD error: ' + (err as Error).message }));
    }
    return;
  }

  // API: ATS Scan (for Check JD feature in results page)
  if (requestPath === '/api/ats/scan' && req.method === 'POST') {
    const rateLimitResult = checkRateLimit(getClientIp(req));
    if (!rateLimitResult.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)) });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }));
      return;
    }
    try {
      const body = await getRequestBody(req);
      const { jobDescription, provider } = JSON.parse(body) as { jobDescription?: string; provider?: string };

      if (!jobDescription || typeof jobDescription !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid jobDescription' }));
        return;
      }

      // Load the resume data
      const resumeDataPath = path.join(ROOT, 'src', 'resume', 'output', 'resume-data.json');
      let resumeText = '';
      if (fs.existsSync(resumeDataPath)) {
        const resumeData = JSON.parse(fs.readFileSync(resumeDataPath, 'utf-8'));
        // Extract text from resume data structure
        const basics = resumeData.basics || {};
        const name = basics.name || 'Candidate';
        const title = basics.title || '';
        const summary = resumeData.summary || '';
        const experience = resumeData.experience || [];
        const skills = resumeData.skills || {};
        const education = resumeData.education || [];

        let rt = `Name: ${name}\n`;
        if (title) rt += `Title: ${title}\n`;
        if (summary) rt += `\nSummary:\n${summary}\n`;

        if (experience.length > 0) {
          rt += '\nExperience:\n';
          for (const exp of experience) {
            rt += `- ${exp.title} at ${exp.company} (${exp.date})\n`;
            if (exp.bullets) {
              for (const bullet of exp.bullets) {
                rt += `  - ${bullet}\n`;
              }
            }
          }
        }

        if (Object.keys(skills).length > 0) {
          rt += '\nSkills:\n';
          for (const [category, skillList] of Object.entries(skills)) {
            rt += `${category}: ${(skillList as Array<{name: string}>).map((s: {name: string}) => s.name).join(', ')}\n`;
          }
        }

        if (education.length > 0) {
          rt += '\nEducation:\n';
          for (const edu of education) {
            rt += `- ${edu.degree} at ${edu.institution} (${edu.year})\n`;
          }
        }

        resumeText = rt;
      } else {
        // If no resume data file exists, return a specific error
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No resume data found. Please load a resume on the main page first.' }));
        return;
      }

      // Load the ATS prompt template
      const promptPath = path.join(ROOT, 'src', 'prompts', 'ats-scan.txt');
      if (!fs.existsSync(promptPath)) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ATS prompt template not found' }));
        return;
      }

      let basePrompt = fs.readFileSync(promptPath, 'utf-8');
      basePrompt = basePrompt.replace('{job_description}', jobDescription);
      basePrompt = basePrompt.replace('{resume_text}', resumeText);

      const env = getFullConfigFromEnv();

      try {
        const result = await runInference(
          'You are an ATS resume scorer. Return only valid JSON matching the requested schema.',
          basePrompt,
          { temperature: 0, max_tokens: 2048, top_p: 0.1 },
          env,
          provider || null,
          null,
          null,
          'ats',
        );

        let raw = result.text;
        raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

        // Extract first JSON object from response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          raw = jsonMatch[0];
        }

        const parsed = JSON.parse(raw) as { ai_screening: Record<string, unknown> };
        const screening = parsed.ai_screening;
        screening.provider = result.provider;
        screening.model = result.model;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(screening));
      } catch (err: unknown) {
        if ((err as Error).message === 'No providers configured. Set at least one *_API_KEY in .env.') {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ATS scan error: ' + (err as Error).message }));
    }
    return;
  }

  // Default to main.html for root
  let filePath = requestPath === '/' ? '/public/main.html' : requestPath;
  filePath = path.join(ROOT, filePath as string);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err: globalThis.NodeJS.ErrnoException | null, data: Buffer) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found: ' + req.url);
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/public/main.html`;
  console.log('');
  console.log(`  Serving:  ${url}`);
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  const shouldOpen = !process.argv.includes('--no-open') && process.env.NODE_ENV !== 'test' && !process.env.CI;
  if (shouldOpen) {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
    }
  }
});