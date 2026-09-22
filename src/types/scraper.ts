/**
 * Consolidated Scraper Types
 * Single source of truth for ScraperResult and related types
 * Used by client (public/utils/types.ts), server (src/scraper/types.ts, src/storage/jobDataSqlite.ts)
 */

export interface ScraperResult {
	title: string;
	url: string;
	snippet: string;
	source: 'linkedin' | 'google' | 'remoterocketship' | 'user';
	author?: string;
	company?: string;
	postedDate?: string;
	aiSummary?: string;
	queryAffinity?: 'High' | 'Medium' | 'Low';
	parameters?: string[]; // AI-extracted job parameters (location, remote, salary, etc.)
	// Tracking fields
	saved?: boolean;
	savedAt?: string;
	applied?: boolean;
	appliedAt?: string;
	removed?: boolean;
	status?: 'No News' | 'Interviewing' | 'Offer' | 'Rejected' | 'Hired';
	column?: string;
	interviewRounds?: number;
	notes?: string;
	id?: string;
	// Extended fields
	site?: string;
	jobDescription?: string;
	isCollectionUrl?: boolean;
	roleTerm?: string; // transient: which role term produced this result (merge marker, not persisted)
}

export interface ScraperQuery {
	source?: 'linkedin' | 'google' | 'remoterocketship';
	keywords?: string;
	role?: string;
	seniority?: string; // e.g. 'Senior' | 'Lead' | 'Junior'
	employmentType?: string; // e.g. 'full' | 'hour' | 'part'
	region?: string; // e.g. 'LATAM' | 'US' | 'EU'
	country?: string; // e.g. 'Argentina' | 'Brazil' | 'Mexico'
	currency?: string; // e.g. 'USD' | 'ARS' | 'EUR'
	customDomains?: string[]; // target domains for Google scraper
	pageCount?: number; // number of search result pages to scrape (default 1)
	startPage?: number; // first page to scrape (1-indexed, default 1)
	datePosted?: string; // LinkedIn f_TP parameter mapping
	workType?: string; // LinkedIn f_WT parameter mapping
	splitRoles?: boolean; // Google: run one SerpAPI query per role term, merge results (default true)
	roleTerms?: string[]; // Google: parsed role terms, populated before scrape when splitRoles is on
	executedQueries?: string[]; // Google output: actual SerpAPI q strings sent, populated by scrapeGoogle
}

export interface ScraperRunMeta {
	timestamp: string;
	source: 'linkedin' | 'google' | 'remoterocketship';
	query: ScraperQuery;
	totalResults: number;
	results: ScraperResult[];
	summary?: string;
	executedQueries?: string[]; // Google: actual SerpAPI q strings sent (one per role term when split)
}
