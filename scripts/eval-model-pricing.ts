/**
 * Single source of truth for model pricing.
 * Only includes models documented in .env.example (Cohere, Mistral, Gemini, Groq).
 * Prices are per 1M tokens in USD.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	'command-a-reasoning-08-2025': { input: 0.5 / 1e6, output: 1.5 / 1e6 }, // Cohere
	'codestral-2508': { input: 0.2 / 1e6, output: 0.6 / 1e6 }, // Mistral
	'gemini-3.6-flash': { input: 0.075 / 1e6, output: 0.3 / 1e6 }, // Gemini
	'openai/gpt-oss-120b': { input: 0.15 / 1e6, output: 0.6 / 1e6 }, // Groq
};

/**
 * Estimate cost for a model run based on token usage.
 * Falls back to cheapest known model if pricing unknown.
 */
export function estimateCost(
	provider: string,
	model: string,
	usage: { promptTokens: number; completionTokens: number }
): number {
	const key = model.toLowerCase();
	const pricing = MODEL_PRICING[key] || MODEL_PRICING['gemini-3.6-flash'];
	return usage.promptTokens * pricing.input + usage.completionTokens * pricing.output;
}
