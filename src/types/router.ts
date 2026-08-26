import type { ProviderName } from './provider';

export interface ProviderAttempt {
	provider: string;
	status: number;
	error: string;
	correlationId: string;
}

export interface RouterOptions {
	selectedProvider?: ProviderName | null;
	timeout?: number;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	preferredProvider?: string;
}

export interface RouterResult {
	text: string;
	provider: ProviderName;
	model?: string;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	attempts: ProviderAttempt[];
}

export interface RouterError extends Error {
	attempts: ProviderAttempt[];
	lastError: Error | null;
}

export interface PolishInput {
	resumeData?: ResumeData;
	provider?: string;
}

export interface ResumeData {
	basics?: {
		name?: string;
		email?: string;
		phone?: string;
		location?: string;
		photo?: string;
		url?: string;
		summary?: string;
	};
	skills?: Array<{ name: string; level?: string; keywords?: string[] }>;
	experience?: Array<{
		name: string;
		position: string;
		startDate: string;
		endDate: string;
		summary: string;
		highlights?: string[];
	}>;
	education?: Array<{
		institution: string;
		area: string;
		studyType: string;
		startDate: string;
		endDate: string;
		score?: string;
	}>;
}
