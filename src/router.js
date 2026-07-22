async function runInference(system, prompt, params = {}, env, selectedProvider = null) {
	const { callProvider, getProviderConfig } = require('./providers.js');
	const { order, providerMap } = getProviderConfig(env);

	let providerOrder;
	if (selectedProvider) {
		const normalizedProvider = selectedProvider.toLowerCase();
		if (!providerMap[normalizedProvider]) {
			throw new Error(`Selected provider '${selectedProvider}' is not configured. Check your .env file.`);
		}
		providerOrder = [normalizedProvider];
	} else {
		providerOrder = order;
	}

	if (providerOrder.length === 0) {
		throw new Error('No providers configured. Set at least one *_API_KEY in .env.');
	}

	const attempts = [];
	let lastError = null;

	for (const providerName of providerOrder) {
		const config = providerMap[providerName];
		if (!config) continue;

		try {
			const result = await callProvider(providerName, system, prompt, config.model, config.key, params);
			return { text: result.text, provider: result.provider, usage: result.usage };
		} catch (err) {
			const attempt = {
				provider: providerName,
				status: err.status || 500,
				error: err.error || err.message,
			};
			attempts.push(attempt);
			lastError = err;
		}
	}

	const error = new Error('All providers exhausted');
	error.attempts = attempts;
	error.lastError = lastError;
	throw error;
}

async function runPolish(resumeData, promptTemplate, env, selectedProvider = null) {
	const prompt = `${promptTemplate}\n\nRESUME DATA TO POLISH: \n${JSON.stringify(resumeData, null, 2)}`;
	return runInference('You are a resume polishing assistant.', prompt, {}, env, selectedProvider);
}

module.exports = {
	runInference,
	runPolish,
};