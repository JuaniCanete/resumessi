const PROVIDER_TIMEOUTS = {
	cohere: 20000,
	mistral: 20000,
	gemini: 15000,
	groq: 15000,
};

function getProviderTimeout(provider) {
	return PROVIDER_TIMEOUTS[provider] || 20000;
}

async function fetchWithTimeout(url, options, timeoutMs) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		return response;
	} catch (err) {
		if (err.name === 'AbortError') {
			throw new Error(`Request timed out after ${timeoutMs}ms`);
		}
		throw err;
	} finally {
		clearTimeout(timeoutId);
	}
}

async function callProvider(provider, system, prompt, model, key, params = {}) {
	const { url, headers, body } = buildRequest(provider, system, prompt, model, key, params);
	const timeout = getProviderTimeout(provider);

	const response = await fetchWithTimeout(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	}, timeout);

	const data = await response.json();
	const parsed = parseResponse(provider, data);

	if (!response.ok) {
		const errorMsg = data?.error?.message || data?.error || `HTTP ${response.status}`;
		throw { status: response.status, error: errorMsg, provider };
	}

	return { ...parsed, provider, status: response.status };
}

function buildRequest(provider, system, prompt, model, key, params = {}) {
	const { temperature, max_tokens, top_p } = params;
	const headers = { 'Content-Type': 'application/json' };

	if (provider === 'cohere') {
		headers['Authorization'] = `Bearer ${key}`;
		const messages = [];
		if (system) {
			messages.push({ role: 'system', message: system });
		}
		messages.push({ role: 'user', message: prompt });

		const body = {
			model,
			messages,
		};

		if (system) {
			body.preamble_override = system;
		}

		if (temperature !== undefined) body.temperature = temperature;
		if (max_tokens !== undefined) body.max_tokens = max_tokens;
		if (top_p !== undefined) body.top_p = top_p;

		return {
			url: 'https://api.cohere.com/v2/chat',
			headers,
			body,
		};
	}

	if (provider === 'gemini') {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
		const body = {
			contents: [{ parts: [{ text: prompt }] }],
		};

		if (system) {
			body.systemInstruction = { parts: [{ text: system }] };
		}

		if (temperature !== undefined) body.temperature = temperature;
		if (max_tokens !== undefined) body.max_tokens = max_tokens;
		if (top_p !== undefined) body.top_p = top_p;

		return { url, headers, body };
	}

	if (provider === 'mistral' || provider === 'groq') {
		headers['Authorization'] = `Bearer ${key}`;
		const messages = [];
		if (system) {
			messages.push({ role: 'system', content: system });
		}
		messages.push({ role: 'user', content: prompt });

		const body = {
			model,
			messages,
		};

		if (temperature !== undefined) body.temperature = temperature;
		if (max_tokens !== undefined) body.max_tokens = max_tokens;
		if (top_p !== undefined) body.top_p = top_p;

		const baseUrl = provider === 'mistral'
			? 'https://api.mistral.ai/v1/chat/completions'
			: 'https://api.groq.com/openai/v1/chat/completions';

		return { url: baseUrl, headers, body };
	}

	throw new Error(`Unknown provider: ${provider}`);
}

function parseResponse(provider, data) {
	let text = '';
	let usage = {};

	try {
		if (provider === 'cohere') {
			text = data?.message?.message || data?.text || '';
			if (data?.meta?.tokens) {
				usage.prompt_tokens = data.meta.tokens.input_tokens;
				usage.completion_tokens = data.meta.tokens.output_tokens;
			} else if (data?.usage) {
				usage.prompt_tokens = data.usage.prompt_tokens;
				usage.completion_tokens = data.usage.completion_tokens;
			}
		} else if (provider === 'gemini') {
			const parts = data?.candidates?.[0]?.content?.parts || [];
			text = parts.map(p => p.text || '').join('');
			if (data?.usageMetadata) {
				usage.prompt_tokens = data.usageMetadata.promptTokenCount;
				usage.completion_tokens = data.usageMetadata.candidatesTokenCount;
			}
		} else if (provider === 'mistral' || provider === 'groq') {
			text = data?.choices?.[0]?.message?.content || '';
			if (data?.usage) {
				usage.prompt_tokens = data.usage.prompt_tokens;
				usage.completion_tokens = data.usage.completion_tokens;
			}
		}
	} catch (e) {
		text = '';
	}

	return { text, usage };
}

function getProviderConfig(env) {
	const order = (env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq')
		.split(',')
		.map(s => s.trim().toLowerCase())
		.filter(Boolean);

	const providerMap = {};

	const cohereKey = env.COHERE_API_KEY || '';
	const cohereModel = env.COHERE_MODEL || 'command-r-plus';
	if (cohereKey) {
		providerMap.cohere = { key: cohereKey, model: cohereModel };
	}

	const mistralKey = env.MISTRAL_API_KEY || '';
	const mistralModel = env.MISTRAL_MODEL || 'mistral-large-latest';
	if (mistralKey) {
		providerMap.mistral = { key: mistralKey, model: mistralModel };
	}

	const geminiKey = env.GEMINI_API_KEY || '';
	const geminiModel = env.GEMINI_MODEL || 'gemini-2.5-flash';
	if (geminiKey) {
		providerMap.gemini = { key: geminiKey, model: geminiModel };
	}

	const groqKey = env.GROQ_API_KEY || '';
	const groqModel = env.GROQ_MODEL || 'llama-3.3-70b-versatile';
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

function validateInferenceRequest(body) {
	const errors = [];

	if (typeof body.system !== 'string' || body.system.trim().length < 1) {
		errors.push('system must be a non-empty string');
	}
	if (typeof body.prompt !== 'string' || body.prompt.trim().length < 1) {
		errors.push('prompt must be a non-empty string');
	}
	if (body.provider !== undefined && (typeof body.provider !== 'string' || body.provider.trim().length < 1)) {
		errors.push('provider must be a non-empty string when provided');
	}
	if (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) {
		errors.push('temperature must be a number between 0.0 and 2.0');
	}
	if (body.max_tokens !== undefined && (!Number.isInteger(body.max_tokens) || body.max_tokens <= 0)) {
		errors.push('max_tokens must be a positive integer');
	}
	if (body.top_p !== undefined && (typeof body.top_p !== 'number' || body.top_p < 0 || body.top_p > 1)) {
		errors.push('top_p must be a number between 0.0 and 1.0');
	}

	const allowedKeys = new Set(['system', 'prompt', 'provider', 'temperature', 'max_tokens', 'top_p']);
	for (const key of Object.keys(body)) {
		if (!allowedKeys.has(key)) {
			errors.push(`Unexpected field: ${key}`);
		}
	}

	return errors;
}

module.exports = {
	buildRequest,
	parseResponse,
	callProvider,
	getProviderTimeout,
	getProviderConfig,
	validateInferenceRequest,
};

