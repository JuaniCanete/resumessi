#!/usr/bin/env node
/**
 * resumessi — Pre-build Validation Script
 *
 * Asserts that all required prompt source files exist and are non-empty
 * before running the build. Fails fast with a clear error message.
 * Also runs LLM evaluation checks (unless --skip-evals).
 *
 * Usage:  tsx scripts/validate.ts [--skip-evals]
 * Hook:   automatically run via "prebuild" in package.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { runEvals, EvalContext } from './run-evals.js';

const ROOT = path.join(__dirname, '..');

const REQUIRED_PROMPTS = [
	'src/prompts/ats-scan.txt',
	'src/prompts/clean-jd.txt',
	'src/prompts/cover-letter.txt',
	'src/prompts/extraction.txt',
	'src/prompts/polish.txt',
	'src/prompts/resume-generation.txt',
	'src/prompts/scraper-parameters.txt',
	'src/prompts/scraper-summarize.txt',
];

let hasErrors = false;

function check(relPath: string): void {
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

const skipEvals = process.argv.includes('--skip-evals');

console.log('Validating prompt files...');
REQUIRED_PROMPTS.forEach(check);

if (hasErrors) {
	console.error('\nValidation failed. Fix the issues above before building.');
	process.exit(1);
}

console.log('\nAll prompt files are valid.');

if (!skipEvals) {
	console.log('\nRunning LLM evals...');
	const evalContext: EvalContext = {
		mode: 'mock',
		promptTypes: [],
		failOnRegression: false,
		maxCostUsd: 0.5,
		semanticThresholds: {
			faithfulness: 0.8,
			hallucination: 0.8,
			relevance: 0.7,
			completeness: 0.8,
		},
	};

	async function runValidation(): Promise<void> {
		if (!(await runEvals(evalContext))) {
			console.error('\nEvals failed.');
			process.exit(1);
		}

		console.log('\nAll validations passed. Project is ready to build.');
	}

	runValidation().catch(error => {
		console.error('Validation error:', error);
		process.exit(1);
	});
} else {
	console.log('\nSkipping LLM evals (--skip-evals).');
	console.log('\nAll validations passed. Project is ready to build.');
}
