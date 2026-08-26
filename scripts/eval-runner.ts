import * as process from 'node:process';
import { estimateCost } from './eval-model-pricing.js';
import { join } from 'node:path';
import { runInference } from '../src/router.js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';

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

const MAX_COST_PER_RUN_USD = 0.5;
const MAX_TOTAL_TOKENS = 50000;

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
