import { z } from 'zod';
import { compareAgainstBaseline, RegressionReport } from './eval-baseline.js';
import { loadAllGoldens, listAvailablePromptTypes, Golden } from './eval-dataset.js';
import { runEvalInference, getSystemPrompt, EvalMode, EvalRunResult } from './eval-runner.js';
import { trackRun, generateCostReport, RunMetrics } from './eval-cost.js';
import {
	validateSchema,
	checkFaithfulness,
	checkHallucination,
	checkRelevance,
	checkCompleteness,
	SemanticMetrics,
} from './eval-metrics.js';

// ─── Zod Schemas for Output Validation ────────────────────────────────

const AtsOutputSchema = z.looseObject({
	overall_score: z.number().min(0).max(100),
	tier: z.enum(['STRONG_MATCH', 'GOOD_MATCH', 'MODERATE_MATCH', 'WEAK_MATCH']),
	breakdown: z.record(z.string(), z.unknown()).optional(),
	feedback: z.string().optional(),
	missingKeywords: z.array(z.string()).optional(),
});

const PolishOutputSchema = z.looseObject({
	basics: z.object({
		name: z.string().min(1),
		email: z.string().email(),
	}),
	experience: z
		.array(
			z.object({
				title: z.string().min(1),
				company: z.string().min(1),
			})
		)
		.optional(),
});

const CoverLetterOutputSchema = z.looseObject({
	text: z.string().min(50),
});

const ExtractionOutputSchema = z.looseObject({
	name: z.string().min(1),
	contact: z.record(z.string(), z.string()).optional(),
	experience: z
		.array(
			z.object({
				company: z.string().optional(),
				role: z.string().optional(),
				duration: z.string().optional(),
				highlights: z.array(z.string()).optional(),
			})
		)
		.optional(),
	skills: z.array(z.string()).optional(),
	education: z
		.array(
			z.object({
				institution: z.string().optional(),
				degree: z.string().optional(),
				year: z.string().optional(),
			})
		)
		.optional(),
});

const CleanJdOutputSchema = z.looseObject({
	cleanedText: z.string().min(10),
});

const ScraperParametersOutputSchema = z.looseObject({
	role: z.string().min(1),
	seniority: z.string().min(1),
	employmentType: z.string().min(1),
	region: z.string().optional(),
	country: z.string().optional(),
	currency: z.string().optional(),
	workType: z.string().optional(),
	datePosted: z.string().optional(),
	keywords: z.array(z.string()).optional(),
	customDomains: z.array(z.string()).optional(),
});

const ScraperSummarizeOutputSchema = z.looseObject({
	jobs: z
		.array(
			z.object({
				title: z.string().min(1),
				company: z.string().min(1),
				location: z.string().optional(),
				snippet: z.string().optional(),
				url: z.string().url().optional(),
			})
		)
		.min(1),
});

const ResumeGenerationSchema = z.looseObject({
	basics: z.object({
		name: z.string().min(1),
		email: z.string().email(),
		phone: z.string().optional(),
		location: z.string().optional(),
		summary: z.string().optional(),
	}),
	experience: z
		.array(
			z.object({
				title: z.string().min(1),
				company: z.string().min(1),
				location: z.string().optional(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
				description: z.string().optional(),
				highlights: z.array(z.string()).optional(),
			})
		)
		.optional(),
});

const SCHEMAS: Record<string, z.ZodSchema<unknown>> = {
	'ats-scan': AtsOutputSchema,
	'extraction': ExtractionOutputSchema,
	'polish': PolishOutputSchema,
	'cover-letter': CoverLetterOutputSchema,
	'clean-jd': CleanJdOutputSchema,
	'scraper-parameters': ScraperParametersOutputSchema,
	'scraper-summarize': ScraperSummarizeOutputSchema,
	'resume-generation': ResumeGenerationSchema,
};

const MAX_TOKENS_LIMITS: Record<string, number> = {
	'ats-scan': 2000,
	'polish': 3000,
	'cover-letter': 1500,
	'extraction': 4000,
	'clean-jd': 2000,
	'scraper-parameters': 1000,
	'scraper-summarize': 2000,
	'resume-generation': 5000,
};

const TEMPERATURES: Record<string, number> = {
	'ats-scan': 0,
	'polish': 0.3,
	'cover-letter': 0.3,
	'extraction': 0,
	'clean-jd': 0,
	'scraper-parameters': 0,
	'scraper-summarize': 0.3,
	'resume-generation': 0.3,
};

export interface EvalContext {
	mode: EvalMode;
	promptTypes: string[];
	baselineVersion?: string;
	failOnRegression: boolean;
	maxCostUsd: number;
	semanticThresholds: {
		faithfulness: number;
		hallucination: number;
		relevance: number;
		completeness: number;
	};
}

export interface GoldenEvalResult {
	goldenId: string;
	schemaValid: boolean;
	schemaErrors: string[];
	semanticMetrics: SemanticMetrics;
	runResult: EvalRunResult<unknown>;
	passed: boolean;
	regression?: RegressionReport | null;
}

async function evaluatePromptType(
	promptType: string,
	goldens: Golden<unknown, unknown>[],
	context: EvalContext
): Promise<{ results: GoldenEvalResult[]; runMetrics: RunMetrics[] }> {
	const schema = SCHEMAS[promptType];
	const maxTokens = MAX_TOKENS_LIMITS[promptType];
	const temperature = TEMPERATURES[promptType];
	const systemPrompt = getSystemPrompt(promptType);

	if (!schema) {
		console.warn(`  ⚠ No schema for ${promptType}, skipping`);
		return { results: [], runMetrics: [] };
	}

	if (!systemPrompt) {
		console.warn(`  ⚠ No system prompt for ${promptType}, skipping`);
		return { results: [], runMetrics: [] };
	}

	const results: GoldenEvalResult[] = [];
	const runMetrics: RunMetrics[] = [];

	console.info(`\n📋 Evaluating ${promptType} (${goldens.length} goldens)...`);

	for (const golden of goldens) {
		const { id, input, expected } = golden;

		// Build user prompt from input
		let userPrompt: string;
		if (typeof input === 'string') {
			userPrompt = input;
		} else if (input && typeof input === 'object' && 'jd' in input && 'resume' in input) {
			// Combined input for ats-scan and cover-letter
			const combined = input as { jd: string; resume: unknown };
			userPrompt = `JOB DESCRIPTION:\n${combined.jd}\n\nRESUME:\n${JSON.stringify(combined.resume, null, 2)}`;
		} else {
			userPrompt = JSON.stringify(input, null, 2);
		}

		try {
			// Run inference
			const runResult = await runEvalInference(
				systemPrompt,
				userPrompt,
				schema,
				expected,
				{ temperature, maxTokens },
				context.mode
			);

			// Track cost/latency
			const metrics = trackRun(promptType, runResult);
			runMetrics.push(metrics);

			// Validate schema
			const schemaResult = validateSchema(runResult.output, schema);

			// Compute semantic metrics
			const inputText = typeof input === 'string' ? input : JSON.stringify(input);
			const outputText = typeof runResult.output === 'string' ? runResult.output : JSON.stringify(runResult.output);

			const semanticMetrics: SemanticMetrics = {
				faithfulness: checkFaithfulness(inputText, outputText),
				hallucination: checkHallucination(inputText, outputText),
				relevance: checkRelevance(promptType, outputText),
				completeness: checkCompleteness(runResult.output, []),
			};

			// In mock mode, semantic metrics are not meaningful (mock returns expected output)
			// Only enforce schema validation in mock mode
			const thresholds = context.semanticThresholds;
			const semanticPassed =
				context.mode === 'mock'
					? true
					: semanticMetrics.faithfulness.score >= thresholds.faithfulness &&
						semanticMetrics.hallucination.score >= thresholds.hallucination &&
						semanticMetrics.relevance.score >= thresholds.relevance &&
						semanticMetrics.completeness.score >= thresholds.completeness;

			const passed = schemaResult.valid && semanticPassed;

			let regression: RegressionReport | null = null;
			if (context.baselineVersion) {
				regression = compareAgainstBaseline(promptType, context.baselineVersion, id, {
					schemaValid: schemaResult.valid,
					semanticMetrics,
				});
			}

			results.push({
				goldenId: id,
				schemaValid: schemaResult.valid,
				schemaErrors: schemaResult.errors,
				semanticMetrics,
				runResult,
				passed,
				regression,
			});

			const status = passed ? '✓' : '✗';
			console.info(
				`  ${status} ${id}: schema=${schemaResult.valid ? 'pass' : 'fail'} faithfulness=${semanticMetrics.faithfulness.score.toFixed(2)} hallucination=${semanticMetrics.hallucination.score.toFixed(2)} relevance=${semanticMetrics.relevance.score.toFixed(2)} completeness=${semanticMetrics.completeness.score.toFixed(2)}`
			);

			if (!schemaResult.valid) {
				console.error(`    Schema errors: ${schemaResult.errors.join(', ')}`);
			}
			if (regression && regression.regressions.length > 0) {
				for (const reg of regression.regressions) {
					console.error(
						`    🔴 REGRESSION: ${reg.metric} ${reg.baselineScore.toFixed(2)} → ${reg.currentScore.toFixed(2)} (${reg.severity})`
					);
				}
			}
		} catch (error) {
			console.error(`  ✗ ${id}: ERROR - ${(error as Error).message}`);
			results.push({
				goldenId: id,
				schemaValid: false,
				schemaErrors: [(error as Error).message],
				semanticMetrics: {
					faithfulness: { score: 0, details: [] },
					hallucination: { score: 0, details: [] },
					relevance: { score: 0, details: [] },
					completeness: { score: 0, details: [] },
				},
				runResult: {
					output: null,
					usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
					latencyMs: 0,
					provider: 'error',
					model: 'error',
					mode: context.mode,
				},
				passed: false,
			});
		}
	}

	return { results, runMetrics };
}

async function runEvals(context: EvalContext): Promise<boolean> {
	console.info('╔══════════════════════════════════════════════════════════════╗');
	console.info('║                   Running LLM Evals                          ║');
	console.info('╚══════════════════════════════════════════════════════════════╝');
	console.info(`Mode: ${context.mode}`);
	console.info(`Prompt types: ${context.promptTypes.join(', ')}`);
	if (context.baselineVersion) console.info(`Baseline: ${context.baselineVersion}`);
	let allPassed = true;
	let totalTests = 0;
	let passedTests = 0;
	const allRunMetrics: RunMetrics[] = [];

	// Load goldens
	const goldensMap = loadAllGoldens();
	const promptTypesToEval = context.promptTypes.length > 0 ? context.promptTypes : listAvailablePromptTypes();

	for (const promptType of promptTypesToEval) {
		const goldens = goldensMap.get(promptType) || [];

		if (goldens.length === 0) {
			console.info(`⚠ No goldens found for ${promptType}, skipping`);
			continue;
		}

		const { results, runMetrics } = await evaluatePromptType(promptType, goldens, context);
		allRunMetrics.push(...runMetrics);

		for (const result of results) {
			totalTests++;
			if (result.passed) passedTests++;
			else allPassed = false;

			if (result.regression && result.regression.regressions.some(r => r.severity === 'critical')) {
				allPassed = false;
			}
		}
	}

	// Print summary
	console.info('\n╔══════════════════════════════════════════════════════════════╗');
	console.info('║                        Summary                               ║');
	console.info('╚══════════════════════════════════════════════════════════════╝');
	console.info(`Total: ${totalTests} | Passed: ${passedTests} | Failed: ${totalTests - passedTests}`);

	if (allRunMetrics.length > 0) {
		console.info('\n💰 Cost/Latency Report:');
		console.info(generateCostReport(allRunMetrics));
	}

	if (!allPassed && context.failOnRegression) {
		console.error('\n✗ Evals failed (regression or quality threshold not met)');
	} else if (!allPassed) {
		console.warn('\n⚠ Evals completed with warnings');
	} else {
		console.info('\n✓ All evals passed!');
	}

	return allPassed;
}

export { runEvals };

// ─── CLI Entry Point ────────────────────────────────────────────────

function parseArgs(): EvalContext {
	const args = process.argv.slice(2);

	const context: EvalContext = {
		mode: 'mock',
		promptTypes: [],
		baselineVersion: undefined,
		failOnRegression: false,
		maxCostUsd: 0.5,
		semanticThresholds: {
			faithfulness: 0.8,
			hallucination: 0.8,
			relevance: 0.7,
			completeness: 0.8,
		},
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === '--mode' || arg === '-m') {
			context.mode = args[++i] as EvalMode;
		} else if (arg === '--prompt-type' || arg === '-p') {
			context.promptTypes.push(args[++i]);
		} else if (arg === '--baseline' || arg === '-b') {
			context.baselineVersion = args[++i];
		} else if (arg === '--fail-on-regression') {
			context.failOnRegression = true;
		} else if (arg === '--max-cost') {
			context.maxCostUsd = parseFloat(args[++i]);
		} else if (arg === '--help' || arg === '-h') {
			printHelp();
			process.exit(0);
		} else if (arg === 'list') {
			console.info('Available prompt types:');
			for (const pt of listAvailablePromptTypes()) {
				console.info(`  ${pt}`);
			}
			process.exit(0);
		}
	}

	return context;
}

function printHelp(): void {
	console.info(`
Usage: npm run evals -- [options]

Options:
  -m, --mode <mode>           Evaluation mode: mock (default), live, record
  -p, --prompt-type <type>    Filter to specific prompt type (can repeat)
  -b, --baseline <version>    Compare against baseline version
  --fail-on-regression        Exit with error on regression
  --max-cost <usd>            Max cost per run (default: 0.50)
  --help, -h                  Show this help
  list                        List available prompt types

Examples:
  npm run evals                        		# Fast mock evals
  npm run evals -- --mode live            	# Live inference
  npm run evals -- -p ats-scan -p polish  	# Specific prompts
  npm run evals -- --mode live --baseline v2.3.1 --fail-on-regression
`);
}

const context = parseArgs();

// Only auto-run when executed directly, not when imported
// Use require.main === module equivalent for ES modules
const isMainModule = typeof require !== 'undefined' && require.main === module;

if (isMainModule) {
	// Run evals and exit
	async function main(): Promise<void> {
		const success = await runEvals(context);
		process.exit(success ? 0 : 1);
	}

	main().catch(error => {
		console.error('Fatal error:', error);
		process.exit(1);
	});
}
