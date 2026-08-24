import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BaselineEntry {
	goldenId: string;
	schemaValid: boolean;
	semanticMetrics: {
		faithfulness: number;
		hallucination: number;
		relevance: number;
		completeness: number;
	};
	timestamp: string;
	runMetrics: {
		latencyMs: number;
		totalTokens: number;
	};
}

export interface Baseline {
	version: string;
	promptType: string;
	promptHash: string;
	entries: Record<string, BaselineEntry>;
	createdAt: string;
}

export interface RegressionReport {
	promptType: string;
	currentVersion: string;
	baselineVersion: string;
	regressions: RegressionItem[];
	improvements: RegressionItem[];
}

export interface RegressionItem {
	goldenId: string;
	metric: string;
	baselineScore: number;
	currentScore: number;
	delta: number;
	severity: 'critical' | 'warning';
}

const BASELINE_DIR = join(process.cwd(), '.eval-baselines');
const REGRESSION_THRESHOLD = 0.1; // 10% drop triggers warning
const CRITICAL_THRESHOLD = 0.2; // 20% drop triggers critical

function getPromptHash(promptType: string): string {
	// Simple hash based on prompt file content
	const crypto = require('node:crypto');
	const fs = require('node:fs');
	const path = require('node:path');
	const promptPath = path.join(process.cwd(), 'src', 'prompts', `${promptType}.txt`);
	if (!fs.existsSync(promptPath)) return 'unknown';
	const content = fs.readFileSync(promptPath, 'utf-8');
	return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function saveBaseline(
	version: string,
	promptType: string,
	results: Array<{
		goldenId: string;
		schemaValid: boolean;
		semanticMetrics: {
			faithfulness: { score: number };
			hallucination: { score: number };
			relevance: { score: number };
			completeness: { score: number };
		};
		runResult: {
			latencyMs: number;
			usage: { totalTokens: number };
		};
	}>
): void {
	if (!existsSync(BASELINE_DIR)) {
		mkdirSync(BASELINE_DIR, { recursive: true });
	}

	const baseline: Baseline = {
		version,
		promptType,
		promptHash: getPromptHash(promptType),
		entries: {},
		createdAt: new Date().toISOString(),
	};

	for (const result of results) {
		baseline.entries[result.goldenId] = {
			goldenId: result.goldenId,
			schemaValid: result.schemaValid,
			semanticMetrics: {
				faithfulness: result.semanticMetrics.faithfulness.score,
				hallucination: result.semanticMetrics.hallucination.score,
				relevance: result.semanticMetrics.relevance.score,
				completeness: result.semanticMetrics.completeness.score,
			},
			timestamp: new Date().toISOString(),
			runMetrics: {
				latencyMs: result.runResult.latencyMs,
				totalTokens: result.runResult.usage.totalTokens,
			},
		};
	}

	const filePath = join(BASELINE_DIR, `${promptType}-${version}.json`);
	writeFileSync(filePath, JSON.stringify(baseline, null, 2));
	console.log(`  💾 Saved baseline: ${filePath}`);
}

export function loadBaseline(version: string, promptType: string): Baseline | null {
	const filePath = join(BASELINE_DIR, `${promptType}-${version}.json`);

	if (!existsSync(filePath)) {
		console.warn(`  ⚠ Baseline not found: ${filePath}`);
		return null;
	}

	try {
		return JSON.parse(readFileSync(filePath, 'utf-8')) as Baseline;
	} catch (error) {
		console.error(`  ✗ Failed to load baseline: ${(error as Error).message}`);
		return null;
	}
}

export function listBaselines(promptType?: string): string[] {
	if (!existsSync(BASELINE_DIR)) return [];

	const files = require('node:fs')
		.readdirSync(BASELINE_DIR)
		.filter((f: string) => f.endsWith('.json'))
		.map((f: string) => f.replace('.json', ''));

	if (promptType) {
		return files.filter((f: string) => f.startsWith(`${promptType}-`));
	}

	return files;
}

export function compareAgainstBaseline(
	promptType: string,
	baselineVersion: string,
	goldenId: string,
	current: {
		schemaValid: boolean;
		semanticMetrics: {
			faithfulness: { score: number };
			hallucination: { score: number };
			relevance: { score: number };
			completeness: { score: number };
		};
	}
): RegressionReport | null {
	const baseline = loadBaseline(baselineVersion, promptType);
	if (!baseline) return null;

	const baselineEntry = baseline.entries[goldenId];
	if (!baselineEntry) {
		return {
			promptType,
			currentVersion: 'current',
			baselineVersion,
			regressions: [],
			improvements: [],
		};
	}

	const regressions: RegressionItem[] = [];
	const improvements: RegressionItem[] = [];

	const metrics = [
		{ name: 'schemaValid', baseline: baselineEntry.schemaValid ? 1 : 0, current: current.schemaValid ? 1 : 0 },
		{
			name: 'faithfulness',
			baseline: baselineEntry.semanticMetrics.faithfulness,
			current: current.semanticMetrics.faithfulness.score,
		},
		{
			name: 'hallucination',
			baseline: baselineEntry.semanticMetrics.hallucination,
			current: current.semanticMetrics.hallucination.score,
		},
		{
			name: 'relevance',
			baseline: baselineEntry.semanticMetrics.relevance,
			current: current.semanticMetrics.relevance.score,
		},
		{
			name: 'completeness',
			baseline: baselineEntry.semanticMetrics.completeness,
			current: current.semanticMetrics.completeness.score,
		},
	];

	for (const metric of metrics) {
		const delta = metric.current - metric.baseline;

		if (delta <= -CRITICAL_THRESHOLD) {
			regressions.push({
				goldenId,
				metric: metric.name,
				baselineScore: metric.baseline,
				currentScore: metric.current,
				delta,
				severity: 'critical',
			});
		} else if (delta <= -REGRESSION_THRESHOLD) {
			regressions.push({
				goldenId,
				metric: metric.name,
				baselineScore: metric.baseline,
				currentScore: metric.current,
				delta,
				severity: 'warning',
			});
		} else if (delta >= REGRESSION_THRESHOLD) {
			improvements.push({
				goldenId,
				metric: metric.name,
				baselineScore: metric.baseline,
				currentScore: metric.current,
				delta,
				severity: 'warning', // reuse type
			});
		}
	}

	return {
		promptType,
		currentVersion: 'current',
		baselineVersion,
		regressions,
		improvements,
	};
}
