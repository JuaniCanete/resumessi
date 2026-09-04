import type {
	ProviderName,
	ProviderResponse,
	ProviderMap,
	ProviderConfigResult,
	BuildRequestResult,
	InferenceParams,
	TokenUsage,
	CohereRequestBody,
	MistralRequestBody,
	GeminiRequestBody,
	GroqRequestBody,
} from './types/provider';

interface ApiErrorResponse {
	error?: string | ApiErrorInner;
	[key: string]: unknown;
}

interface ApiErrorInner {
	message?: string;
	[key: string]: unknown;
}

const PROVIDER_TIMEOUTS: Record<string, number> = {
	cohere: 30000,
	mistral: 30000,
	gemini: 30000,
	groq: 30000,
};

function getProviderTimeout(provider: string): number {
	return PROVIDER_TIMEOUTS[provider] || 30000;
}

async function fetchWithTimeout(url: string, options: globalThis.RequestInit, timeoutMs: number): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		return response;
	} catch (err: unknown) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw (new Error(`Request timed out after ${timeoutMs}ms`), { cause: err });
		}
		throw err;
	} finally {
		clearTimeout(timeoutId);
	}
}

async function callProvider(
	provider: ProviderName,
	system: string,
	prompt: string,
	model: string,
	key: string,
	params: InferenceParams = {},
	scope: string = 'generic',
	correlationId?: string
): Promise<ProviderResponse> {
	const { url, headers, body } = buildRequest(provider, system, prompt, model, key, params);
	const timeout = getProviderTimeout(provider);
	const startTime = Date.now();

	const cid = correlationId || crypto.randomUUID().slice(0, 8);

	let httpStatus = 0;
	let ok = false;
	let errorMsg: string | undefined;
	let parsedUsage: TokenUsage | null = null;

	try {
		const response = await fetchWithTimeout(
			url,
			{
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			},
			timeout
		);

		httpStatus = response.status;
		ok = response.ok;

		if (!response.ok) {
			let errMsg = `HTTP ${response.status}`;
			try {
				const errData = (await response.json()) as ApiErrorResponse;
				const errInner = errData.error as ApiErrorInner | undefined;
				errMsg =
					(typeof errInner?.message === 'string' ? errInner.message : undefined) ||
					(typeof errData.error === 'string' ? errData.error : undefined) ||
					JSON.stringify(errData) ||
					errMsg;
			} catch {
				/* ignore */
			}
			httpStatus = response.status;
			throw { status: response.status, error: errMsg, provider };
		}

		const data = await response.json();
		const parsed = parseResponse(provider, data);
		parsedUsage = parsed.usage;

		return { ...parsed, provider, model, status: response.status };
	} catch (err: unknown) {
		ok = false;
		if (err instanceof Error) {
			errorMsg = err.message;
		} else if (typeof err === 'object' && err !== null) {
			errorMsg = (err as { error?: string }).error || JSON.stringify(err);
		} else {
			errorMsg = String(err);
		}
		throw { status: httpStatus, provider, error: errorMsg };
	} finally {
		const latencyMs = Date.now() - startTime;
		const record: Record<string, unknown> = {
			timestamp: new Date().toISOString(),
			correlationId: cid,
			scope,
			provider,
			model,
			httpStatus,
			latencyMs,
			usage: parsedUsage || { promptTokens: undefined, completionTokens: undefined, totalTokens: undefined },
			ok,
		};
		if (!ok && errorMsg) {
			record.error = errorMsg;
		}
		console.info(JSON.stringify(record));
	}
}

function buildRequest(
	provider: ProviderName,
	system: string,
	prompt: string,
	model: string,
	key: string,
	params: InferenceParams = {}
): BuildRequestResult {
	// API parameter names must match provider specs (snake_case)

	const { temperature, maxTokens, topP } = params;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };

	if (provider === 'cohere') {
		headers['Authorization'] = `Bearer ${key}`;
		const messages: Array<{ role: string; content: string }> = [];
		if (system) {
			messages.push({ role: 'system', content: system });
		}
		messages.push({ role: 'user', content: prompt });

		const body: CohereRequestBody = {
			model,
			messages,
		};

		if (temperature !== undefined) body.temperature = temperature;
		if (maxTokens !== undefined) body.max_tokens = maxTokens;
		// Cohere v2 chat API does not support top_p parameter
		// if (topP !== undefined) body.top_p = topP;

		return {
			url: 'https://api.cohere.com/v2/chat',
			headers,
			body,
		};
	}

	if (provider === 'gemini') {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
		const body: GeminiRequestBody = {
			contents: [{ parts: [{ text: prompt }] }],
		};

		if (system) {
			body.systemInstruction = { parts: [{ text: system }] };
		}

		const generationConfig: GeminiRequestBody['generationConfig'] = {};
		if (temperature !== undefined) generationConfig.temperature = temperature;
		if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;
		if (topP !== undefined) generationConfig.topP = topP;
		if (Object.keys(generationConfig).length > 0) {
			body.generationConfig = generationConfig;
		}

		return { url, headers, body };
	}

	if (provider === 'mistral' || provider === 'groq') {
		headers['Authorization'] = `Bearer ${key}`;
		const messages: Array<{ role: string; content: string }> = [];
		if (system) {
			messages.push({ role: 'system', content: system });
		}
		messages.push({ role: 'user', content: prompt });

		const body: MistralRequestBody | GroqRequestBody = {
			model,
			messages,
		};

		if (temperature !== undefined) body.temperature = temperature;
		if (maxTokens !== undefined) body.max_tokens = maxTokens;
		// For Mistral/Groq: when temperature=0 (greedy sampling), top_p must be 1 or omitted
		const temp = temperature as number | undefined;
		if (topP !== undefined && (temp === undefined || temp > 0)) {
			body.top_p = topP;
		} else if (topP !== undefined && temp === 0) {
			// Greedy sampling requires top_p = 1
			body.top_p = 1;
		}

		const baseUrl =
			provider === 'mistral'
				? 'https://api.mistral.ai/v1/chat/completions'
				: 'https://api.groq.com/openai/v1/chat/completions';

		return { url: baseUrl, headers, body };
	}

	throw new Error(`Unknown provider: ${provider}`);
}

function parseResponse(provider: ProviderName, data: unknown): { text: string; usage: TokenUsage } {
	let text = '';
	const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

	try {
		if (provider === 'cohere') {
			const msgData = data as CohereResponse;
			if (msgData?.message?.content) {
				if (Array.isArray(msgData.message.content)) {
					text = msgData.message.content.map(c => c.text || '').join('');
				} else {
					text = msgData.message.content as string;
				}
			}
			text = text || msgData?.text || '';
			if (msgData?.meta?.tokens) {
				usage.promptTokens = msgData.meta.tokens.input_tokens || 0;
				usage.completionTokens = msgData.meta.tokens.output_tokens || 0;
			} else if (msgData?.usage) {
				usage.promptTokens = msgData.usage.prompt_tokens || 0;
				usage.completionTokens = msgData.usage.completion_tokens || 0;
			}
		} else if (provider === 'gemini') {
			const geminiData = data as GeminiResponse;
			const parts = geminiData?.candidates?.[0]?.content?.parts || [];
			text = parts.map(p => p.text || '').join('');
			// Gemini sometimes wraps JSON in markdown fences — extract clean JSON using brace-matching
			text = extractJsonFromText(text);
			if (geminiData?.usageMetadata) {
				usage.promptTokens = geminiData.usageMetadata.promptTokenCount || 0;
				usage.completionTokens = geminiData.usageMetadata.candidatesTokenCount || 0;
			}
		} else if (provider === 'mistral' || provider === 'groq') {
			const openaiData = data as OpenAIResponse;
			text = openaiData?.choices?.[0]?.message?.content || '';
			if (openaiData?.usage) {
				usage.promptTokens = openaiData.usage.prompt_tokens || 0;
				usage.completionTokens = openaiData.usage.completion_tokens || 0;
			}
		}
	} catch (err) {
		console.error('parseResponse error for', provider, err);
		throw err;
	}

	usage.totalTokens = usage.promptTokens + usage.completionTokens;
	return { text, usage };
}

interface CohereResponse {
	message?: { content?: Array<{ text?: string }> | string };
	text?: string;
	meta?: { tokens?: { input_tokens?: number; output_tokens?: number } };
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface GeminiResponse {
	candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

interface OpenAIResponse {
	choices?: Array<{ message?: { content?: string } }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function extractJsonFromText(text: string): string {
	const cleaned = text
		.replace(/```json/g, '')
		.replace(/```/g, '')
		.trim();

	const startIndex = cleaned.indexOf('{');
	if (startIndex === -1) {
		return cleaned;
	}

	let depth = 0;
	let inString = false;
	let escape = false;

	for (let i = startIndex; i < cleaned.length; i++) {
		const char = cleaned[i];

		if (escape) {
			escape = false;
			continue;
		}

		if (char === '\\' && inString) {
			escape = true;
			continue;
		}

		if (char === '"') {
			inString = !inString;
			continue;
		}

		if (inString) {
			continue;
		}

		if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth--;
			if (depth === 0) {
				return cleaned.slice(startIndex, i + 1);
			}
		}
	}

	return cleaned.slice(startIndex);
}

/**
 * Repair unquoted JSON keys (e.g. `{name: "test"}`) without ever touching
 * bare identifiers followed by ':' inside string values. Tracks inString /
 * escape state iteratively, mirroring extractJsonFromText.
 */
function repairUnquotedJsonKeys(text: string): string {
	let result = '';
	let inString = false;
	let escape = false;
	let i = 0;

	while (i < text.length) {
		const char = text[i];

		if (escape) {
			result += char;
			escape = false;
			i++;
			continue;
		}

		if (char === '\\' && inString) {
			result += char;
			escape = true;
			i++;
			continue;
		}

		if (char === '"') {
			result += char;
			inString = !inString;
			i++;
			continue;
		}

		// Inside a string value — copy verbatim, never repair.
		if (inString) {
			result += char;
			i++;
			continue;
		}

		// Outside a string: detect an unquoted key `identifier :` and quote it.
		if (/[a-zA-Z_]/.test(char)) {
			let j = i;
			while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) {
				j++;
			}
			// Skip whitespace between the identifier and the ':'.
			let k = j;
			while (k < text.length && /\s/.test(text[k])) {
				k++;
			}
			if (k < text.length && text[k] === ':') {
				result += `"${text.slice(i, j)}"${text.slice(j, k + 1)}`;
				i = k + 1;
				continue;
			}
		}

		result += char;
		i++;
	}

	return result;
}

function safeJsonParse(text: string): { data: unknown; error: string | null } {
	const cleaned = extractJsonFromText(text);

	try {
		const parsed = JSON.parse(cleaned);
		return { data: parsed, error: null };
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Invalid JSON';

		// Try to fix common JSON issues
		let repaired = cleaned;

		// Remove trailing commas
		repaired = repaired.replace(/,\s*([}\]])/g, '$1');

		// Fix unquoted keys by scanning character-by-character so bare identifiers
		// followed by ':' inside string values are never touched. This mirrors the
		// inString/escape tracking used by extractJsonFromText.
		repaired = repairUnquotedJsonKeys(repaired);

		try {
			const parsed = JSON.parse(repaired);
			return { data: parsed, error: null };
		} catch {
			return { data: null, error: errorMsg };
		}
	}
}

function getProviderConfig(env: Record<string, string | undefined>): ProviderConfigResult {
	const order = (env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq')
		.split(',')
		.map(s => s.trim().toLowerCase())
		.filter(Boolean);

	const providerMap: ProviderMap = {};

	const cohereKey = env.COHERE_API_KEY || '';
	const cohereModel = env.COHERE_MODEL || 'command-a-reasoning-08-2025';
	if (cohereKey) {
		providerMap.cohere = { key: cohereKey, model: cohereModel };
	}

	const mistralKey = env.MISTRAL_API_KEY || '';
	const mistralModel = env.MISTRAL_MODEL || 'codestral-latest';
	if (mistralKey) {
		providerMap.mistral = { key: mistralKey, model: mistralModel };
	}

	const geminiKey = env.GEMINI_API_KEY || '';
	const geminiModel = env.GEMINI_MODEL || 'gemini-3.8-flash';
	if (geminiKey) {
		providerMap.gemini = { key: geminiKey, model: geminiModel };
	}

	const groqKey = env.GROQ_API_KEY || '';
	const groqModel = env.GROQ_MODEL || 'openai/gpt-oss-120b';
	if (groqKey) {
		providerMap.groq = { key: groqKey, model: groqModel };
	}

	const configured = order.filter(p => providerMap[p]);

	return {
		order: configured.length > 0 ? configured : order,
		providerMap,
		configured,
	};
}

function validateInferenceRequest(body: unknown): string[] {
	const errors: string[] = [];

	if (typeof body !== 'object' || body === null) {
		errors.push('body must be an object');
		return errors;
	}

	const b = body as Record<string, unknown>;

	if (typeof b.system !== 'string' || b.system.trim().length < 1) {
		errors.push('system must be a non-empty string');
	}
	if (typeof b.prompt !== 'string' || b.prompt.trim().length < 1) {
		errors.push('prompt must be a non-empty string');
	}
	if (
		b.provider !== undefined &&
		b.provider !== null &&
		(typeof b.provider !== 'string' || b.provider.trim().length < 1)
	) {
		errors.push('provider must be a non-empty string when provided');
	}
	if (
		b.scope !== undefined &&
		(typeof b.scope !== 'string' || !['ats', 'polish', 'generate', 'generic'].includes(b.scope.trim().toLowerCase()))
	) {
		errors.push('scope must be one of: ats, polish, generate, generic');
	}
	if (b.temperature !== undefined && (typeof b.temperature !== 'number' || b.temperature < 0 || b.temperature > 2)) {
		errors.push('temperature must be a number between 0.0 and 2.0');
	}
	if (b.max_tokens !== undefined && (!Number.isInteger(b.max_tokens) || (b.max_tokens as number) <= 0)) {
		errors.push('max_tokens must be a positive integer');
	}
	// Also accept camelCase maxTokens
	if (b.maxTokens !== undefined && (!Number.isInteger(b.maxTokens) || (b.maxTokens as number) <= 0)) {
		errors.push('max_tokens must be a positive integer');
	}
	if (b.top_p !== undefined && (typeof b.top_p !== 'number' || b.top_p < 0 || b.top_p > 1)) {
		errors.push('top_p must be a number between 0.0 and 1.0');
	}
	// Also accept camelCase topP
	if (b.topP !== undefined && (typeof b.topP !== 'number' || b.topP < 0 || b.topP > 1)) {
		errors.push('top_p must be a number between 0.0 and 1.0');
	}

	const allowedKeys = new Set([
		'system',
		'prompt',
		'provider',
		'scope',
		'temperature',
		'max_tokens',
		'top_p',
		'maxTokens',
		'topP',
	]);
	for (const key of Object.keys(body)) {
		if (!allowedKeys.has(key)) {
			errors.push(`Unexpected field: ${key}`);
		}
	}

	return errors;
}

export {
	buildRequest,
	parseResponse,
	callProvider,
	getProviderTimeout,
	getProviderConfig,
	validateInferenceRequest,
	extractJsonFromText,
	safeJsonParse,
};
