import type {
  ProviderName,
  ProviderResponse,
  ProviderMap,
  ProviderConfigResult,
  BuildRequestResult,
} from './types/provider';

const PROVIDER_TIMEOUTS: Record<string, number> = {
  cohere: 30000,
  mistral: 30000,
  gemini: 30000,
  groq: 30000,
};

function getProviderTimeout(provider: string): number {
  return PROVIDER_TIMEOUTS[provider] || 30000;
}

async function fetchWithTimeout(url: string, options: globalThis.RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callProvider(
  provider: ProviderName,
  system: string,
  prompt: string,
  model: string,
  key: string,
  params: Record<string, unknown> = {},
  scope: string = 'generic',
  correlationId?: string,
): Promise<ProviderResponse> {
  const { url, headers, body } = buildRequest(provider, system, prompt, model, key, params);
  const timeout = getProviderTimeout(provider);
  const startTime = Date.now();

  const cid = correlationId || crypto.randomUUID().slice(0, 8);

  let httpStatus = 0;
  let ok = false;
  let errorMsg: string | undefined;
  let parsedUsage: Record<string, number | undefined> | null = null;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }, timeout);

    httpStatus = response.status;
    ok = response.ok;

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errData = await response.json() as Record<string, unknown>;
        const errInner = errData.error as Record<string, unknown> | undefined;
        errMsg = (typeof errInner?.message === 'string' ? errInner.message : undefined) || (typeof errData.error === 'string' ? errData.error : undefined) || JSON.stringify(errData) || errMsg;
      } catch { /* ignore */ }
      httpStatus = response.status;
      throw { status: response.status, error: errMsg, provider };
    }

    const data = await response.json();
    const parsed = parseResponse(provider, data);
    parsedUsage = parsed.usage;

    return { ...parsed, provider, model, status: response.status };
  } catch (err: unknown) {
    ok = false;
    if (err instanceof Error) {
      errorMsg = err.message;
    } else if (typeof err === 'object' && err !== null) {
      errorMsg = (err as { error?: string }).error || JSON.stringify(err);
    } else {
      errorMsg = String(err);
    }
    throw { status: httpStatus, provider, error: errorMsg };
  } finally {
    const latencyMs = Date.now() - startTime;
    const record = {
      timestamp: new Date().toISOString(),
      correlationId: cid,
      scope,
      provider,
      model,
      httpStatus,
      latencyMs,
      usage: parsedUsage || { prompt_tokens: undefined, completion_tokens: undefined },
      ok,
    };
    if (!ok && errorMsg) {
      (record as Record<string, unknown>).error = errorMsg;
    }
    console.log(JSON.stringify(record));
  }
}

function buildRequest(
  provider: ProviderName,
  system: string,
  prompt: string,
  model: string,
  key: string,
  params: Record<string, unknown> = {},
): BuildRequestResult {
  const { temperature, max_tokens, top_p } = params;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (provider === 'cohere') {
    headers['Authorization'] = `Bearer ${key}`;
    const messages: Array<Record<string, string>> = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model,
      messages,
    };

    if (temperature !== undefined) body.temperature = temperature;
    if (max_tokens !== undefined) body.max_tokens = max_tokens;
    // Cohere v2 chat API does not support top_p parameter
    // if (top_p !== undefined) body.top_p = top_p;

    return {
      url: 'https://api.cohere.com/v2/chat',
      headers,
      body,
    };
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }

    const generationConfig: Record<string, unknown> = {};
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (max_tokens !== undefined) generationConfig.maxOutputTokens = max_tokens;
    if (top_p !== undefined) generationConfig.topP = top_p;
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    return { url, headers, body };
  }

  if (provider === 'mistral' || provider === 'groq') {
    headers['Authorization'] = `Bearer ${key}`;
    const messages: Array<Record<string, string>> = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: prompt });

    const body: Record<string, unknown> = {
      model,
      messages,
    };

    if (temperature !== undefined) body.temperature = temperature;
    if (max_tokens !== undefined) body.max_tokens = max_tokens;
    // For Mistral/Groq: when temperature=0 (greedy sampling), top_p must be 1 or omitted
    const temp = temperature as number | undefined;
    if (top_p !== undefined && (temp === undefined || temp > 0)) {
      body.top_p = top_p;
    } else if (top_p !== undefined && temp === 0) {
      // Greedy sampling requires top_p = 1
      body.top_p = 1;
    }

    const baseUrl = provider === 'mistral'
      ? 'https://api.mistral.ai/v1/chat/completions'
      : 'https://api.groq.com/openai/v1/chat/completions';

    return { url: baseUrl, headers, body };
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function parseResponse(provider: ProviderName, data: Record<string, unknown>): { text: string; usage: Record<string, number | undefined> } {
  let text = '';
  const usage: Record<string, number | undefined> = {};

  try {
    if (provider === 'cohere') {
      const msgData = data as { message?: { content?: Array<{ text?: string }> | string }; text?: string; meta?: { tokens?: { input_tokens?: number; output_tokens?: number } }; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      if (msgData?.message?.content) {
        if (Array.isArray(msgData.message.content)) {
          text = msgData.message.content.map(c => c.text || '').join('');
        } else {
          text = msgData.message.content as string;
        }
      }
      text = text || msgData?.text || '';
      if (msgData?.meta?.tokens) {
        usage.prompt_tokens = msgData.meta.tokens.input_tokens;
        usage.completion_tokens = msgData.meta.tokens.output_tokens;
      } else if (msgData?.usage) {
        usage.prompt_tokens = msgData.usage.prompt_tokens;
        usage.completion_tokens = msgData.usage.completion_tokens;
      }
    } else if (provider === 'gemini') {
      const geminiData = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      const parts = geminiData?.candidates?.[0]?.content?.parts || [];
      text = parts.map(p => p.text || '').join('');
      // Gemini sometimes wraps JSON in markdown fences — extract clean JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }
      if (geminiData?.usageMetadata) {
        usage.prompt_tokens = geminiData.usageMetadata.promptTokenCount;
        usage.completion_tokens = geminiData.usageMetadata.candidatesTokenCount;
      }
    } else if (provider === 'mistral' || provider === 'groq') {
      const openaiData = data as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      text = openaiData?.choices?.[0]?.message?.content || '';
      if (openaiData?.usage) {
        usage.prompt_tokens = openaiData.usage.prompt_tokens;
        usage.completion_tokens = openaiData.usage.completion_tokens;
      }
    }
  } catch (err) {
    console.error('parseResponse error for', provider, err);
    throw err;
  }

  return { text, usage };
}

function extractJsonFromText(text: string): string {
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

  const startIndex = cleaned.indexOf('{');
  if (startIndex === -1) {
    return cleaned;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return cleaned.slice(startIndex, i + 1);
      }
    }
  }

  return cleaned.slice(startIndex);
}

function safeJsonParse(text: string): { data: Record<string, unknown> | null; error: string | null } {
  const cleaned = extractJsonFromText(text);
  
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return { data: parsed, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid JSON';
    
    // Try to fix common JSON issues
    let repaired = cleaned;
    
    // Remove trailing commas
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');
    
    // Fix unquoted keys (line-anchored to avoid matching inside string values)
    // NOTE: repair is line-anchored and may over-match bare identifiers inside
    // multi-line string values. Safe for typical LLM output; tighten if needed.
    repaired = repaired.replace(/^([\s,{]*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm, '$1"$2":');
    
    try {
      const parsed = JSON.parse(repaired) as Record<string, unknown>;
      return { data: parsed, error: null };
    } catch {
      return { data: null, error: errorMsg };
    }
  }
}

function getProviderConfig(env: Record<string, string | undefined>): ProviderConfigResult {
  const order = (env.AI_INFERENCE_ORDER || 'cohere,mistral,gemini,groq')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const providerMap: ProviderMap = {};

  const cohereKey = env.COHERE_API_KEY || '';
  const cohereModel = env.COHERE_MODEL || 'command-a-reasoning-08-2025-08-2024';
  if (cohereKey) {
    providerMap.cohere = { key: cohereKey, model: cohereModel };
  }

  const mistralKey = env.MISTRAL_API_KEY || '';
  const mistralModel = env.MISTRAL_MODEL || 'codestral-2508';
  if (mistralKey) {
    providerMap.mistral = { key: mistralKey, model: mistralModel };
  }

  const geminiKey = env.GEMINI_API_KEY || '';
  const geminiModel = env.GEMINI_MODEL || 'gemini-3.6-flash';
  if (geminiKey) {
    providerMap.gemini = { key: geminiKey, model: geminiModel };
  }

  const groqKey = env.GROQ_API_KEY || '';
  const groqModel = env.GROQ_MODEL || 'openai/gpt-oss-120b';
  if (groqKey) {
    providerMap.groq = { key: groqKey, model: groqModel };
  }

  const configured = order.filter(p => providerMap[p]);

  return {
    order: configured.length > 0 ? configured : order,
    providerMap,
    configured,
  };
}

function validateInferenceRequest(body: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (typeof body.system !== 'string' || body.system.trim().length < 1) {
    errors.push('system must be a non-empty string');
  }
  if (typeof body.prompt !== 'string' || body.prompt.trim().length < 1) {
    errors.push('prompt must be a non-empty string');
  }
  if (body.provider !== undefined && body.provider != null && (typeof body.provider !== 'string' || body.provider.trim().length < 1)) {
    errors.push('provider must be a non-empty string when provided');
  }
  if (body.scope !== undefined && (typeof body.scope !== 'string' || !['ats', 'polish', 'generate', 'generic'].includes(body.scope.trim().toLowerCase()))) {
    errors.push('scope must be one of: ats, polish, generate, generic');
  }
  if (body.temperature !== undefined && (typeof body.temperature !== 'number' || body.temperature < 0 || body.temperature > 2)) {
    errors.push('temperature must be a number between 0.0 and 2.0');
  }
  if (body.max_tokens !== undefined && (!Number.isInteger(body.max_tokens) || (body.max_tokens as number) <= 0)) {
    errors.push('max_tokens must be a positive integer');
  }
  if (body.top_p !== undefined && (typeof body.top_p !== 'number' || body.top_p < 0 || body.top_p > 1)) {
    errors.push('top_p must be a number between 0.0 and 1.0');
  }

  const allowedKeys = new Set(['system', 'prompt', 'provider', 'scope', 'temperature', 'max_tokens', 'top_p']);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unexpected field: ${key}`);
    }
  }

  return errors;
}

export {
  buildRequest,
  parseResponse,
  callProvider,
  getProviderTimeout,
  getProviderConfig,
  validateInferenceRequest,
  extractJsonFromText,
  safeJsonParse,
};