#!/usr/bin/env node

/**
 * resumessi — Build Script
 *
 * Optionally injects prompt files into HTML as build-time constants.
 * Prompts are currently loaded at runtime via /api/prompts/ — so this
 * script is a no-op unless {{ATS_SCAN_PROMPT}} is added to main.html.
 *
 * Usage:
 *   node build.js          # inject prompts if placeholders are present
 *   node build.js --check  # check if any placeholders need injection
 *
 * Source:
 *   - src/prompts/ats-scan.txt → public/main.html {{ATS_SCAN_PROMPT}} (optional)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const ATS_PROMPT_FILE = path.join(ROOT, 'src', 'prompts', 'ats-scan.txt');
const HTML_FILE = path.join(ROOT, 'public', 'main.html');

function readPromptBlock(filePath) {
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

function replaceLast(content, placeholder, replacement) {
    let idx = content.lastIndexOf(placeholder);
    if (idx === -1) return null;
    return content.substring(0, idx) + replacement + content.substring(idx + placeholder.length);
}

function injectPromptLast(filePath, placeholder, value) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const updated = replaceLast(content, placeholder, value);
    if (!updated) {
        console.log(`Skipping ${path.relative(ROOT, filePath)} — placeholder ${placeholder} not found (prompts loaded at runtime).`);
        return;
    }
    fs.writeFileSync(filePath, updated, 'utf-8');
    console.log(`Injected prompt into ${path.relative(ROOT, filePath)}`);
}

function main() {
    const args = process.argv.slice(2);
    const checkOnly = args.includes('--check');

    if (checkOnly) {
        const html = fs.readFileSync(HTML_FILE, 'utf-8');
        const hasHtmlPlaceholder = html.includes('{{ATS_SCAN_PROMPT}}');
        if (!hasHtmlPlaceholder) {
            console.log('No placeholders found — prompts loaded at runtime. Build check passed.');
            return;
        }
        console.log('Placeholders present. Use build.js without --check to inject.');
        return;
    }

    console.log('Reading prompt sources...');
    const atsPrompt = readPromptBlock(ATS_PROMPT_FILE);

    console.log('Injecting prompts...');
    injectPromptLast(HTML_FILE, '{{ATS_SCAN_PROMPT}}', atsPrompt);

    console.log('\nBuild completed successfully.');
    console.log('Next steps:');
    console.log('  1. Open public/main.html to verify ATS prompt changes');
}

main();