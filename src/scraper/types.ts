export interface ScraperResult {
  title: string;
  url: string;
  snippet: string;
  source: 'linkedin' | 'google';
  author?: string;
  company?: string;
  postedDate?: string;
  aiSummary?: string;
}

export interface ScraperQuery {
  source: 'linkedin' | 'google';
  keywords: string;
  role?: string;
  employmentType?: string;    // e.g. 'fulltime' | 'contractor' | 'parttime'
  region?: string;            // e.g. 'LATAM' | 'US' | 'EU'
  currency?: string;          // e.g. 'USD' | 'ARS' | 'EUR'
  stack?: string;             // e.g. 'React, Node.js, TypeScript'
  customDomains?: string[];   // target domains for Google scraper
}

export interface ScraperRunMeta {
  timestamp: string;
  source: 'linkedin' | 'google';
  query: ScraperQuery;
  totalResults: number;
  results: ScraperResult[];
  summary?: string;
}
