export type ProviderName = 'cohere' | 'mistral' | 'gemini' | 'groq';

export interface ProviderResponse {
	text: string;
	provider: ProviderName;
	model: string;
	status: number;
	usage: TokenUsage;
}

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
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

export interface ProviderAttempt {
	provider: string;
	status: number;
	error: string;
	correlationId: string;
}

export interface InferenceParams {
	temperature?: number;
	maxTokens?: number;
	topP?: number;
}

export interface BuildRequestResult {
	url: string;
	headers: Record<string, string>;
	body: CohereRequestBody | MistralRequestBody | GeminiRequestBody | GroqRequestBody;
}

export interface CohereRequestBody {
	model: string;
	messages: Array<{ role: string; content: string }>;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	p?: number;
	preamble_override?: string;
}

export interface MistralRequestBody {
	model: string;
	messages: Array<{ role: string; content: string }>;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
}

export interface GeminiRequestBody {
	contents: Array<{ parts: Array<{ text: string }> }>;
	systemInstruction?: { parts: Array<{ text: string }> };
	generationConfig?: {
		temperature?: number;
		maxOutputTokens?: number;
		topP?: number;
	};
}

export interface GroqRequestBody {
	model: string;
	messages: Array<{ role: string; content: string }>;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
}
