/**
 * Shared utility functions for resumessi
 */

export function escHtml(value: string | null | undefined): string {
  if (!value) return '';
  const m: Record<string, number> = { '&': 38, '<': 60, '>': 62, '"': 34, "'": 39 };
  return String(value).replace(/[&<>"']/g, (c) => '&#' + m[c] + ';');
}

export function validateJDInput(jd: string): { valid: boolean; reason?: string } {
  if (!jd || typeof jd !== 'string') {
    return { valid: false, reason: 'Job description is required' };
  }
  const trimmed = jd.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Job description cannot be empty' };
  }
  if (trimmed.length < 50) {
    return { valid: false, reason: 'Job description is too short (minimum 50 characters)' };
  }
  return { valid: true };
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Present';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

export function renderSkills(skills: string[] | null | undefined): string {
  if (!Array.isArray(skills) || skills.length === 0) return '';
  return skills.map(s => `<span>${s}</span>`).join('');
}

export function getDuration(startDate: string, endDate?: string): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  if (isNaN(start.getTime())) return '';
  const months = (end.getFullYear() - start.getFullYear()) * 12
    + (end.getMonth() - start.getMonth());
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem}mo`;
  if (rem === 0) return `${years}yr`;
  return `${years}yr ${rem}mo`;
}

export function getPhotoPath(uploadedPhoto: string | null, resumeData?: { basics?: { photo?: string } } | null): string {
  if (uploadedPhoto) return uploadedPhoto;
  if (resumeData && resumeData.basics && resumeData.basics.photo) {
    if (resumeData.basics.photo.includes('/')) {
      return resumeData.basics.photo;
    }
    return `public/assets/photos/${resumeData.basics.photo}`;
  }
  return '/demo/goat.jpg';
}

// Strip markdown syntax from a string to produce plain text
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/#+\s*/g, '')
    .replace(/>\s*/g, '')
    .replace(/[-*+]\s+/g, '• ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build a search URL for LinkedIn or Google from a scraper query
export function buildQueryUrl(source: 'linkedin' | 'google', query: Record<string, string>): string {
  const parts: string[] = [];
  if (query.role) parts.push(query.role);
  if (query.seniority) parts.push(query.seniority);
  if (query.stack) parts.push(query.stack);

  if (source === 'linkedin') {
    if (query.employmentType) parts.push(query.employmentType);
    if (query.region) parts.push(query.region);
    if (query.country) parts.push(query.country);
    if (query.currency) parts.push(query.currency);
    const fullQuery = parts.join(' ');
    return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(fullQuery)}`;
  } else {
    if (query.employmentType) parts.push(query.employmentType);
    // Google search uses site: domains for job boards
    const defaultDomains = ['teamtailor.com', 'greenhouse.io', 'lever.co', 'workday.com', 'jobs.ashbyhq.com'];
    const siteQuery = defaultDomains.map(d => `site:${d}`).join(' OR ');
    parts.push(`(${siteQuery})`);
    parts.push('("careers" OR "jobs" OR "open positions")');

    // Combine country and region into a single quoted group, e.g. ("LATAM" OR "Argentina")
    const locationParts: string[] = [];
    if (query.region) locationParts.push(query.region);
    if (query.country) locationParts.push(query.country);
    if (locationParts.length > 0) {
      parts.push(`(${locationParts.map(l => `"${l}"`).join(' OR ')})`);
    }

    if (query.currency) parts.push(query.currency);
    const fullQuery = parts.join(' ');
    return `https://www.google.com/search?q=${encodeURIComponent(fullQuery)}`;
  }
}
