async function runInference(system, prompt, params = {}, env) {
  const { callProvider, getProviderConfig } = require('./providers.js');
  const { order, providerMap } = getProviderConfig(env);

  if (order.length === 0) {
    throw new Error('No providers configured. Set at least one *_API_KEY in .env.');
  }

  const attempts = [];
  let lastError = null;

  for (const providerName of order) {
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

async function runPolish(resumeData, promptTemplate, env) {
  const prompt = `${promptTemplate}\n\nRESUME DATA TO POLISH: \n${JSON.stringify(resumeData, null, 2)}`;
  return runInference('You are a resume polishing assistant.', prompt, {}, env);
}

module.exports = {
  runInference,
  runPolish,
};
