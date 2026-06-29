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
// Placeholder for injected resume generation prompt
const RESUME_PROMPT = "# resumessi — Resume Generation Prompt\n# \n# This prompt can be used in two ways:\n# 1. Manually: Fill in your info and give this file to an AI assistant to generate resume-data.json\n# 2. Automatically: Run `node generate-resume.js` to use AI to parse raw input\n#\n# IMPORTANT: This generates the resume_generation/resume-data.json file that cv_tool.html reads at startup.\n# The HTML is not going to show any data until resume_generation/resume-data.json is generated — everything comes from the JSON.\n#\n# ================================================================================\n# SECTION 1 — SYSTEM INSTRUCTION (for AI consumption)\n# ================================================================================\n#\n# You are a resume data extraction and formatting assistant. Your task is to parse\n# the raw user input below and output a valid JSON object matching the schema at:\n# Use the schema in resume_generation/resume-data.json as the source of truth\n#\n# RULES:\n# - Output ONLY valid JSON, no markdown, no explanation\n# - Use the exact same structure as resume_generation/resume-data.json\n# - For experience bullets, preserve HTML formatting like <strong> for emphasis\n# - Expert skills get \"expert\": true, others get false\n# - If any section is missing data, use empty arrays or null values\n#\n# ================================================================================\n# SECTION 2 — USER INPUT (fill in your information below)\n# ================================================================================\n#\n# --- Personal Info ---\n# Full Name:\n#\n# Professional Title / Headline:\n#\n# Email:\n#\n# Phone:\n#\n# Location (City, Province/State, Country):\n#\n# LinkedIn URL:\n#\n# GitHub URL:\n#\n# Profile Photo (filename in resumessi/ folder):\n#   photo.jpg\n#\n# --- Professional Summary (2-4 sentences) ---\n#\n#\n# --- Work Experience (most recent first. For each role:) ---\n# Job Title:\n# Company:\n# Start – End Date:\n# Bullet points (each on a new line starting with -):\n#   - \n#\n# --- Skills (grouped by category. Mark experts with *EXERT*) ---\n# Category Name:\n#   *EXPERT* Skill Name, Skill Name, Skill Name\n#\n# --- Tech Stack ---\n#\n# --- Languages ---\n# Language — Level\n#\n# --- Education ---\n# Degree:\n# Institution:\n# Year:\n#\n# --- Certifications ---\n# Title:\n# Issuer:\n# Date:\n# Duration (optional):\n# Verification URL:\n#\n# --- Tech Talks ---\n# Title:\n# Event:\n# URL:\n#\n# ================================================================================\n# SECTION 3 — OUTPUT SCHEMA REFERENCE\n# ================================================================================\n#\n# The expected output is a JSON object with these top-level keys:\n#   basics       - { name, title, email, phone, location, photo, linkedin, github }\n#   summary      - string\n#   experience   - [{ title, company, date, bullets[] }]\n#   skills       - { \"Category\": [{ name, expert }] }\n#   techStack - string (HTML allowed)\n#   languages    - [{ name, level }]\n#   education    - [{ degree, institution, year }]\n#   talks        - [{ title, event, url }]\n#   certifications - [{ title, issuer, date, duration, url }]\n#\n# ================================================================================\n# END OF PROMPT\n# ================================================================================";

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