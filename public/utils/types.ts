/**
 * Shared Type Definitions for Job Data
 * Used by both client and server
 */

import { ScraperResult } from '../../src/types/scraper';

export type { ScraperResult };

export interface JobData {
  scrapingResults: {
    linkedin: ScraperResult[];
    google: ScraperResult[];
  };
  savedJobs: {
    linkedin: ScraperResult[];
    google: ScraperResult[];
  };
  jobDashboard: ScraperResult[];
}

export interface SidebarState {
  open: boolean;
  activeTab: 'scraping' | 'saved' | 'dashboard';
}

export const LOCALSTORAGE_KEYS = {
  scrapingResults: (source: 'linkedin' | 'google') => `jobData:scrapingResults:${source}`,
  savedJobs: (source: 'linkedin' | 'google') => `jobData:savedJobs:${source}`,
  jobDashboard: 'jobData:jobDashboard',
  sidebarState: 'findJob:sidebarState',
} as const;