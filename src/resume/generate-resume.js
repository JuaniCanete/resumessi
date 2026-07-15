#!/usr/bin/env node

/**
 * resumessi — AI Resume Generator
 * 
 * Uses an AI model to parse raw resume input and generate src/resume/output/resume-data.json.
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

const ROOT = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT, '.env');
const OUTPUT_FILE = path.join(ROOT, 'src', 'resume', 'output', 'resume-data.json');

// ── Config Loading ─────────────────────────────────────────────────
function loadConfig() {
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

// ── Identity Extraction from Input ────────────────────────────────
function extractActualName(inputText) {
    // Try to find "Full Name:" line in structured input (prompt.txt)
    const nameMatch = inputText.match(/Full Name:\s*(.+)/);
    if (nameMatch && nameMatch[1]) {
        const name = nameMatch[1].replace(/^[#\s]+/, '').trim();
        if (name && name.length > 1) return name;
    }
    // Fallback: use the first 1-3 words of the first non-empty, non-comment line
    const lines = inputText.split('\n').filter(l => l.trim());
    for (const line of lines) {
        const clean = line.replace(/^[#\s-]+/, '').trim();
        if (clean && clean.length > 2 && clean.length < 60) {
            const words = clean.split(/\s+/).slice(0, 3).join(' ');
            if (words.length > 3) return words;
        }
    }
    return null;
}

function isPlaceholderName(name) {
    if (!name) return true;
    const placeholders = ['john doe', 'jane doe', 'alex johnson', 'your name', 'candidate', 'todo'];
    const lower = name.toLowerCase().trim();
    for (const p of placeholders) {
        if (lower === p || lower.includes(p)) return true;
    }
    return false;
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
        const exampleFile = path.join(__dirname, 'prompt.txt.example');
        if (!fs.existsSync(promptFile) && fs.existsSync(exampleFile)) {
            fs.copyFileSync(exampleFile, promptFile);
            console.log('Created src/resume/prompt.txt from prompt.txt.example');
        }
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
        
        // ── Identity Validation (Post-processing Guard) ───────────────
        // Mirrors ATS eval approach: extract expected name from input, compare with
        // AI output, and FAIL the request if there's a mismatch.
        const actualName = extractActualName(userInput);
        const outputName = result.basics && result.basics.name;
        
        if (outputName) {
            // Check 1: Is the output a known hallucinated/placeholder name?
            if (isPlaceholderName(outputName)) {
                console.error('❌ AI returned hallucinated name "' + outputName + '". Aborting.');
                process.exit(1);
            }
            
            // Check 2: If we know the expected name from input, does the AI output match it?
            if (actualName) {
                const outputLower = outputName.toLowerCase().trim();
                const actualLower = actualName.toLowerCase().trim();
                // Check if expected name appears within the AI output (handles variations)
                if (!outputLower.includes(actualLower) && !actualLower.includes(outputLower)) {
                    // Word-overlap check: do any significant words overlap?
                    const actualWords = actualLower.split(/\s+/).filter(function(w) { return w.length > 2; });
                    const outputWords = outputLower.split(/\s+/);
                    const hasOverlap = actualWords.some(function(w) {
                        return outputWords.indexOf(w) > -1;
                    });
                    if (!hasOverlap) {
                        console.error('❌ AI generated resume for wrong person: "' + outputName + '" instead of "' + actualName + '". Aborting.');
                        process.exit(1);
                    }
                }
            }
        } else if (actualName) {
            // AI returned empty name but we found one in the input
            console.warn('⚠️  AI returned empty name. Using expected name "' + actualName + '".');
            result.basics.name = actualName;
        }
        
        // Write output
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
        console.log('Generated src/resume/output/resume-data.json');
        console.log('   Name: ' + result.basics.name);
        console.log('   Roles: ' + (result.experience ? result.experience.length : 0));
        console.log('   Skills categories: ' + Object.keys(result.skills || {}).length);
        console.log('   Certs: ' + (result.certifications ? result.certifications.length : 0));
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();