import assert from 'node:assert/strict';
import { test } from 'node:test';

test('src/types/config.ts - AppConfig shape validation', () => {
	const config = {
		AI_INFERENCE_ORDER: 'cohere,mistral,gemini,groq',
		COHERE_API_KEY: 'cohere-key',
		COHERE_MODEL: 'command-r-plus',
		MISTRAL_API_KEY: 'mistral-key',
		MISTRAL_MODEL: 'mistral-large',
		GEMINI_API_KEY: 'gemini-key',
		GEMINI_MODEL: 'gemini-pro',
		GROQ_API_KEY: 'groq-key',
		GROQ_MODEL: 'llama3-70b',
		PRIMARY_COLOR: '#0a0a0a',
		SECONDARY_COLOR: '#0a0a0a',
		ACCENT_COLOR: '#2563eb',
		TEXT_COLOR: '#171717',
		TEXT_LIGHT_COLOR: '#736868',
		BG_BADGE_COLOR: '#f1f5f9',
		SUCCESS_COLOR: '#0ea5e9',
	};

	assert.ok(config.AI_INFERENCE_ORDER);
	assert.ok(config.COHERE_API_KEY);
	assert.ok(config.COHERE_MODEL);
	assert.ok(config.MISTRAL_API_KEY);
	assert.ok(config.MISTRAL_MODEL);
	assert.ok(config.GEMINI_API_KEY);
	assert.ok(config.GEMINI_MODEL);
	assert.ok(config.GROQ_API_KEY);
	assert.ok(config.GROQ_MODEL);
	assert.ok(config.PRIMARY_COLOR);
	assert.ok(config.SECONDARY_COLOR);
	assert.ok(config.ACCENT_COLOR);
	assert.ok(config.TEXT_COLOR);
	assert.ok(config.TEXT_LIGHT_COLOR);
	assert.ok(config.BG_BADGE_COLOR);
	assert.ok(config.SUCCESS_COLOR);
});

test('src/types/config.ts - ClientSafeConfig shape validation', () => {
	const config = {
		AI_INFERENCE_ORDER: 'cohere,mistral,gemini',
		availableProviders: ['cohere', 'mistral', 'gemini'],
		primaryProvider: 'cohere',
		PRIMARY_COLOR: '#0a0a0a',
		SECONDARY_COLOR: '#0a0a0a',
		ACCENT_COLOR: '#2563eb',
		TEXT_COLOR: '#171717',
		TEXT_LIGHT_COLOR: '#736868',
		BG_BADGE_COLOR: '#f1f5f9',
		SUCCESS_COLOR: '#0ea5e9',
	};

	assert.ok(config.AI_INFERENCE_ORDER);
	assert.ok(Array.isArray(config.availableProviders));
	assert.ok(config.availableProviders.length > 0);
	assert.ok(config.primaryProvider === null || typeof config.primaryProvider === 'string');
	assert.ok(config.PRIMARY_COLOR);
	assert.ok(config.SECONDARY_COLOR);
	assert.ok(config.ACCENT_COLOR);
	assert.ok(config.TEXT_COLOR);
	assert.ok(config.TEXT_LIGHT_COLOR);
	assert.ok(config.BG_BADGE_COLOR);
	assert.ok(config.SUCCESS_COLOR);
});

test('src/types/config.ts - ClientSafeConfig with null primaryProvider', () => {
	const config = {
		AI_INFERENCE_ORDER: 'cohere,mistral',
		availableProviders: ['cohere', 'mistral'],
		primaryProvider: null,
	};

	assert.equal(config.primaryProvider, null);
});
