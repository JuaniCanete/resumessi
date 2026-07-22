/**
 * Shared utility functions for resumessi
 */

export function escHtml(value: string | null | undefined): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
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
  return '/examples/photo.jpg';
}