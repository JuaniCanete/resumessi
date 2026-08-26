import type { ProviderName, ProviderMap, ProviderAttempt, ProviderResponse, InferenceParams } from './types/provider';
import type { RouterResult, RouterError, ResumeData } from './types/router';
import { callProvider, getProviderConfig } from './providers';

export type CallProviderFn = (
	provider: ProviderName,
	system: string,
	prompt: string,
	model: string,
	key: string,
	params?: InferenceParams,
	scope?: string,
	correlationId?: string
) => Promise<ProviderResponse>;

type GetProviderConfigFn = (env: Record<string, string | undefined>) => {
	order: string[];
	providerMap: ProviderMap;
	configured: string[];
};

export { type InferenceParams } from './types/provider';

export async function runInference(
	system: string,
	prompt: string,
	params: InferenceParams = {},
	env: Record<string, string | undefined>,
	selectedProvider: string | null = null,
	callProviderFn: CallProviderFn | null = null,
	getProviderConfigFn: GetProviderConfigFn | null = null,
	scope: string = 'generic'
): Promise<RouterResult> {
	const call = callProviderFn || callProvider;
	const config = getProviderConfigFn || getProviderConfig;

	const providerConfigResult = config(env);

	let providerOrder: string[];
	if (selectedProvider) {
		const normalizedProvider = selectedProvider.toLowerCase();
		if (!providerConfigResult.providerMap[normalizedProvider]) {
			throw new Error(`Selected provider '${selectedProvider}' is not configured. Check your .env file.`);
		}
		providerOrder = [normalizedProvider];
	} else {
		providerOrder = providerConfigResult.order;
	}

	if (providerOrder.length === 0) {
		throw new Error('No providers configured. Set at least one *_API_KEY in .env.');
	}

	const correlationId = crypto.randomUUID().slice(0, 8);

	const attempts: ProviderAttempt[] = [];
	let lastError: Error | null = null;

	for (const providerName of providerOrder) {
		const providerConfig = providerConfigResult.providerMap[providerName];
		if (!providerConfig) continue;

		try {
			const result: ProviderResponse = await call(
				providerName as ProviderName,
				system,
				prompt,
				providerConfig.model,
				providerConfig.key,
				params,
				scope,
				correlationId
			);
			return { text: result.text, provider: result.provider, model: result.model, usage: result.usage, attempts: [] };
		} catch (err: unknown) {
			const attempt: ProviderAttempt = {
				provider: providerName,
				status: (err as { status?: number }).status || 500,
				error: (err as { error?: string }).error || (err as Error).message,
				correlationId,
			};
			attempts.push(attempt);
			lastError = err as Error;
		}
	}

	const failedProviders = attempts.map(a => `${a.provider} (${a.status}: ${a.error})`).join('; ');
	const error = new Error(`All providers exhausted — ${failedProviders}`) as RouterError;
	error.attempts = attempts;
	error.lastError = lastError;
	throw error;
}

export function runPolish(
	resumeData: ResumeData,
	promptTemplate: string,
	env: Record<string, string | undefined>,
	selectedProvider: string | null = null,
	callProviderFn: CallProviderFn | null = null,
	getProviderConfigFn: GetProviderConfigFn | null = null,
	scope: string = 'polish'
): Promise<RouterResult> {
	const prompt = `${promptTemplate}\n\nRESUME DATA TO POLISH: \n${JSON.stringify(resumeData, null, 2)}`;
	return runInference(
		'You are a resume polishing assistant.',
		prompt,
		{},
		env,
		selectedProvider,
		callProviderFn,
		getProviderConfigFn,
		scope
	);
}
