/**
 * Shared utility functions for resumessi
 */

import { buildScraperSearchUrl } from '../src/scraper/pagination';
import type { ScraperQuery } from '../src/scraper/types';
import { isCollectionUrl } from '../src/scraper/runtime-utils';

export { isCollectionUrl };

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

// Build a search URL for LinkedIn or Google from a scraper query.
// Delegates to the shared builder in src/scraper/pagination.ts (single source of truth).
export function buildQueryUrl(source: 'linkedin' | 'google' | 'remoterocketship', query: ScraperQuery): string {
  return buildScraperSearchUrl(source, query);
}

// Re-export shared modules
export * from './utils/modal';
export * from './utils/storage';

export function resizeImage(dataUrl: string, maxWidth: number, maxHeight: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const mimeMatch = dataUrl.match(/^data:(image\/[^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      resolve(canvas.toDataURL(mimeType, quality));
    };
    img.onerror = function () {
      reject(new Error('Failed to load image for resizing'));
    };
    img.src = dataUrl;
  });
}
