export type ProviderName = 'cohere' | 'mistral' | 'gemini' | 'groq';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMOptions {
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
}

export interface ProviderResponse {
	text: string;
	provider: ProviderName;
	model: string;
	status: number;
	usage: {
		prompt_tokens?: number;
		completion_tokens?: number;
	};
}

export interface ProviderConfig {
	key: string;
	model: string;
}

export interface ProviderMap {
	[provider: string]: ProviderConfig | undefined;
	cohere?: ProviderConfig;
	mistral?: ProviderConfig;
	gemini?: ProviderConfig;
	groq?: ProviderConfig;
}

export interface ProviderConfigResult {
	order: string[];
	providerMap: ProviderMap;
	configured: string[];
}

export interface ProviderError {
	status: number;
	error: string;
	provider: string;
}

export interface ProviderAttempt {
	provider: string;
	status: number;
	error: string;
}

export interface InferenceRequest {
	system: string;
	prompt: string;
	provider?: string;
	scope?: string;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
}

export interface BuildRequestResult {
	url: string;
	headers: Record<string, string>;
	body: Record<string, unknown>;
}
