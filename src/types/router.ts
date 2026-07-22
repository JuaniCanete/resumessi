import type { ProviderAttempt, ProviderName } from './provider';

export interface RouterOptions {
  selectedProvider?: ProviderName | null;
  timeout?: number;
}

export interface RouterResult {
  text: string;
  provider: ProviderName;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface RouterError extends Error {
  attempts: ProviderAttempt[];
  lastError: Error | null;
}

export interface PolishInput {
  resumeData?: Record<string, unknown>;
  provider?: string;
  [key: string]: unknown;
}