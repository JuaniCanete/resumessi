/*
 * resumessi — Start Script
 *
 * Starts a local HTTP server and opens the app in your browser.
 * Zero external dependencies - uses only Node.js built-in modules.
 *
 * Usage: npm start
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Wrap in try-catch for graceful degradation
let pdfParse, Busboy;
try {
  pdfParse = require('pdf-parse');
  Busboy = require('busboy');
} catch (e) {
  console.warn('PDF dependencies not installed. Run: npm install pdf-parse busboy');
}

const PORT = 3000;
const ROOT = __dirname;

// MIME types for common extensions
const MIME = {
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

// Parse .env file and return as JSON object
function getConfigFromEnv() {
  const envPath = path.join(ROOT, '.env');
  const env = {
    AI_API_KEY: 'your_api_key_here',
    AI_MODEL: 'gemini-2.5-flash',
    AI_FALLBACK_MODEL: 'gemini-2.5-flash-lite',
    PRIMARY_COLOR: '#0a0a0a',
    SECONDARY_COLOR: '#0a0a0a',
    ACCENT_COLOR: '#2563eb',
    TEXT_COLOR: '#171717',
    TEXT_LIGHT_COLOR: '#404040',
    BG_BADGE_COLOR: '#f1f5f9',
    SUCCESS_COLOR: '#0ea5e9',
  };

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
      if (env.hasOwnProperty(key) || key.startsWith('AI_') || key.includes('COLOR')) {
        env[key] = value;
      }
    });
  }
  return env;
}

// Helper function for reading request body
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Serve /config.json endpoint - reads .env server-side
  if (req.url === '/config.json') {
    const config = getConfigFromEnv();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // Serve prompt files dynamically
  if (req.url.startsWith('/api/prompts/')) {
    const promptName = req.url.replace('/api/prompts/', '');
    const promptPath = path.join(ROOT, 'prompts', promptName);

    // Security: prevent directory traversal
    if (!promptPath.startsWith(path.join(ROOT, 'prompts'))) {
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
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load prompt: ' + err.message }));
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

    const busboy = Busboy({ headers: req.headers });
    const fileBuffer = [];

    busboy.on('file', (fieldname, file) => {
      file.on('data', data => fileBuffer.push(data));
    });

    busboy.on('finish', async () => {
      if (fileBuffer.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No PDF uploaded' }));
        return;
      }

      try {
        const buffer = Buffer.concat(fileBuffer);
        const data = await pdfParse(buffer);
        const text = data.text;

        const estimatedPages = Math.ceil(text.length / 3000);

        if (estimatedPages > 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'PDF_TOO_LARGE',
            message: `Resume is ~${estimatedPages} pages. Recommended is 1-2 pages, take into account that processing this PDF would consume extra tokens.`,
            pages: estimatedPages,
            textPreview: text.substring(0, 10000)
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          text: text,
          pages: estimatedPages
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to parse PDF: ' + err.message }));
      }
    });

    busboy.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upload error: ' + err.message }));
    });

    req.pipe(busboy);
    return;
  }

  if (req.url === '/api/polish-resume' && req.method === 'POST') {
    const body = await getRequestBody(req);
    const resumeData = JSON.parse(body);

    const apiKey = getConfigFromEnv().AI_API_KEY;
    const model = getConfigFromEnv().AI_MODEL || 'gemini-2.5-flash';

    // Load polish prompt dynamically
    let prompt;
    try {
      const promptPath = path.join(ROOT, 'prompts', 'polish.txt');
      const promptTemplate = fs.readFileSync(promptPath, 'utf-8');
      prompt = `${promptTemplate}\n\nRESUME DATA TO POLISH: \n${JSON.stringify(resumeData, null, 2)}`;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load polish prompt: ' + err.message }));
      return;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      let raw = data.candidates[0].content.parts[0].text;
      raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

      const polished = JSON.parse(raw);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(polished));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Polish failed: ' + err.message }));
    }
    return;
  }

  if (req.url === '/api/save-polished' && req.method === 'POST') {
    const body = await getRequestBody(req);
    const polishedData = JSON.parse(body);

    try {
      fs.writeFileSync(
        'resume_generation/resume-data-AI-polished.json',
        JSON.stringify(polishedData, null, 2)
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save polished resume: ' + err.message }));
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
        path.join(ROOT, 'resume_generation', 'resume-data.json'),
        JSON.stringify(resumeData, null, 2)
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save resume data: ' + err.message }));
    }
    return;
  }

  if (req.url === '/api/rollback' && req.method === 'POST') {
    const fs = require('fs');
    const filePath = 'resume_generation/resume-data-AI-polished.json';

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to rollback polished resume: ' + err.message }));
    }
    return;
  }

  // Default to main.html for root
  let filePath = req.url === '/' ? '/pages/main.html' : req.url;
  filePath = path.join(ROOT, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
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
  const url = `http://localhost:${PORT}/pages/main.html`;
  console.log('');
  console.log(`  Serving:  ${url}`);
  console.log('  Press Ctrl+C to stop.');
  console.log('');

  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
  }
});