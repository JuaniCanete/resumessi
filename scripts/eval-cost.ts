import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface RunMetrics {
	promptType: string;
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
	estimatedCostUsd: number;
	latencyMs: number;
	provider: string;
	model: string;
	timestamp: string;
}

const METRICS_DIR = join(process.cwd(), '.eval-metrics');
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	'gpt-4o-mini': { input: 0.15 / 1e6, output: 0.6 / 1e6 },
	'gpt-4o': { input: 2.5 / 1e6, output: 10.0 / 1e6 },
	'gpt-4.1': { input: 2.0 / 1e6, output: 8.0 / 1e6 },
	'claude-3-haiku': { input: 0.25 / 1e6, output: 1.25 / 1e6 },
	'claude-3-sonnet': { input: 3.0 / 1e6, output: 15.0 / 1e6 },
	'gemini-1.5-flash': { input: 0.075 / 1e6, output: 0.3 / 1e6 },
	'gemini-1.5-pro': { input: 1.25 / 1e6, output: 5.0 / 1e6 },
	'command-r-plus': { input: 0.5 / 1e6, output: 1.5 / 1e6 },
	'mistral-large': { input: 2.0 / 1e6, output: 6.0 / 1e6 },
	'llama-3.1-70b': { input: 0.59 / 1e6, output: 0.79 / 1e6 },
};

function estimateCost(
	provider: string,
	model: string,
	usage: { promptTokens: number; completionTokens: number }
): number {
	const key = model.toLowerCase();
	const pricing =
		MODEL_PRICING[key] || MODEL_PRICING[Object.keys(MODEL_PRICING).find(k => key.includes(k)) || 'gpt-4o-mini'];
	return usage.promptTokens * pricing.input + usage.completionTokens * pricing.output;
}

export function trackRun(
	promptType: string,
	runResult: {
		usage: { promptTokens: number; completionTokens: number; totalTokens: number };
		latencyMs: number;
		provider: string;
		model: string;
		mode: string;
	}
): RunMetrics {
	const cost = estimateCost(runResult.provider, runResult.model, {
		promptTokens: runResult.usage.promptTokens,
		completionTokens: runResult.usage.completionTokens,
	});

	const metrics: RunMetrics = {
		promptType,
		totalTokens: runResult.usage.totalTokens,
		promptTokens: runResult.usage.promptTokens,
		completionTokens: runResult.usage.completionTokens,
		estimatedCostUsd: cost,
		latencyMs: runResult.latencyMs,
		provider: runResult.provider,
		model: runResult.model,
		timestamp: new Date().toISOString(),
	};

	// Persist to file
	if (!existsSync(METRICS_DIR)) {
		mkdirSync(METRICS_DIR, { recursive: true });
	}

	const dateStr = new Date().toISOString().split('T')[0];
	const filePath = join(METRICS_DIR, `metrics-${dateStr}.jsonl`);
	writeFileSync(filePath, `${JSON.stringify(metrics)}\n`, { flag: 'a' });

	return metrics;
}

export function loadMetrics(days: number = 7): RunMetrics[] {
	if (!existsSync(METRICS_DIR)) return [];

	const files = readdirSync(METRICS_DIR)
		.filter(f => f.startsWith('metrics-') && f.endsWith('.jsonl'))
		.sort()
		.slice(-days);

	const metrics: RunMetrics[] = [];

	for (const file of files) {
		const content = readFileSync(join(METRICS_DIR, file), 'utf-8');
		for (const line of content.trim().split('\n')) {
			if (line) {
				try {
					metrics.push(JSON.parse(line));
				} catch {
					// Ignore invalid JSON lines
				}
			}
		}
	}

	return metrics;
}

export function generateCostReport(metrics: RunMetrics[]): string {
	if (metrics.length === 0) {
		return '  No metrics recorded';
	}

	const totalCost = metrics.reduce((sum, m) => sum + m.estimatedCostUsd, 0);
	const totalTokens = metrics.reduce((sum, m) => sum + m.totalTokens, 0);
	const avgLatency = metrics.reduce((sum, m) => sum + m.latencyMs, 0) / metrics.length;

	const byPrompt: Record<string, { count: number; cost: number; tokens: number; avgLatency: number }> = {};

	for (const m of metrics) {
		if (!byPrompt[m.promptType]) {
			byPrompt[m.promptType] = { count: 0, cost: 0, tokens: 0, avgLatency: 0 };
		}
		byPrompt[m.promptType].count++;
		byPrompt[m.promptType].cost += m.estimatedCostUsd;
		byPrompt[m.promptType].tokens += m.totalTokens;
		byPrompt[m.promptType].avgLatency += m.latencyMs;
	}

	for (const key of Object.keys(byPrompt)) {
		byPrompt[key].avgLatency /= byPrompt[key].count;
	}

	let report = '';
	report += `  Total Runs: ${metrics.length}\n`;
	report += `  Total Cost: $${totalCost.toFixed(4)}\n`;
	report += `  Total Tokens: ${totalTokens.toLocaleString()}\n`;
	report += `  Avg Latency: ${avgLatency.toFixed(0)}ms\n\n`;
	report += '  By Prompt Type:\n';

	for (const [prompt, data] of Object.entries(byPrompt)) {
		report += `    ${prompt}: ${data.count} runs, $${data.cost.toFixed(4)}, ${data.tokens.toLocaleString()} tokens, ${data.avgLatency.toFixed(0)}ms avg\n`;
	}

	return report;
}

export function printCostReport(days: number = 7): void {
	const metrics = loadMetrics(days);
	console.log('\n📊 Cost/Latency Report (Last 7 Days)');
	console.log('═══════════════════════════════════════');
	console.log(generateCostReport(metrics));
}
