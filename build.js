#!/usr/bin/env node

/**
 * resumessi — Build Script (Option A: Build-time Injection)
 * 
 * Reads prompt files and injects them into HTML/JS as string constants.
 * Solves CORS issues by eliminating fetch() at runtime for prompts.
 * 
 * Usage:
 *   node build.js             # inject all prompts
 *   node build.js --check     # only check if injection is up-to-date
 * 
 * Source of truth:
 *   - ATS_SCAN_PROMPT.md → main.html {{ATS_SCAN_PROMPT}}
 *   - resume_generation/prompt.txt → resume_generation/generate-resume.js {{RESUME_PROMPT}}
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const ATS_PROMPT_FILE = path.join(ROOT, 'ATS_SCAN_PROMPT.md');
const RESUME_PROMPT_FILE = path.join(ROOT, 'resume_generation', 'prompt.txt');
const HTML_FILE = path.join(ROOT, 'pages', 'main.html');
const GEN_JS_FILE = path.join(ROOT, 'resume_generation', 'generate-resume.js');

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
        console.error(`Placeholder ${placeholder} not found in ${filePath}`);
        process.exit(1);
    }
    fs.writeFileSync(filePath, updated, 'utf-8');
    console.log(`Injected prompt into ${path.relative(ROOT, filePath)}`);
}

function main() {
    const args = process.argv.slice(2);
    const checkOnly = args.includes('--check');

    if (checkOnly) {
        const atsSource = readPromptBlock(ATS_PROMPT_FILE);
        const resumeSource = readPromptBlock(RESUME_PROMPT_FILE);
        const html = fs.readFileSync(HTML_FILE, 'utf-8');
        const js = fs.readFileSync(GEN_JS_FILE, 'utf-8');
        const atsInHtml = html.includes('{{ATS_SCAN_PROMPT}}') ? html.split('{{ATS_SCAN_PROMPT}}')[1].split('\n')[0] : '';
        const resumeInJs = js.includes('{{RESUME_PROMPT}}') ? js.split('{{RESUME_PROMPT}}')[1].split('\n')[0] : '';
        if (!html.includes('{{ATS_SCAN_PROMPT}}') || !js.includes('{{RESUME_PROMPT}}')) {
            console.log('BUILD_OUTDATED');
            process.exit(1);
        }
        console.log('Placeholders present. Use build.js without --check to inject.');
        return;
    }

    console.log('Reading prompt sources...');
    const atsPrompt = readPromptBlock(ATS_PROMPT_FILE);
    const resumePrompt = readPromptBlock(RESUME_PROMPT_FILE);

    console.log('Injecting prompts...');
    injectPromptLast(GEN_JS_FILE, '{{RESUME_PROMPT}}', resumePrompt);
    injectPromptLast(HTML_FILE, '{{ATS_SCAN_PROMPT}}', atsPrompt);

    console.log('\nBuild completed successfully.');
    console.log('Next steps:');
    console.log('  1. Open main.html to verify ATS prompt changes');
    console.log('  2. Run node resume_generation/generate-resume.js to verify generation');
}

main();