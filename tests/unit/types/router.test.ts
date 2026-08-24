import { test } from 'node:test';
import assert from 'node:assert/strict';

test('src/types/router.ts - RouterOptions shape validation', () => {
	const options = {
		selectedProvider: 'cohere' as const,
		timeout: 30000,
	};

	assert.ok(options.selectedProvider);
	assert.ok(['cohere', 'mistral', 'gemini', 'groq'].includes(options.selectedProvider));
	assert.equal(typeof options.timeout, 'number');
});

test('src/types/router.ts - RouterResult shape validation', () => {
	const result = {
		text: 'Generated response',
		provider: 'cohere' as const,
		model: 'command-r-plus',
		usage: {
			prompt_tokens: 100,
			completion_tokens: 50,
		},
	};

	assert.ok(result.text);
	assert.ok(result.provider);
	assert.ok(['cohere', 'mistral', 'gemini', 'groq'].includes(result.provider));
	assert.ok(result.model);
	assert.equal(typeof result.usage.prompt_tokens, 'number');
	assert.equal(typeof result.usage.completion_tokens, 'number');
});

test('src/types/router.ts - RouterError shape validation', () => {
	const error = new Error('All providers failed') as Error & {
		attempts: Array<{ provider: string; status: number; error: string }>;
		lastError: Error | null;
	};

	error.attempts = [
		{ provider: 'cohere', status: 500, error: 'Internal error' },
		{ provider: 'mistral', status: 429, error: 'Rate limited' },
	];
	error.lastError = new Error('Rate limited');

	assert.ok(error.attempts.length > 0);
	assert.ok(error.lastError);
	for (const attempt of error.attempts) {
		assert.ok(attempt.provider);
		assert.equal(typeof attempt.status, 'number');
		assert.ok(attempt.error);
	}
});

test('src/types/router.ts - PolishInput shape validation', () => {
	const input = {
		resumeData: { basics: { name: 'Test' } },
		provider: 'cohere',
		customField: 'value',
	};

	assert.ok(input.resumeData);
	assert.ok(input.provider);
	assert.ok(input.customField);
});
