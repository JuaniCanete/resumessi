#!/usr/bin/env node
/**
 * resumessi — Pre-flight Checks
 *
 * Health check run before the build: asserts that all required prompt source
 * files exist and are non-empty, and runs a mock-mode LLM eval smoke pass
 * (golden/schema integrity — NOT a quality gate) unless --skip-evals.
 * Fails fast with a clear error message.
 *
 * Usage: npm run preflight -- --skip-evals
 * Hook: automatically run via "prebuild" in package.json
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
	console.info(`✔  ${relPath}`);
}

const skipEvals = process.argv.includes('--skip-evals') || process.env.VALIDATE_SKIP_EVALS === '1';

console.info('Validating prompt files...');
REQUIRED_PROMPTS.forEach(check);

if (hasErrors) {
	console.error('\nValidation failed. Fix the issues above before building.');
	process.exit(1);
}

console.info('\nAll prompt files are valid.\n');

if (!skipEvals) {
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

		console.info('\nAll validations passed. Project is ready to build.');
	}

	runValidation().catch(error => {
		console.error('Validation error:', error);
		process.exit(1);
	});
} else {
	console.info('\nSkipping LLM evals (--skip-evals).');
	console.info('\nAll validations passed. Project is ready to build.');
}
