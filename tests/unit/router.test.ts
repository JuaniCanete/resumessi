/**
 * tests/unit/router.test.ts
 *
 * Unit tests for src/router.ts.
 * Mocks callProvider/getProviderConfig via injected deps to test router
 * iteration logic without real API calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInference, runPolish } from '../../src/router';

const mockCallProvider = async (_provider: string, _system: string, _prompt: string, _model: string, _key: string, _params?: Record<string, unknown>) => {
  return { text: `Response from ${_provider}`, provider: _provider as 'cohere' | 'mistral' | 'gemini' | 'groq', usage: { prompt_tokens: 10, completion_tokens: 20 } };
};

const mockGetProviderConfig = (env: Record<string, string | undefined>) => {
  const order = (env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const providerMap: Record<string, { key: string; model: string } | undefined> = {};
  const providers = ['cohere', 'mistral', 'gemini', 'groq'];
  for (const p of providers) {
    const keyEnv = p.toUpperCase() + '_API_KEY';
    const modelEnv = p.toUpperCase() + '_MODEL';
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
    GEMINI_MODEL: 'gemini-2.5-flash',
    COHERE_API_KEY: 'cohere-key',
    COHERE_MODEL: 'command-r-plus',
  };

  const result = await runInference('sys', 'prompt', {}, env, null, mockCallProvider, mockGetProviderConfig);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.text, 'Response from gemini');
  assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 20 });
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
  const failingCallProvider = async (_provider: string, _system: string, _prompt: string, _model: string, _key: string, _params?: Record<string, unknown>) => {
    callCount++;
    if (_provider === 'gemini') {
      throw { status: 500, error: 'Server error', provider: 'gemini' };
    }
    return { text: `Response from ${_provider}`, provider: _provider as 'cohere' | 'mistral' | 'gemini' | 'groq', usage: {} };
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
  const failingCallProvider = async () => {
    throw { status: 500, error: 'Server error', provider: 'test' };
  };

  const env = {
    AI_INFERENCE_ORDER: 'gemini,cohere',
    GEMINI_API_KEY: 'gem-key',
    COHERE_API_KEY: 'cohere-key',
  };

  await assert.rejects(
    () => runInference('sys', 'prompt', {}, env, null, failingCallProvider, mockGetProviderConfig),
    { message: 'All providers exhausted' }
  );
});

test('runInference throws when no providers configured', async () => {
  const env = {
    AI_INFERENCE_ORDER: 'gemini,cohere',
    GEMINI_API_KEY: '',
    COHERE_API_KEY: '',
  };

  await assert.rejects(
    () => runInference('sys', 'prompt', {}, env, null, mockCallProvider, mockGetProviderConfig),
    { message: 'No providers configured. Set at least one *_API_KEY in .env.' }
  );
});

test('runInference passes params to callProvider', async () => {
  const mockCall = async (_provider: string, _system: string, _prompt: string, _model: string, _key: string, params?: Record<string, unknown>) => {
    assert.equal(params?.temperature, 0.5);
    assert.equal(params?.max_tokens, 100);
    return { text: 'ok', provider: 'mock', usage: {} };
  };

  const env = {
    AI_INFERENCE_ORDER: 'gemini',
    GEMINI_API_KEY: 'gem-key',
  };

  await runInference('sys', 'prompt', { temperature: 0.5, max_tokens: 100 }, env, null, mockCall, mockGetProviderConfig);
});

test('runPolish builds prompt with resume data and calls inference', async () => {
  const mockCall = async (_provider: string, _system: string, _prompt: string) => {
    assert.ok(_prompt.includes('RESUME DATA TO POLISH'));
    assert.ok(_prompt.includes('"name": "Test"'));
    assert.equal(_system, 'You are a resume polishing assistant.');
    return { text: '{"basics": {}}', provider: 'mock', usage: {} };
  };

  const env = {
    AI_INFERENCE_ORDER: 'gemini',
    GEMINI_API_KEY: 'gem-key',
  };

  const result = await runPolish({ basics: { name: 'Test' } }, 'Polish this resume', env, null, mockCall, mockGetProviderConfig);
  assert.equal(result.text, '{"basics": {}}');
});
