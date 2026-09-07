#!/usr/bin/env node

/**
 * resumessi — AI Resume Generator
 *
 * Uses an AI model to parse raw resume input and generate src/resume/output/resume-data.json.
 *
 * Usage:
 *   tsx generate-resume.ts                          # interactive prompt
 *   tsx generate-resume.ts --input my-data.txt      # read from file
 *   cat my-data.txt | tsx generate-resume.ts        # pipe input
 *
 * Config:
 *   Reads provider keys from .env via src/providers.ts
 *   Uses the same inference router as the web app
 */

import * as fs from 'fs';
import * as path from 'path';
import { getProviderConfig } from '../providers';
import { runInference } from '../router';
import type { ResumeData } from '../types/resume';

// Resume generation prompt is loaded dynamically from prompts/resume-generation.txt
const RESUME_PROMPT: string | null = null;

const ROOT = path.join(__dirname, '..', '..');
const OUTPUT_FILE = path.join(ROOT, 'src', 'resume', 'output', 'resume-data.json');

// ── Config Loading ─────────────────────────────────────────────────
function loadConfig(): { env: Record<string, string | undefined>; configured: string[] } {
	const env = loadEnvDirectly();

	const configured = getProviderConfig(env).configured;
	if (configured.length === 0) {
		console.error('No AI providers configured. Run: tsx setup.ts');
		process.exit(1);
	}

	return { env, configured };
}

function loadEnvDirectly(): Record<string, string | undefined> {
	const envPath = path.join(__dirname, '..', '..', '.env');
	const env: Record<string, string | undefined> = {};
	if (fs.existsSync(envPath)) {
		const content = fs.readFileSync(envPath, 'utf-8');
		content.split('\n').forEach(line => {
			line = line.trim();
			if (line.startsWith('#') || !line.includes('=')) return;
			const eqIndex = line.indexOf('=');
			const key = line.substring(0, eqIndex).trim();
			let value = line.substring(eqIndex + 1).trim();
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			env[key] = value;
		});
	}
	return env;
}

// ── AI API Call ──────────────────────────────────────────────────
async function callAI(system: string, prompt: string, env: Record<string, string | undefined>): Promise<ResumeData> {
	const result = await runInference(system, prompt, {}, env, null, null, null, 'generate');
	let raw = result.text;
	raw = raw
		.replace(/```json/gi, '')
		.replace(/```/g, '')
		.trim();

	const firstBrace = raw.indexOf('{');
	const lastBrace = raw.lastIndexOf('}');
	if (firstBrace === -1 || lastBrace === -1) {
		throw new Error(`No JSON object found in response: ${raw.substring(0, 200)}`);
	}
	raw = raw.substring(firstBrace, lastBrace + 1);
	raw = raw.replace(/,(\s*[}\]])/g, '$1');

	try {
		return JSON.parse(raw) as ResumeData;
	} catch {
		raw = raw.replace(/\\(['"])/g, '$1');
		return JSON.parse(raw) as ResumeData;
	}
}

// ── Identity Extraction from Input ────────────────────────────────
function extractActualName(inputText: string): string | null {
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

function isPlaceholderName(name: string): boolean {
	if (!name) return true;
	const placeholders = ['john doe', 'jane doe', 'alex johnson', 'your name', 'candidate', 'todo'];
	const lower = name.toLowerCase().trim();
	for (const p of placeholders) {
		if (lower === p || lower.includes(p)) return true;
	}
	return false;
}

// ── Main ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
	const { env } = loadConfig();

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
		console.info(`Reading from ${filePath} (${userInput.length} chars)`);
	} else if (!process.stdin.isTTY) {
		// Piped input
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
		userInput = Buffer.concat(chunks).toString('utf-8');
		console.info(`Reading piped input (${userInput.length} chars)`);
	} else {
		// Interactive — read from prompt.txt
		const promptFile = path.join(__dirname, 'prompt.txt');
		const exampleFile = path.join(__dirname, 'prompt.txt.example');
		if (!fs.existsSync(promptFile) && fs.existsSync(exampleFile)) {
			fs.copyFileSync(exampleFile, promptFile);
			console.info('Created src/resume/prompt.txt from prompt.txt.example');
		}
		if (fs.existsSync(promptFile)) {
			userInput = fs.readFileSync(promptFile, 'utf-8');
			console.info(`Using prompt.txt (${userInput.length} chars)`);
			console.info('   Fill in your data in prompt.txt and re-run.');
			console.info('   Or pipe raw text: cat resume.txt | tsx generate-resume.ts');
		} else {
			console.error('No input provided. Options:');
			console.error('   tsx generate-resume.ts --input file.txt');
			console.error('   cat file.txt | tsx generate-resume.ts');
			process.exit(1);
		}
	}

	console.info('Calling AI...');
	try {
		const result = await callAI(
			RESUME_PROMPT || '',
			`${RESUME_PROMPT || ''}\n\n=== RAW RESUME INPUT ===\n${userInput}`,
			env
		);

		// ── Identity Validation (Post-processing Guard) ───────────────
		const actualName = extractActualName(userInput);
		const outputName = result.basics && result.basics.name;

		if (outputName) {
			// Check 1: Is the output a known hallucinated/placeholder name?
			if (isPlaceholderName(outputName)) {
				console.error(`❌ AI returned hallucinated name "${outputName}". Aborting.`);
				process.exit(1);
			}

			// Check 2: If we know the expected name from input, does the AI output match it?
			if (actualName) {
				const outputLower = outputName.toLowerCase().trim();
				const actualLower = actualName.toLowerCase().trim();
				// Check if expected name appears within the AI output (handles variations)
				if (!outputLower.includes(actualLower) && !actualLower.includes(outputLower)) {
					// Word-overlap check: do any significant words overlap?
					const actualWords = actualLower.split(/\s+/).filter(w => w.length > 2);
					const outputWords = outputLower.split(/\s+/);
					const hasOverlap = actualWords.some(w => outputWords.indexOf(w) > -1);
					if (!hasOverlap) {
						console.error(
							`❌ AI generated resume for wrong person: "${outputName}" instead of "${actualName}". Aborting.`
						);
						process.exit(1);
					}
				}
			}
		} else if (actualName) {
			// AI returned empty name but we found one in the input
			console.warn(`⚠️ AI returned empty name. Using expected name "${actualName}".`);
			result.basics.name = actualName;
		}

		// Write output
		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
		console.info('Generated src/resume/output/resume-data.json');
		console.info(`   Name: ${result.basics.name}`);
		console.info(`   Roles: ${result.experience ? result.experience.length : 0}`);
		console.info(`   Skills categories: ${Object.keys(result.skills || {}).length}`);
		console.info(`   Certs: ${result.certifications ? result.certifications.length : 0}`);
	} catch (err: unknown) {
		console.error('Error:', (err as Error).message);
		process.exit(1);
	}
}

main();
