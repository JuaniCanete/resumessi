import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInference } from '../src/router.js';
import * as process from 'node:process';

export type EvalMode = 'mock' | 'live' | 'record';

export interface EvalRunResult<T> {
	output: T;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	latencyMs: number;
	provider: string;
	model: string;
	mode: EvalMode;
}

export interface InferenceOptions {
	temperature?: number;
	maxTokens?: number;
	topP?: number;
}

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

const MAX_COST_PER_RUN_USD = 0.5;
const MAX_TOTAL_TOKENS = 50000;

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

function getMockOutput<T>(expected: T, _schemaName: string): T {
	return JSON.parse(JSON.stringify(expected));
}

function buildEnv(): Record<string, string | undefined> {
	return {
		COHERE_API_KEY: process.env.COHERE_API_KEY,
		COHERE_MODEL: process.env.COHERE_MODEL,
		MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
		MISTRAL_MODEL: process.env.MISTRAL_MODEL,
		GEMINI_API_KEY: process.env.GEMINI_API_KEY,
		GEMINI_MODEL: process.env.GEMINI_MODEL,
		GROQ_API_KEY: process.env.GROQ_API_KEY,
		GROQ_MODEL: process.env.GROQ_MODEL,
		AI_INFERENCE_ORDER: process.env.AI_INFERENCE_ORDER,
	};
}

export async function runEvalInference<T>(
	systemPrompt: string,
	userPrompt: string,
	schema: { parse: (data: unknown) => T },
	expected: T,
	options: InferenceOptions = {},
	mode: EvalMode = 'mock'
): Promise<EvalRunResult<T>> {
	const startTime = Date.now();

	if (mode === 'mock') {
		const mockOutput = getMockOutput<T>(expected, schema.constructor.name);
		return {
			output: mockOutput,
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
			latencyMs: 10,
			provider: 'mock',
			model: 'mock',
			mode: 'mock',
		};
	}

	if (mode === 'record') {
		console.info('  📝 Recording mode: will save actual output as new golden');
	}

	const env = buildEnv();
	const result = await runInference(
		systemPrompt,
		userPrompt,
		{
			temperature: options.temperature ?? 0,
			max_tokens: options.maxTokens ?? 4000,
			top_p: options.topP ?? 1,
		},
		env,
		undefined,
		undefined,
		undefined,
		'eval'
	);

	const latencyMs = Date.now() - startTime;
	const promptTokens = result.usage?.prompt_tokens || 0;
	const completionTokens = result.usage?.completion_tokens || 0;
	const totalTokens = promptTokens + completionTokens;

	if (totalTokens > MAX_TOTAL_TOKENS) {
		throw new Error(`Token budget exceeded: ${totalTokens} > ${MAX_TOTAL_TOKENS}`);
	}

	const cost = estimateCost(result.provider || 'unknown', result.model || 'unknown', {
		promptTokens,
		completionTokens,
	});
	if (cost > MAX_COST_PER_RUN_USD) {
		throw new Error(`Cost limit exceeded: $${cost.toFixed(4)} > $${MAX_COST_PER_RUN_USD}`);
	}

	let parsedOutput: T;
	try {
		parsedOutput = schema.parse(JSON.parse(result.text));
	} catch (e) {
		throw new Error(`Failed to parse output as JSON: ${(e as Error).message}\nOutput: ${result.text.slice(0, 500)}`);
	}

	if (mode === 'record') {
		const recordDir = join(process.cwd(), 'tests', 'evals', 'goldens', 'recorded');
		if (!existsSync(recordDir)) {
			mkdirSync(recordDir, { recursive: true });
		}
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `recorded-${timestamp}.json`;
		writeFileSync(
			join(recordDir, filename),
			JSON.stringify(
				{
					systemPrompt,
					userPrompt,
					output: parsedOutput,
					usage: { promptTokens, completionTokens, totalTokens },
					latencyMs,
					provider: result.provider,
					model: result.model,
					cost,
				},
				null,
				2
			)
		);
		console.info(`  💾 Recorded to ${filename}`);
	}

	return {
		output: parsedOutput,
		usage: { promptTokens, completionTokens, totalTokens },
		latencyMs,
		provider: result.provider || 'unknown',
		model: result.model || 'unknown',
		mode,
	};
}

export function getSystemPrompt(promptType: string): string {
	const promptMap: Record<string, string> = {
		'ats-scan': readFileSync(join(process.cwd(), 'src', 'prompts', 'ats-scan.txt'), 'utf-8'),
		'extraction': readFileSync(join(process.cwd(), 'src', 'prompts', 'extraction.txt'), 'utf-8'),
		'polish': readFileSync(join(process.cwd(), 'src', 'prompts', 'polish.txt'), 'utf-8'),
		'cover-letter': readFileSync(join(process.cwd(), 'src', 'prompts', 'cover-letter.txt'), 'utf-8'),
		'clean-jd': readFileSync(join(process.cwd(), 'src', 'prompts', 'clean-jd.txt'), 'utf-8'),
		'scraper-parameters': readFileSync(join(process.cwd(), 'src', 'prompts', 'scraper-parameters.txt'), 'utf-8'),
		'scraper-summarize': readFileSync(join(process.cwd(), 'src', 'prompts', 'scraper-summarize.txt'), 'utf-8'),
		'resume-generation': readFileSync(join(process.cwd(), 'src', 'prompts', 'resume-generation.txt'), 'utf-8'),
	};
	return promptMap[promptType] || '';
}
