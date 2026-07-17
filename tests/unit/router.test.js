/**
 * tests/unit/router.test.js
 *
 * Unit tests for src/router.js.
 * Mocks callProvider to test router iteration logic without real API calls.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Mock providers.js before requiring router
const mockCallProvider = async (provider) => {
  return { text: `Response from ${provider}`, provider, usage: { prompt_tokens: 10, completion_tokens: 20 } };
};

const mockGetProviderConfig = (env) => {
  const order = (env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const providerMap = {};
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

// Mock the providers module
require.cache[require.resolve('../../src/providers.js')] = {
  id: require.resolve('../../src/providers.js'),
  filename: require.resolve('../../src/providers.js'),
  loaded: true,
  exports: {
    callProvider: mockCallProvider,
    getProviderConfig: mockGetProviderConfig,
  },
};

const { runInference, runPolish } = require('../../src/router.js');

// ── runInference ──────────────────────────────────────────────────────────────

test('runInference returns first successful provider', async () => {
  const env = {
    AI_INFERENCE_ORDER: 'gemini,cohere',
    GEMINI_API_KEY: 'gem-key',
    GEMINI_MODEL: 'gemini-2.5-flash',
    COHERE_API_KEY: 'cohere-key',
    COHERE_MODEL: 'command-r-plus',
  };

  const result = await runInference('sys', 'prompt', {}, env);
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

  const result = await runInference('sys', 'prompt', {}, env);
  assert.equal(result.provider, 'gemini');
});

test('runInference falls back to next provider on failure', async () => {
  let callCount = 0;
  const failingCallProvider = async (provider) => {
    callCount++;
    if (provider === 'gemini') {
      throw { status: 500, error: 'Server error', provider: 'gemini' };
    }
    return { text: `Response from ${provider}`, provider, usage: {} };
  };

  // Override mock for this test
  require.cache[require.resolve('../../src/providers.js')].exports.callProvider = failingCallProvider;

  const env = {
    AI_INFERENCE_ORDER: 'gemini,cohere',
    GEMINI_API_KEY: 'gem-key',
    COHERE_API_KEY: 'cohere-key',
  };

  const result = await runInference('sys', 'prompt', {}, env);
  assert.equal(result.provider, 'cohere');
  assert.equal(callCount, 2);
});

test('runInference throws when all providers fail', async () => {
  const failingCallProvider = async () => {
    throw { status: 500, error: 'Server error', provider: 'test' };
  };

  require.cache[require.resolve('../../src/providers.js')].exports.callProvider = failingCallProvider;

  const env = {
    AI_INFERENCE_ORDER: 'gemini,cohere',
    GEMINI_API_KEY: 'gem-key',
    COHERE_API_KEY: 'cohere-key',
  };

  await assert.rejects(
    () => runInference('sys', 'prompt', {}, env),
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
    () => runInference('sys', 'prompt', {}, env),
    { message: 'No providers configured. Set at least one *_API_KEY in .env.' }
  );
});

test('runInference passes params to callProvider', async () => {
  const mockCall = async (_provider, _system, _prompt, _model, _key, params) => {
    assert.equal(params.temperature, 0.5);
    assert.equal(params.max_tokens, 100);
    return { text: 'ok', provider: 'mock', usage: {} };
  };

  require.cache[require.resolve('../../src/providers.js')].exports.callProvider = mockCall;

  const env = {
    AI_INFERENCE_ORDER: 'gemini',
    GEMINI_API_KEY: 'gem-key',
  };

  await runInference('sys', 'prompt', { temperature: 0.5, max_tokens: 100 }, env);
});

// ── runPolish ─────────────────────────────────────────────────────────────────

test('runPolish builds prompt with resume data and calls inference', async () => {
  const mockCall = async (provider, _system, _prompt) => {
    assert.ok(_prompt.includes('RESUME DATA TO POLISH'));
    assert.ok(_prompt.includes('"name": "Test"'));
    assert.equal(_system, 'You are a resume polishing assistant.');
    return { text: '{"basics": {}}', provider, usage: {} };
  };

  require.cache[require.resolve('../../src/providers.js')].exports.callProvider = mockCall;

  const env = {
    AI_INFERENCE_ORDER: 'gemini',
    GEMINI_API_KEY: 'gem-key',
  };

  const result = await runPolish({ basics: { name: 'Test' } }, 'Polish this resume', env);
  assert.equal(result.text, '{"basics": {}}');
});
