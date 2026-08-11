/**
 * tests/unit/providers.test.ts
 *
 * Unit tests for src/providers.js.
 * - buildRequest: verify URL, headers, body for each provider
 * - parseResponse: verify text extraction and usage parsing
 * - getProviderTimeout: verify per-provider timeouts
 * - getProviderConfig: verify env parsing and provider map
 * - validateInferenceRequest: verify request validation rules
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequest,
  parseResponse,
  getProviderTimeout,
  getProviderConfig,
  validateInferenceRequest,
  extractJsonFromText,
  safeJsonParse,
} from '../../src/providers';

// ── buildRequest ──────────────────────────────────────────────────────────────

test('buildRequest creates valid Cohere request', () => {
   const result = buildRequest('cohere', 'You are helpful.', 'Hello', 'command-a-reasoning-08-2025-08-2024', 'key-123', { temperature: 0.5 });
   assert.equal(result.url, 'https://api.cohere.com/v2/chat');
   assert.equal(result.headers['Authorization'], 'Bearer key-123');
   assert.equal(result.headers['Content-Type'], 'application/json');
   assert.equal(result.body.model, 'command-a-reasoning-08-2025-08-2024');
   const msgs = result.body.messages as Array<{ role: string; content: string }>;
   assert.equal(msgs.length, 2);
   assert.equal(msgs[0].role, 'system');
   assert.equal(msgs[0].content, 'You are helpful.');
   assert.equal(msgs[1].role, 'user');
   assert.equal(msgs[1].content, 'Hello');
   assert.equal(result.body.preamble_override, undefined);
   assert.equal(result.body.temperature, 0.5);
});

test('buildRequest creates valid Cohere request without system', () => {
   const result = buildRequest('cohere', '', 'Hello', 'command-a-reasoning-08-2025-08-2024', 'key-123');
   const msgs = result.body.messages as Array<{ role: string; content?: string }>;
   assert.equal(msgs.length, 1);
   assert.equal(msgs[0].role, 'user');
   assert.equal(msgs[0].content, 'Hello');
});

test('buildRequest creates valid Gemini request', () => {
   const result = buildRequest('gemini', 'You are helpful.', 'Hello', 'gemini-3.6-flash', 'key-456', { max_tokens: 100 });
   assert.equal(result.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=key-456');
   assert.ok(!result.headers['Authorization']);
   const contents = result.body.contents as Array<{ parts: Array<{ text: string }> }>;
   assert.equal(contents[0].parts[0].text, 'Hello');
   const sysInst = result.body.systemInstruction as { parts: Array<{ text: string }> } | undefined;
   assert.equal(sysInst!.parts[0].text, 'You are helpful.');
   const gc = result.body.generationConfig as { maxOutputTokens: number };
   assert.equal(gc.maxOutputTokens, 100);
});

test('buildRequest creates valid Gemini request without system', () => {
   const result = buildRequest('gemini', '', 'Hello', 'gemini-3.6-flash', 'key-456');
   assert.equal(result.body.systemInstruction, undefined);
});

test('buildRequest creates valid Mistral request', () => {
   const result = buildRequest('mistral', 'You are helpful.', 'Hello', 'codestral-2508', 'key-789', { top_p: 0.9 });
   assert.equal(result.url, 'https://api.mistral.ai/v1/chat/completions');
   assert.equal(result.headers['Authorization'], 'Bearer key-789');
   assert.equal(result.body.model, 'codestral-2508');
   const msgs = result.body.messages as Array<{ role: string; content: string }>;
   assert.equal(msgs[0].role, 'system');
   assert.equal(msgs[0].content, 'You are helpful.');
   assert.equal(msgs[1].role, 'user');
   assert.equal(msgs[1].content, 'Hello');
   assert.equal(result.body.top_p, 0.9);
});

test('buildRequest creates valid Groq request', () => {
   const result = buildRequest('groq', 'You are helpful.', 'Hello', 'openai/gpt-oss-120b', 'key-abc');
   assert.equal(result.url, 'https://api.groq.com/openai/v1/chat/completions');
   assert.equal(result.headers['Authorization'], 'Bearer key-abc');
   assert.equal(result.body.model, 'openai/gpt-oss-120b');
   const msgs = result.body.messages as Array<{ role: string; content: string }>;
   assert.equal(msgs[0].role, 'system');
   assert.equal(msgs[0].content, 'You are helpful.');
   assert.equal(msgs[1].role, 'user');
   assert.equal(msgs[1].content, 'Hello');
});

test('buildRequest throws for unknown provider', () => {
   // @ts-expect-error testing invalid provider
   assert.throws(() => buildRequest('unknown', 'sys', 'prompt', 'model', 'key'), /Unknown provider/);
});

// ── parseResponse ─────────────────────────────────────────────────────────────

test('parseResponse extracts Cohere text', () => {
  const data = { message: { content: [{ text: 'Hello world' }] } };
  const result = parseResponse('cohere', data);
  assert.equal(result.text, 'Hello world');
  assert.deepEqual(result.usage, {});
});

test('parseResponse extracts Cohere text from fallback shape', () => {
  const data = { text: 'Hello world' };
  const result = parseResponse('cohere', data);
  assert.equal(result.text, 'Hello world');
});

test('parseResponse extracts Gemini text', () => {
  const data = { candidates: [{ content: { parts: [{ text: 'Hello world' }] } }] };
  const result = parseResponse('gemini', data);
  assert.equal(result.text, 'Hello world');
});

test('parseResponse extracts Gemini usage', () => {
  const data = {
    candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
  };
  const result = parseResponse('gemini', data);
  assert.equal(result.text, 'Hello');
  assert.equal(result.usage.prompt_tokens, 10);
  assert.equal(result.usage.completion_tokens, 20);
});

test('parseResponse extracts OpenAI-compatible text', () => {
  const data = { choices: [{ message: { content: 'Hello world' } }] };
  const result = parseResponse('mistral', data);
  assert.equal(result.text, 'Hello world');
});

test('parseResponse extracts OpenAI-compatible usage', () => {
  const data = {
    choices: [{ message: { content: 'Hello' } }],
    usage: { prompt_tokens: 5, completion_tokens: 10 },
  };
  const result = parseResponse('groq', data);
  assert.equal(result.text, 'Hello');
  assert.equal(result.usage.prompt_tokens, 5);
  assert.equal(result.usage.completion_tokens, 10);
});

test('parseResponse handles missing fields gracefully', () => {
   const result = parseResponse('cohere', {});
   assert.equal(result.text, '');
   assert.deepEqual(result.usage, {});
});

// ── getProviderTimeout ────────────────────────────────────────────────────────

test('getProviderTimeout returns default for known providers', () => {
  assert.equal(getProviderTimeout('cohere'), 30000);
  assert.equal(getProviderTimeout('mistral'), 30000);
  assert.equal(getProviderTimeout('gemini'), 30000);
  assert.equal(getProviderTimeout('groq'), 30000);
});

test('getProviderTimeout returns default for unknown provider', () => {
  assert.equal(getProviderTimeout('unknown'), 30000);
});

// ── getProviderConfig ─────────────────────────────────────────────────────────

test('getProviderConfig returns configured providers in order', () => {
  const env = {
    AI_INFERENCE_ORDER: 'gemini,cohere,mistral,groq',
    GEMINI_API_KEY: 'gem-key',
    COHERE_API_KEY: 'cohere-key',
    MISTRAL_API_KEY: '',
    GROQ_API_KEY: 'groq-key',
  };
  const result = getProviderConfig(env);
  assert.deepEqual(result.configured, ['gemini', 'cohere', 'groq']);
  assert.ok(result.providerMap.gemini);
  assert.ok(result.providerMap.cohere);
  assert.ok(result.providerMap.groq);
  assert.ok(!result.providerMap.mistral);
});

test('getProviderConfig uses default order when AI_INFERENCE_ORDER is unset', () => {
  const env = {
    COHERE_API_KEY: 'cohere-key',
    MISTRAL_API_KEY: 'mistral-key',
    GEMINI_API_KEY: 'gemini-key',
    GROQ_API_KEY: 'groq-key',
  };
  const result = getProviderConfig(env);
  assert.deepEqual(result.configured, ['cohere', 'mistral', 'gemini', 'groq']);
});

// ── validateInferenceRequest ──────────────────────────────────────────────────

test('validateInferenceRequest accepts valid request', () => {
  const errors = validateInferenceRequest({
    system: 'You are helpful.',
    prompt: 'Hello',
    temperature: 0.7,
    max_tokens: 100,
    top_p: 0.9,
  });
  assert.equal(errors.length, 0);
});

test('validateInferenceRequest rejects empty system', () => {
  const errors = validateInferenceRequest({ system: '   ', prompt: 'Hello' });
  assert.ok(errors.some(e => e.includes('system')));
});

test('validateInferenceRequest rejects empty prompt', () => {
  const errors = validateInferenceRequest({ system: 'sys', prompt: '' });
  assert.ok(errors.some(e => e.includes('prompt')));
});

test('validateInferenceRequest rejects invalid temperature', () => {
  const errors = validateInferenceRequest({ system: 'sys', prompt: 'Hello', temperature: 3.0 });
  assert.ok(errors.some(e => e.includes('temperature')));
});

test('validateInferenceRequest rejects invalid max_tokens', () => {
  const errors = validateInferenceRequest({ system: 'sys', prompt: 'Hello', max_tokens: -1 });
  assert.ok(errors.some(e => e.includes('max_tokens')));
});

test('validateInferenceRequest rejects invalid top_p', () => {
  const errors = validateInferenceRequest({ system: 'sys', prompt: 'Hello', top_p: 1.5 });
  assert.ok(errors.some(e => e.includes('top_p')));
});

test('validateInferenceRequest rejects extra fields', () => {
  const errors = validateInferenceRequest({ system: 'sys', prompt: 'Hello', extra: 'bad' });
  assert.ok(errors.some(e => e.includes('extra')));
});

// ── extractJsonFromText ─────────────────────────────────────────────────────────

test('extractJsonFromText strips markdown fences and extracts JSON', () => {
  const input = 'Here is the result:\n```json\n{"key": "value"}\n```\nThanks!';
  assert.equal(extractJsonFromText(input), '{"key": "value"}');
});

test('extractJsonFromText extracts JSON with preamble text', () => {
  const input = 'Sure, here you go: {"name": "test"} and more text after';
  assert.equal(extractJsonFromText(input), '{"name": "test"}');
});

test('extractJsonFromText handles plain JSON without fences', () => {
  const input = '{"a": 1, "b": 2}';
  assert.equal(extractJsonFromText(input), '{"a": 1, "b": 2}');
});

test('extractJsonFromText uses non-greedy match for multiple objects', () => {
  const input = 'first {"id": 1} then {"id": 2} end';
  const result = extractJsonFromText(input);
  assert.equal(result, '{"id": 1}');
});

test('extractJsonFromText returns empty string when no JSON found', () => {
  const input = 'No JSON here, just text';
  assert.equal(extractJsonFromText(input), 'No JSON here, just text');
});

// ── safeJsonParse ──────────────────────────────────────────────────────────────

test('safeJsonParse returns parsed data for valid JSON', () => {
  const result = safeJsonParse('{"name": "test"}');
  assert.ok(result.data);
  assert.equal((result.data as Record<string, unknown>).name, 'test');
  assert.equal(result.error, null);
});

test('safeJsonParse strips markdown fences before parsing', () => {
  const result = safeJsonParse('```json\n{"name": "test"}\n```');
  assert.ok(result.data);
  assert.equal((result.data as Record<string, unknown>).name, 'test');
});

test('safeJsonParse repairs trailing commas', () => {
  const result = safeJsonParse('{"name": "test",}');
  assert.ok(result.data);
  assert.equal((result.data as Record<string, unknown>).name, 'test');
});

test('safeJsonParse repairs unquoted keys', () => {
  const result = safeJsonParse('{name: "test"}');
  assert.ok(result.data);
  assert.equal((result.data as Record<string, unknown>).name, 'test');
});

test('safeJsonParse preserves top-level nested objects', () => {
  const input = '{"outer": {"inner": "value"}, "note": "example"}';
  const result = safeJsonParse(input);
  assert.ok(result.data);
  assert.equal((result.data as Record<string, unknown>).note, 'example');
  assert.deepEqual((result.data as Record<string, unknown>).outer, { inner: 'value' });
});

test('safeJsonParse returns error for completely invalid JSON', () => {
  const result = safeJsonParse('not json at all');
  assert.equal(result.data, null);
  assert.ok(result.error !== null);
});






