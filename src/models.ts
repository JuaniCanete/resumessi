export type ProviderId = 'cohere' | 'mistral' | 'gemini' | 'groq';

export interface ProviderDefinition {
	id: ProviderId;
	name: string;
	keyEnv: string;
	modelEnv: string;
	defaultModel: string;
	description: string;
	icon: string;
	docsUrl: string;
}

export const DEFAULT_AI_INFERENCE_ORDER = 'mistral,cohere,groq,gemini';

export const PROVIDERS: ProviderDefinition[] = [
	{
		id: 'cohere',
		name: 'Cohere',
		keyEnv: 'COHERE_API_KEY',
		modelEnv: 'COHERE_MODEL',
		defaultModel: 'command-a-reasoning-08-2025',
		description: 'Deep reasoning, best for smart scoring & JD match',
		icon: '/public/assets/cohere_icon.png',
		docsUrl: 'https://dashboard.cohere.com/api-keys',
	},
	{
		id: 'mistral',
		name: 'Mistral',
		keyEnv: 'MISTRAL_API_KEY',
		modelEnv: 'MISTRAL_MODEL',
		defaultModel: 'codestral-latest',
		description: 'Massive 256k context, expert in parameter extraction',
		icon: '/public/assets/mistral_icon.png',
		docsUrl: 'https://admin.mistral.ai/organization/api-keys',
	},
	{
		id: 'gemini',
		name: 'Gemini',
		keyEnv: 'GEMINI_API_KEY',
		modelEnv: 'GEMINI_MODEL',
		defaultModel: 'gemini-3.7-flash',
		description: 'Ultra-fast analysis with advanced multi-modal vision',
		icon: '/public/assets/gemini_icon.png',
		docsUrl: 'https://aistudio.google.com/api-keys',
	},
	{
		id: 'groq',
		name: 'Groq',
		keyEnv: 'GROQ_API_KEY',
		modelEnv: 'GROQ_MODEL',
		defaultModel: 'openai/gpt-oss-120b',
		description: 'Instant processing, heavy-duty 120B token routing',
		icon: '/public/assets/groq_icon.png',
		docsUrl: 'https://console.groq.com/keys',
	},
];

export const PROVIDER_URLS: Record<string, string> = Object.fromEntries(PROVIDERS.map(p => [p.id, p.docsUrl]));

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
	return PROVIDERS.find(p => p.id === id);
}

export function getDefaultModel(id: ProviderId): string {
	const provider = getProviderDefinition(id);
	return provider ? provider.defaultModel : '';
}

export function getProvidersMetadata(env: Record<string, string | undefined> = {}): Record<
	string,
	{
		name: string;
		model: string;
		description: string;
		icon: string;
		configured: boolean;
	}
> {
	const metadata: Record<
		string,
		{
			name: string;
			model: string;
			description: string;
			icon: string;
			configured: boolean;
		}
	> = {};

	for (const p of PROVIDERS) {
		const model = env[p.modelEnv] || p.defaultModel;
		const hasKey = Boolean(env[p.keyEnv]);
		metadata[p.id] = {
			name: p.name,
			model,
			description: p.description,
			icon: p.icon,
			configured: hasKey,
		};
	}

	return metadata;
}
