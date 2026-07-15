#!/usr/bin/env node
/**
 * resumessi — Pre-build Validation Script
 *
 * Asserts that all required prompt source files exist and are non-empty
 * before running the build. Fails fast with a clear error message.
 *
 * Usage:  node scripts/validate.js
 * Hook:   automatically run via "prebuild" in package.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const REQUIRED_PROMPTS = [
  'src/prompts/ats-scan.txt',
  'src/prompts/resume-generation.txt',
  'src/prompts/extraction.txt',
  'src/prompts/polish.txt',
];

let hasErrors = false;

function check(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    console.error(`❌ Missing required file: ${relPath}`);
    hasErrors = true;
    return;
  }
  const content = fs.readFileSync(abs, 'utf-8').trim();
  if (content.length === 0) {
    console.error(`❌ File is empty: ${relPath}`);
    hasErrors = true;
    return;
  }
  // Warn about inconsistent line endings (mixed CRLF/LF)
  if (content.includes('\r\n') && content.includes('\n') && !content.includes('\r\n\n')) {
    console.warn(`⚠  Mixed line endings detected in: ${relPath}`);
  }
  console.log(`✔  ${relPath}`);
}

console.log('Validating prompt files...');
REQUIRED_PROMPTS.forEach(check);

if (hasErrors) {
  console.error('\nValidation failed. Fix the issues above before building.');
  process.exit(1);
}

console.log('\nAll prompt files are valid. Proceeding with build.');
