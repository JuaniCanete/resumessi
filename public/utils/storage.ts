/**
 * Client-side Storage Utilities
 * localStorage helpers with fallback for instant UI updates
 */

import type { JobData, ScraperResult, SidebarState } from './types';
import { LOCALSTORAGE_KEYS } from './types';

// Re-export for convenience
export { LOCALSTORAGE_KEYS };
export type { ScraperResult, JobData, SidebarState };

/**
 * Safe localStorage getter with fallback
 */
export function getStorageItem<T>(key: string, fallback: T): T {
	if (typeof window === 'undefined') return fallback;
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

/**
 * Safe localStorage setter
 */
export function setStorageItem<T>(key: string, value: T): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Ignore quota exceeded, private browsing, etc.
	}
}

/**
 * Remove item from localStorage
 */
export function removeStorageItem(key: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(key);
	} catch {
		// Ignore
	}
}

/**
 * Clear all job-data related localStorage keys
 */
export function clearJobDataStorage(): void {
	if (typeof window === 'undefined') return;
	try {
		Object.entries(LOCALSTORAGE_KEYS).forEach(([_, value]) => {
			if (typeof value === 'string') {
				localStorage.removeItem(value);
			} else if (typeof value === 'object' && value !== null) {
				// atsScanResults is an object with resume/jobfinder keys
				Object.values(value).forEach(v => localStorage.removeItem(v));
			}
		});
	} catch {
		// Ignore
	}
}

/**
 * Get scraping results from localStorage
 */
export function getLocalScrapingResults(source: 'linkedin' | 'google'): ScraperResult[] {
	return getStorageItem(LOCALSTORAGE_KEYS.scrapingResults(source), []);
}

/**
 * Set scraping results in localStorage
 */
export function setLocalScrapingResults(source: 'linkedin' | 'google', results: ScraperResult[]): void {
	setStorageItem(LOCALSTORAGE_KEYS.scrapingResults(source), results);
}

/**
 * Get saved jobs from localStorage
 */
export function getLocalSavedJobs(source?: 'linkedin' | 'google'): ScraperResult[] {
	if (source) {
		return getStorageItem(LOCALSTORAGE_KEYS.savedJobs(source), []);
	}
	return [
		...getStorageItem(LOCALSTORAGE_KEYS.savedJobs('linkedin'), []),
		...getStorageItem(LOCALSTORAGE_KEYS.savedJobs('google'), []),
	];
}

/**
 * Set saved jobs in localStorage
 */
export function setLocalSavedJobs(source: 'linkedin' | 'google', jobs: ScraperResult[]): void {
	setStorageItem(LOCALSTORAGE_KEYS.savedJobs(source), jobs);
}

/**
 * Get job dashboard from localStorage
 */
export function getLocalJobDashboard(): ScraperResult[] {
	return getStorageItem(LOCALSTORAGE_KEYS.jobDashboard, []);
}

/**
 * Set job dashboard in localStorage
 */
export function setLocalJobDashboard(jobs: ScraperResult[]): void {
	setStorageItem(LOCALSTORAGE_KEYS.jobDashboard, jobs);
}

/**
 * Save sidebar state to localStorage
 */
export function saveLocalSidebarState(state: SidebarState): void {
	setStorageItem(LOCALSTORAGE_KEYS.sidebarState, state);
}

/**
 * Load sidebar state from localStorage
 */
export function loadLocalSidebarState(): SidebarState | null {
	return getStorageItem(LOCALSTORAGE_KEYS.sidebarState, null);
}

/**
 * Debounced localStorage sync - batches writes
 */
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSync: Partial<JobData> = {};

export function scheduleLocalStorageSync(data: Partial<JobData>): void {
	pendingSync = { ...pendingSync, ...data };
	if (syncTimeout) clearTimeout(syncTimeout);
	syncTimeout = setTimeout(() => {
		if (pendingSync.scrapingResults) {
			if (pendingSync.scrapingResults.linkedin)
				setLocalScrapingResults('linkedin', pendingSync.scrapingResults.linkedin);
			if (pendingSync.scrapingResults.google) setLocalScrapingResults('google', pendingSync.scrapingResults.google);
		}
		if (pendingSync.savedJobs) {
			if (pendingSync.savedJobs.linkedin) setLocalSavedJobs('linkedin', pendingSync.savedJobs.linkedin);
			if (pendingSync.savedJobs.google) setLocalSavedJobs('google', pendingSync.savedJobs.google);
		}
		if (pendingSync.jobDashboard) setLocalJobDashboard(pendingSync.jobDashboard);
		pendingSync = {};
		syncTimeout = null;
	}, 100);
}

/**
 * Force flush pending sync
 */
export function flushLocalStorageSync(): void {
	if (syncTimeout) {
		clearTimeout(syncTimeout);
		if (pendingSync.scrapingResults) {
			if (pendingSync.scrapingResults.linkedin)
				setLocalScrapingResults('linkedin', pendingSync.scrapingResults.linkedin);
			if (pendingSync.scrapingResults.google) setLocalScrapingResults('google', pendingSync.scrapingResults.google);
		}
		if (pendingSync.savedJobs) {
			if (pendingSync.savedJobs.linkedin) setLocalSavedJobs('linkedin', pendingSync.savedJobs.linkedin);
			if (pendingSync.savedJobs.google) setLocalSavedJobs('google', pendingSync.savedJobs.google);
		}
		if (pendingSync.jobDashboard) setLocalJobDashboard(pendingSync.jobDashboard);
		pendingSync = {};
		syncTimeout = null;
	}
}

/**
 * ATS Scan Results - persistent localStorage
 */
export function saveAtsScanResults(
	screening: Record<string, unknown>,
	context: 'resume' | 'jobfinder' = 'resume'
): void {
	const key =
		context === 'resume' ? LOCALSTORAGE_KEYS.atsScanResults.resume : LOCALSTORAGE_KEYS.atsScanResults.jobfinder;
	setStorageItem(key, screening);
}

export function loadAtsScanResults(context: 'resume' | 'jobfinder' = 'resume'): Record<string, unknown> | null {
	const key =
		context === 'resume' ? LOCALSTORAGE_KEYS.atsScanResults.resume : LOCALSTORAGE_KEYS.atsScanResults.jobfinder;
	return getStorageItem(key, null);
}

export function clearAtsScanResults(context: 'resume' | 'jobfinder' = 'resume'): void {
	const key =
		context === 'resume' ? LOCALSTORAGE_KEYS.atsScanResults.resume : LOCALSTORAGE_KEYS.atsScanResults.jobfinder;
	removeStorageItem(key);
}
