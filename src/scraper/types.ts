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
  parameters?: string[];  // AI-extracted job parameters (location, remote, salary, etc.)
  status?: 'No News' | 'Interviewing' | 'Offer' | 'Rejected' | 'Hired';
  column?: string;
  interviewRounds?: number;
  id?: string;
  site?: string;
  jobDescription?: string;
  isCollectionUrl?: boolean;
}

export interface ScraperQuery {
  source?: 'linkedin' | 'google' | 'remoterocketship';
  keywords?: string;
  role?: string;
  seniority?: string;          // e.g. 'Senior' | 'Lead' | 'Junior'
  employmentType?: string;    // e.g. 'fulltime' | 'contractor' | 'parttime'
  region?: string;            // e.g. 'LATAM' | 'US' | 'EU'
  country?: string;           // e.g. 'Argentina' | 'Brazil' | 'Mexico'
  currency?: string;          // e.g. 'USD' | 'ARS' | 'EUR'
  customDomains?: string[];   // target domains for Google scraper
  pageCount?: number;         // number of search result pages to scrape (default 1)
  startPage?: number;         // first page to scrape (1-indexed, default 1)
  datePosted?: string;         // LinkedIn f_TP parameter mapping
  workType?: string;           // LinkedIn f_WT parameter mapping
  jobTitle?: string;          // Remote Rocketship: job titles (comma-separated)
  locations?: string;         // Remote Rocketship: locations (comma-separated)
  page?: number;              // Remote Rocketship: page number
}

export interface ScraperRunMeta {
  timestamp: string;
  source: 'linkedin' | 'google' | 'remoterocketship';
  query: ScraperQuery;
  totalResults: number;
  results: ScraperResult[];
  summary?: string;
}
