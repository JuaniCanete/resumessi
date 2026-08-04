export interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  author?: string;
  company?: string;
  postedDate?: string;
  aiSummary?: string;
  parameters?: string[];  // AI-extracted job parameters (location, remote, salary, etc.)
}

export interface ScraperQuery {
  source: 'linkedin' | 'google';
  keywords: string;
  role?: string;
  seniority?: string;          // e.g. 'Senior' | 'Lead' | 'Junior'
  employmentType?: string;    // e.g. 'fulltime' | 'contractor' | 'parttime'
  region?: string;            // e.g. 'LATAM' | 'US' | 'EU'
  country?: string;           // e.g. 'Argentina' | 'Brazil' | 'Mexico'
  currency?: string;          // e.g. 'USD' | 'ARS' | 'EUR'
  stack?: string;             // e.g. 'React, Node.js, TypeScript'
  customDomains?: string[];   // target domains for Google scraper
  pageCount?: number;         // number of search result pages to scrape (default 1)
}

export interface ScraperRunMeta {
  timestamp: string;
  source: 'linkedin' | 'google';
  query: ScraperQuery;
  totalResults: number;
  results: ScraperResult[];
  summary?: string;
}
