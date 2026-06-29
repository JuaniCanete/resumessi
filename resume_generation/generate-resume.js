#!/usr/bin/env node

/**
 * resumessi — AI Resume Generator
 * 
 * Uses an AI model to parse raw resume input and generate resume_generation/resume-data.json.
 * 
 * Usage:
 *   node generate-resume.js                          # interactive prompt
 *   node generate-resume.js --input my-data.txt      # read from file
 *   cat my-data.txt | node generate-resume.js        # pipe input
 * 
 * Config:
 *   Reads AI_API_KEY and AI_MODEL from ../config.js
 *   Falls back to ../.env if config.js is not found
 */

const fs = require('fs');
const path = require('path');
// Resume generation prompt is loaded dynamically from prompts/resume-generation.txt
let RESUME_PROMPT = null;

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config.js');
const ENV_FILE = path.join(ROOT, '.env');
const OUTPUT_FILE = path.join(ROOT, 'resume_generation', 'resume-data.json');

// ── Config Loading ─────────────────────────────────────────────────
function loadConfig() {
    // Try config.js first
    try {
        const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const match = content.match(/AI_API_KEY:\s*'([^']+)'/);
        const modelMatch = content.match(/AI_MODEL:\s*'([^']+)'/);
        if (match && match[1] && match[1] !== 'your_api_key_here') {
            return {
                apiKey: match[1],
                model: modelMatch ? modelMatch[1] : 'gemini-2.5-flash'
            };
        }
    } catch (e) {
        // Fall through to .env
    }

    // Fallback to .env
    try {
        const content = fs.readFileSync(ENV_FILE, 'utf-8');
        const lines = content.split('\n');
        let apiKey = '';
        let model = 'gemini-2.5-flash';
        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('AI_API_KEY=')) apiKey = line.split('=')[1].trim();
            if (line.startsWith('AI_MODEL=')) model = line.split('=')[1].trim();
        });
        if (apiKey && apiKey !== 'your_api_key_here') {
            return { apiKey, model };
        }
    } catch (e) {}

    return null;
}

// ── AI API Call ────────────────────────────────────────────────
async function callAI(apiKey, model, userInput) {
    // Load prompt dynamically on first call
    if (!RESUME_PROMPT) {
        const promptPath = path.join(__dirname, '..', 'prompts', 'resume-generation.txt');
        RESUME_PROMPT = fs.readFileSync(promptPath, 'utf-8');
    }
    const systemPrompt = RESUME_PROMPT;
    const prompt = systemPrompt + '\n\n=== RAW RESUME INPUT ===\n' + userInput;

    const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    let raw = data.candidates[0].content.parts[0].text;
    if (!raw || raw.trim().length === 0) {
        throw new Error('Empty response from AI API');
    }
    // Remove markdown code fences
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    // Try to find JSON object in the response (find first { and last })
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('No JSON object found in response: ' + raw.substring(0, 200));
    }
    raw = raw.substring(firstBrace, lastBrace + 1);
    // Clean up common issues
    raw = raw.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    try {
        return JSON.parse(raw);
    } catch (e) {
        // Try to fix escaped quotes
        raw = raw.replace(/\\(['"])/g, '$1');
        return JSON.parse(raw);
    }
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
    const config = loadConfig();
    if (!config) {
        console.error('No API key found. Run: node setup.js');
        process.exit(1);
    }

    let userInput = '';

    // Determine input source
    const args = process.argv.slice(2);

    if (args.includes('--input')) {
        const idx = args.indexOf('--input');
        const filePath = args[idx + 1];
        if (!filePath) {
            console.error('--input requires a file path');
            process.exit(1);
        }
        userInput = fs.readFileSync(path.resolve(filePath), 'utf-8');
        console.log('Reading from ' + filePath + ' (' + userInput.length + ' chars)');
    } else if (!process.stdin.isTTY) {
        // Piped input
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        userInput = Buffer.concat(chunks).toString('utf-8');
        console.log('Reading piped input (' + userInput.length + ' chars)');
    } else {
        // Interactive — read from prompt.txt
        const promptFile = path.join(__dirname, 'prompt.txt');
        if (fs.existsSync(promptFile)) {
            userInput = fs.readFileSync(promptFile, 'utf-8');
            console.log('Using prompt.txt (' + userInput.length + ' chars)');
            console.log('   Fill in your data in prompt.txt and re-run.');
            console.log('   Or pipe raw text: cat resume.txt | node generate-resume.js');
        } else {
            console.error('No input provided. Options:');
            console.error('   node generate-resume.js --input file.txt');
            console.error('   cat file.txt | node generate-resume.js');
            process.exit(1);
        }
    }

    console.log('Calling AI...');
    try {
        const result = await callAI(config.apiKey, config.model, userInput);
        
        // Write output
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
        console.log('Generated resume_generation/resume-data.json');
        console.log('   Name: ' + result.basics.name);
        console.log('   Roles: ' + result.experience.length);
        console.log('   Skills categories: ' + Object.keys(result.skills || {}).length);
        console.log('   Certs: ' + result.certifications.length);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();