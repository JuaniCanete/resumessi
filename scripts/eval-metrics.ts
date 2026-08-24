export interface SemanticMetricResult {
	score: number; // 0-1
	details: string[];
}

export interface SemanticMetrics {
	faithfulness: SemanticMetricResult;
	hallucination: SemanticMetricResult;
	relevance: SemanticMetricResult;
	completeness: SemanticMetricResult;
}

// Simple keyword-based faithfulness check
function extractKeywords(text: string): Set<string> {
	const words = text
		.toLowerCase()
		.replace(/[^\w\s]/g, ' ')
		.split(/\s+/)
		.filter(w => w.length > 3);
	return new Set(words);
}

export function checkFaithfulness(input: string, output: string): SemanticMetricResult {
	const inputKeywords = extractKeywords(input);
	const outputKeywords = extractKeywords(output);

	if (outputKeywords.size === 0) {
		return { score: 0, details: ['No meaningful keywords in output'] };
	}

	const overlapping = [...outputKeywords].filter(k => inputKeywords.has(k));
	const score = overlapping.length / outputKeywords.size;

	const missing = [...outputKeywords].filter(k => !inputKeywords.has(k)).slice(0, 5);

	return {
		score: Math.min(1, score),
		details: missing.length > 0 ? [`Output keywords not in input: ${missing.join(', ')}`] : [],
	};
}

export function checkHallucination(input: string, output: string): SemanticMetricResult {
	const inputKeywords = extractKeywords(input);
	const outputKeywords = extractKeywords(output);

	if (outputKeywords.size === 0) {
		return { score: 1, details: [] };
	}

	// Hallucination = output keywords NOT in input
	const hallucinated = [...outputKeywords].filter(k => !inputKeywords.has(k));
	const hallucinationRate = hallucinated.length / outputKeywords.size;

	// Score is inverse of hallucination rate
	const score = 1 - Math.min(1, hallucinationRate * 2); // Penalize more heavily

	return {
		score: Math.max(0, score),
		details: hallucinated.slice(0, 5).map(k => `Potential hallucination: "${k}"`),
	};
}

const TASK_KEYWORDS: Record<string, string[]> = {
	'ats-scan': ['score', 'tier', 'match', 'feedback', 'keyword', 'skill', 'experience'],
	'extraction': ['name', 'email', 'experience', 'skill', 'education', 'company', 'role'],
	'polish': ['name', 'email', 'experience', 'skill', 'improved', 'refined', 'professional'],
	'cover-letter': [
		'dear',
		'hiring',
		'manager',
		'position',
		'experience',
		'skill',
		'interest',
		'sincerely',
		'regards',
		'application',
	],
	'clean-jd': ['clean', 'requirement', 'responsibility', 'qualification', 'skill', 'experience'],
	'scraper-parameters': ['role', 'seniority', 'employment', 'type', 'remote', 'location'],
	'scraper-summarize': ['job', 'company', 'title', 'location', 'url', 'summary'],
	'resume-generation': ['name', 'email', 'experience', 'education', 'skill', 'summary'],
};

export function checkRelevance(promptType: string, output: string): SemanticMetricResult {
	const keywords = TASK_KEYWORDS[promptType] || [];
	if (keywords.length === 0) {
		return { score: 1, details: [] };
	}

	const outputLower = output.toLowerCase();
	const found = keywords.filter(k => outputLower.includes(k.toLowerCase()));
	const score = found.length / keywords.length;

	const missing = keywords.filter(k => !outputLower.includes(k.toLowerCase()));

	return {
		score,
		details: missing.length > 0 ? [`Missing task keywords: ${missing.join(', ')}`] : [],
	};
}

export function checkCompleteness<T>(output: T, requiredFields: string[]): SemanticMetricResult {
	if (!output || typeof output !== 'object') {
		return { score: 0, details: ['Output is not an object'] };
	}

	const obj = output as Record<string, unknown>;
	const keys = Object.keys(obj);

	if (requiredFields.length === 0) {
		// For dynamic objects, check if it has reasonable content
		const nonEmptyKeys = keys.filter(k => {
			const v = obj[k];
			return (
				v !== null &&
				v !== undefined &&
				v !== '' &&
				!(Array.isArray(v) && v.length === 0) &&
				!(typeof v === 'object' && Object.keys(v).length === 0)
			);
		});
		return {
			score: nonEmptyKeys.length > 0 ? 1 : 0,
			details: nonEmptyKeys.length === 0 ? ['Output object has no meaningful fields'] : [],
		};
	}

	const missing = requiredFields.filter(f => !keys.includes(f));
	const score = 1 - missing.length / requiredFields.length;

	return {
		score: Math.max(0, score),
		details: missing.length > 0 ? [`Missing required fields: ${missing.join(', ')}`] : [],
	};
}

export function validateSchema<T>(
	output: unknown,
	schema: { parse: (data: unknown) => T }
): { valid: boolean; errors: string[] } {
	try {
		schema.parse(output);
		return { valid: true, errors: [] };
	} catch (error) {
		const err = error as { issues?: Array<{ path: (string | number)[]; message: string }> };
		if (err.issues) {
			return { valid: false, errors: err.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
		}
		return { valid: false, errors: [(error as Error).message] };
	}
}

export function checkWordCountAdherence(output: string, targetWords: number, tolerance = 0.2): SemanticMetricResult {
	const actualWords = output.trim().split(/\s+/).filter(Boolean).length;
	if (targetWords <= 0) {
		return { score: 1, details: [] };
	}
	const drift = Math.abs(actualWords - targetWords) / targetWords;
	const score = Math.max(0, 1 - drift / tolerance); // 1.0 at zero drift, 0.0 at tolerance threshold
	return {
		score,
		details:
			drift > tolerance
				? [`Word count drift: ${actualWords} vs target ${targetWords} (${(drift * 100).toFixed(1)}%)`]
				: [],
	};
}
