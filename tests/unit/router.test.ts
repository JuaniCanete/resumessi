/**
 * tests/unit/router.test.ts
 *
 * Unit tests for src/router.ts.
 * Mocks callProvider/getProviderConfig via injected deps to test router
 * iteration logic without real API calls.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInference, runPolish, type CallProviderFn, type InferenceParams } from '../../src/router';

const mockCallProvider: CallProviderFn = (_provider, _system, _prompt, _model, _key, _params?, _scope?) =>
	Promise.resolve({
		text: `Response from ${_provider}`,
		provider: _provider,
		model: _model,
		status: 200,
		usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
	});

const mockGetProviderConfig = (env: Record<string, string | undefined>) => {
	const order = (env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq')
		.split(',')
		.map(s => s.trim().toLowerCase())
		.filter(Boolean);

	const providerMap: Record<string, { key: string; model: string } | undefined> = {};
	const providers = ['cohere', 'mistral', 'gemini', 'groq'];
	for (const p of providers) {
		const keyEnv = `${p.toUpperCase()}_API_KEY`;
		const modelEnv = `${p.toUpperCase()}_MODEL`;
		const key = env[keyEnv] || '';
		const model = env[modelEnv] || 'default-model';
		if (key) {
			providerMap[p] = { key, model };
		}
	}

	const configured = order.filter(p => providerMap[p]);

	return {
		order: configured,
		providerMap,
		configured,
	};
};

test('runInference returns first successful provider', async () => {
	const env = {
		AI_INFERENCE_ORDER: 'gemini,cohere',
		GEMINI_API_KEY: 'gem-key',
		GEMINI_MODEL: 'gemini-3.8-flash',
		COHERE_API_KEY: 'cohere-key',
		COHERE_MODEL: 'command-a-reasoning-08-2025',
	};

	const result = await runInference('sys', 'prompt', {}, env, null, mockCallProvider, mockGetProviderConfig);
	assert.equal(result.provider, 'gemini');
	assert.equal(result.text, 'Response from gemini');
	assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
});

test('runInference skips providers without keys', async () => {
	const env = {
		AI_INFERENCE_ORDER: 'gemini,cohere,mistral',
		GEMINI_API_KEY: 'gem-key',
		COHERE_API_KEY: '',
		MISTRAL_API_KEY: 'mistral-key',
	};

	const result = await runInference('sys', 'prompt', {}, env, null, mockCallProvider, mockGetProviderConfig);
	assert.equal(result.provider, 'gemini');
});

test('runInference falls back to next provider on failure', async () => {
	let callCount = 0;
	const failingCallProvider: CallProviderFn = (_provider, _system, _prompt, _model) => {
		callCount++;
		if (_provider === 'gemini') {
			return Promise.reject({ status: 500, error: 'Server error', provider: 'gemini' });
		}
		return Promise.resolve({
			text: `Response from ${_provider}`,
			provider: _provider,
			model: _model,
			status: 200,
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		});
	};

	const env = {
		AI_INFERENCE_ORDER: 'gemini,cohere',
		GEMINI_API_KEY: 'gem-key',
		COHERE_API_KEY: 'cohere-key',
	};

	const result = await runInference('sys', 'prompt', {}, env, null, failingCallProvider, mockGetProviderConfig);
	assert.equal(result.provider, 'cohere');
	assert.equal(callCount, 2);
});

test('runInference throws when all providers fail', async () => {
	const failingCallProvider = (): Promise<never> =>
		Promise.reject({ status: 500, error: 'Server error', provider: 'test' });

	const env = {
		AI_INFERENCE_ORDER: 'gemini,cohere',
		GEMINI_API_KEY: 'gem-key',
		COHERE_API_KEY: 'cohere-key',
	};

	await assert.rejects(
		() => runInference('sys', 'prompt', {}, env, null, failingCallProvider, mockGetProviderConfig),
		(err: unknown) => {
			const msg = (err as Error).message;
			return msg.startsWith('All providers exhausted') && msg.includes('gemini') && msg.includes('cohere');
		}
	);
});

test('runInference throws when no providers configured', async () => {
	const env = {
		AI_INFERENCE_ORDER: 'gemini,cohere',
		GEMINI_API_KEY: '',
		COHERE_API_KEY: '',
	};

	await assert.rejects(() => runInference('sys', 'prompt', {}, env, null, mockCallProvider, mockGetProviderConfig), {
		message: 'No providers configured. Set at least one *_API_KEY in .env.',
	});
});

test('runInference passes params to callProvider', async () => {
	const mockCall: CallProviderFn = (
		_provider: string,
		_system: string,
		_prompt: string,
		_model: string,
		_key: string,
		params?: InferenceParams,
		_scope?: string
	) => {
		assert.equal(params?.temperature, 0.5);
		assert.equal(params?.maxTokens, 100);
		return Promise.resolve({
			text: 'ok',
			provider: 'cohere',
			model: _model,
			status: 200,
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		});
	};

	const env = {
		AI_INFERENCE_ORDER: 'gemini',
		GEMINI_API_KEY: 'gem-key',
	};

	await runInference('sys', 'prompt', { temperature: 0.5, maxTokens: 100 }, env, null, mockCall, mockGetProviderConfig);
});

test('runPolish builds prompt with resume data and calls inference', async () => {
	const mockCall: CallProviderFn = (
		_provider: string,
		_system: string,
		_prompt: string,
		_model: string,
		_key: string,
		_params?: InferenceParams,
		_scope?: string
	) => {
		assert.ok(_prompt.includes('RESUME DATA TO POLISH'));
		assert.ok(_prompt.includes('"name": "Test"'));
		assert.equal(_system, 'You are a resume polishing assistant.');
		return Promise.resolve({
			text: '{"basics": {}}',
			provider: 'cohere',
			model: _model,
			status: 200,
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		});
	};

	const env = {
		AI_INFERENCE_ORDER: 'gemini',
		GEMINI_API_KEY: 'gem-key',
	};

	const result = await runPolish(
		{ basics: { name: 'Test' } },
		'Polish this resume',
		env,
		null,
		mockCall,
		mockGetProviderConfig
	);
	assert.equal(result.text, '{"basics": {}}');
});
