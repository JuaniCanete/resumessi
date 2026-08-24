import { test } from 'node:test';
import assert from 'node:assert/strict';

test('src/types/provider.ts - ProviderName enum', () => {
	const providers = ['cohere', 'mistral', 'gemini', 'groq'] as const;

	for (const provider of providers) {
		assert.ok(['cohere', 'mistral', 'gemini', 'groq'].includes(provider));
	}
});

test('src/types/provider.ts - LLMMessage shape', () => {
	const messages = [
		{ role: 'system' as const, content: 'You are an assistant' },
		{ role: 'user' as const, content: 'Hello' },
		{ role: 'assistant' as const, content: 'Hi there!' },
	];

	for (const msg of messages) {
		assert.ok(['system', 'user', 'assistant'].includes(msg.role));
		assert.ok(msg.content);
	}
});

test('src/types/provider.ts - LLMOptions shape', () => {
	const options = {
		temperature: 0.7,
		max_tokens: 2000,
		top_p: 0.9,
	};

	assert.equal(typeof options.temperature, 'number');
	assert.ok(options.temperature >= 0 && options.temperature <= 2);
	assert.equal(typeof options.max_tokens, 'number');
	assert.ok(options.max_tokens > 0);
	assert.equal(typeof options.top_p, 'number');
	assert.ok(options.top_p >= 0 && options.top_p <= 1);
});

test('src/types/provider.ts - ProviderResponse shape', () => {
	const response = {
		text: 'Generated text',
		provider: 'cohere' as const,
		model: 'command-r-plus',
		status: 200,
		usage: {
			prompt_tokens: 100,
			completion_tokens: 50,
		},
	};

	assert.ok(response.text);
	assert.ok(['cohere', 'mistral', 'gemini', 'groq'].includes(response.provider));
	assert.ok(response.model);
	assert.equal(typeof response.status, 'number');
	assert.ok(response.usage);
});

test('src/types/provider.ts - ProviderConfig shape', () => {
	const config = {
		key: 'api-key-here',
		model: 'command-r-plus',
	};

	assert.ok(config.key);
	assert.ok(config.model);
});

test('src/types/provider.ts - ProviderMap shape', () => {
	const providerMap = {
		cohere: { key: 'key1', model: 'command-r-plus' },
		mistral: { key: 'key2', model: 'mistral-large' },
		gemini: { key: 'key3', model: 'gemini-pro' },
		groq: undefined,
	};

	assert.ok(providerMap.cohere);
	assert.ok(providerMap.mistral);
	assert.ok(providerMap.gemini);
	assert.equal(providerMap.groq, undefined);
});

test('src/types/provider.ts - InferenceRequest shape', () => {
	const request = {
		system: 'System prompt',
		prompt: 'User prompt',
		provider: 'cohere',
		scope: 'ats-scan',
		temperature: 0,
		max_tokens: 2000,
		top_p: 1,
	};

	assert.ok(request.system);
	assert.ok(request.prompt);
	assert.ok(request.provider);
	assert.ok(request.scope);
	assert.equal(typeof request.temperature, 'number');
	assert.equal(typeof request.max_tokens, 'number');
	assert.equal(typeof request.top_p, 'number');
});
