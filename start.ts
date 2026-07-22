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

// Wrap in try-catch for graceful degradation
let pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Busboy: any = null;
try {
  pdfParse = require('pdf-parse');
  Busboy = require('busboy');
} catch (e: unknown) {
  console.warn('PDF dependencies not installed. Run: npm install pdf-parse busboy');
}

const PORT = 3000;
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
    COHERE_MODEL: 'command-r-plus',
    MISTRAL_API_KEY: '',
    MISTRAL_MODEL: 'mistral-large-latest',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'gemini-2.5-flash',
    GROQ_API_KEY: '',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    PRIMARY_COLOR: '#0a0a0a',
    SECONDARY_COLOR: '#0a0a0a',
    ACCENT_COLOR: '#2563eb',
    TEXT_COLOR: '#171717',
    TEXT_LIGHT_COLOR: '#404040',
    BG_BADGE_COLOR: '#f1f5f9',
    SUCCESS_COLOR: '#0ea5e9',
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
      if (Object.prototype.hasOwnProperty.call(env, key) || key.includes('COLOR')) {
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

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const providerLib = require('./src/providers.ts');
  const { configured } = providerLib.getProviderConfig(env);

  clientSafe.AI_INFERENCE_ORDER = env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq';
  clientSafe.availableProviders = configured;
  clientSafe.primaryProvider = configured[0] || null;

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

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Serve /config.json endpoint — client-safe, NO API keys
  if (req.url === '/config.json') {
    const config = getConfigFromEnv();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // API Infer — new unified provider router endpoint
  if (req.url === '/api/infer' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const requestData = JSON.parse(body);

      const providerLib = require('./src/providers.ts');
      const validationErrors = providerLib.validateInferenceRequest(requestData);
      if (validationErrors.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request', details: validationErrors }));
        return;
      }

      const env = getFullConfigFromEnv();
      const { system, prompt, provider, temperature, max_tokens, top_p } = requestData;
      const params: Record<string, unknown> = {};
      if (temperature !== undefined) params.temperature = temperature;
      if (max_tokens !== undefined) params.max_tokens = max_tokens;
      if (top_p !== undefined) params.top_p = top_p;

      try {
        const router = require('./src/router.ts');
        const result = await router.runInference(system, prompt, params, env, provider);
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

        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'All providers exhausted',
          attempts: (err as { attempts?: Array<unknown> }).attempts || [],
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
  if (req.url && req.url.startsWith('/api/prompts/')) {
    const promptName = req.url.replace('/api/prompts/', '');
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
  if (req.url === '/api/parse-resume-pdf' && req.method === 'POST') {
    if (!pdfParse || !Busboy) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'PDF parsing not available. Install dependencies.' }));
      return;
    }

    const busboy = new Busboy({ headers: req.headers });
    const fileBuffer: Buffer[] = [];

    busboy.on('file', (_fieldname: string, file: import('stream').Readable) => {
      file.on('data', (data: Buffer) => fileBuffer.push(data));
    });

    busboy.on('finish', async () => {
      if (fileBuffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No PDF uploaded' }));
        return;
      }

      try {
        const buffer = Buffer.concat(fileBuffer);
        const data = await (pdfParse as (buffer: Buffer) => Promise<{ text: string }>)(buffer);
        const text = data.text;

        const estimatedPages = Math.ceil(text.length / 3000);

        if (estimatedPages > 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'PDF_TOO_LARGE',
            message: `Resume is ~${estimatedPages} pages. Recommended is 1-2 pages, take into account that processing this PDF would consume extra tokens.`,
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
      }
    });

    busboy.on('error', (err: Error) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload error: ' + err.message }));
    });

    req.pipe(busboy);
    return;
  }

  if (req.url === '/api/polish-resume' && req.method === 'POST') {
    const body = await getRequestBody(req);
    let resumeData: Record<string, unknown>;
    try {
      resumeData = JSON.parse(body);
    } catch (e: unknown) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
      return;
    }

    // Extract optional provider from request body
    const selectedProvider = resumeData.provider ? String(resumeData.provider) : null;
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
      const router = require('./src/router.ts');
      const result = await router.runPolish(dataToPolish, promptTemplate, env, selectedProvider);
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

      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Polish failed: all providers exhausted',
        attempts: (err as { attempts?: Array<unknown> }).attempts || [],
        suggestion: 'Check your API keys and network connection.',
      }));
    }
    return;
  }

  if (req.url === '/api/save-polished' && req.method === 'POST') {
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

  if (req.url === '/api/save-resume-data' && req.method === 'POST') {
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

  if (req.url === '/api/rollback' && req.method === 'POST') {
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

  // Default to main.html for root
  let filePath = req.url === '/' ? '/public/main.html' : req.url;
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