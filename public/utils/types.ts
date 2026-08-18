/**
 * Shared Type Definitions for Job Data
 * Used by both client and server
 */

export interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google' | 'remoterocketship';
  author?: string;
  company?: string;
  postedDate?: string;
  aiSummary?: string;
  queryAffinity?: 'High' | 'Medium' | 'Low';
  parameters?: string[];
  // New fields for tracking
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
  site?: string;
  jobDescription?: string;
  isCollectionUrl?: boolean;
}

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