/**
 * Database row interfaces for SQLite storage.
 * Replaces `Record<string, unknown>` with typed row shapes.
 */

export interface ScraperRunRow {
	source: 'linkedin' | 'google' | 'remoterocketship';
	query: string; // JSON
	totalResults: number;
	runId: string;
	timestamp: string;
	metadataExtractionStatus: 'pending' | 'extracting' | 'done' | 'failed';
	removedCount: number;
}

export interface ScrapingResultRow {
	url: string;
	source: 'linkedin' | 'google' | 'remoterocketship';
	title: string;
	snippet: string;
	company: string;
	postedDate: string;
	aiSummary: string | null;
	queryAffinity: number | null;
	parameters: string; // JSON
	saved: 0 | 1;
	savedAt: string | null;
	applied: 0 | 1;
	appliedAt: string | null;
	removed: 0 | 1;
	status: string;
	column: string | null;
	interviewRounds: number;
	notes: string | null;
	jobId: string | null;
	runId: string;
	timestamp: string;
	extractionDone: 0 | 1;
	site: string;
	jobDescription: string | null;
	isCollectionUrl: 0 | 1;
}

export type SavedJobRow = ScrapingResultRow;

export interface DashboardJobRow {
	url: string;
	source: 'linkedin' | 'google' | 'remoterocketship';
	title: string;
	company: string;
	postedDate: string;
	location: string;
	status: 'applied' | 'interviewing' | 'offer' | 'rejected' | 'saved';
	column: string;
	interviewRounds: number;
	notes: string;
	jobId: string;
	savedAt: string;
	appliedAt: string | null;
	updatedAt: string;
}
