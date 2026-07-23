#!/usr/bin/env node

/**
 * resumessi — Build Script
 *
 * Optionally injects prompt files into HTML as build-time constants.
 * Prompts are currently loaded at runtime via /api/prompts/ — so this
 * script is a no-op unless {{ATS_SCAN_PROMPT}} is added to main.html.
 *
 * Also compiles public/app.ts → public/dist/app.js via esbuild.
 *
 * Usage:
 *   tsx build.ts          # inject prompts if placeholders are present + build frontend
 *   tsx build.ts --check  # check if any placeholders need injection
 *
 * Source:
 *   - src/prompts/ats-scan.txt → public/main.html {{ATS_SCAN_PROMPT}} (optional)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';

const ROOT = path.join(__dirname);
const ATS_PROMPT_FILE = path.join(ROOT, 'src', 'prompts', 'ats-scan.txt');
const HTML_FILE = path.join(ROOT, 'public', 'main.html');

function readPromptBlock(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Try to extract fenced code block; if not found, use the whole file
  const match = content.match(/```\r?\n([\s\S]*?)```/);
  const inner = match && match[1] ? match[1].trim() : content.trim();
  if (!inner) {
    throw new Error(`Empty prompt content in ${filePath}`);
  }
  // Return as a valid JS string literal using JSON.stringify
  return JSON.stringify(inner);
}

function replaceLast(content: string, placeholder: string, replacement: string): string | null {
  const idx = content.lastIndexOf(placeholder);
  if (idx === -1) return null;
  return content.substring(0, idx) + replacement + content.substring(idx + placeholder.length);
}

function injectPromptLast(filePath: string, placeholder: string, value: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const updated = replaceLast(content, placeholder, value);
  if (!updated) {
    console.log(`Skipping ${path.relative(ROOT, filePath)} — placeholder ${placeholder} not found (prompts loaded at runtime).`);
    return;
  }
  fs.writeFileSync(filePath, updated, 'utf-8');
  console.log(`Injected prompt into ${path.relative(ROOT, filePath)}`);
}

async function buildFrontend(): Promise<void> {
  const entryPoint = path.join(ROOT, 'public', 'app.ts');
  const outDir = path.join(ROOT, 'public', 'dist');
  const outFile = path.join(outDir, 'app.js');

  if (!fs.existsSync(entryPoint)) {
    console.log('Skipping frontend build — public/app.ts not found.');
    return;
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      minify: true,
      outfile: outFile,
      format: 'iife',
      target: 'es2020',
      platform: 'browser',
    });
    console.log(`Built frontend: ${path.relative(ROOT, outFile)}`);
  } catch (err: unknown) {
    console.error('Frontend build failed:', (err as Error).message);
    process.exit(1);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  if (checkOnly) {
    const html = fs.readFileSync(HTML_FILE, 'utf-8');
    const hasHtmlPlaceholder = html.includes('{{ATS_SCAN_PROMPT}}');
    if (!hasHtmlPlaceholder) {
      console.log('No placeholders found — prompts loaded at runtime. Build check passed.');
      return;
    }
    console.log('Placeholders present. Use build.ts without --check to inject.');
    return;
  }

  console.log('Reading prompt sources...');
  const atsPrompt = readPromptBlock(ATS_PROMPT_FILE);

  console.log('Injecting prompts...');
  injectPromptLast(HTML_FILE, '{{ATS_SCAN_PROMPT}}', atsPrompt);

  // Build frontend bundle
  buildFrontend().then(() => {
    console.log('\nBuild completed successfully.');
    console.log('Next steps:');
    console.log('  1. Open public/main.html to verify ATS prompt changes');
    console.log('  2. public/dist/app.js is bundled from public/app.ts');
  });
}

main();