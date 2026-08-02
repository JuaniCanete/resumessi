/**
 * resumessi — Frontend Application Logic
 * Extracted from public/main.html inline script
 */

import { getScraperResultsStorageKey } from '../src/scraper/runtime-utils';

// Declare global function for TypeScript benefit
declare function closeJdEditModal(): void;

// ─── State ──────────────────────────────────────────────────────────
let scanController: AbortController | null = null;
let cachedConfig: Record<string, unknown> | null = null;
let generationController: AbortController | null = null;
let polishController: AbortController | null = null;
let currentDataSource: string = 'none';
let currentPhotoDataURL: string | null = null;
let currentPDFText = '';
let currentPDFFileName = '';
let selectedProviderForModal: string | null = null;
let scraperController: AbortController | null = null;
let currentScraperPlatform: 'linkedin' | 'google' = 'linkedin';
let scraperResultsWindow: Window | null = null;


// Public helper to reset config cache between test runs
(window as unknown as Record<string, unknown>).__resetConfigCache = () => {
  cachedConfig = null;
};

// ─── Config Loading ─────────────────────────────────────────────────
async function loadEnv(): Promise<Record<string, unknown>> {
  if (cachedConfig) return cachedConfig;
  try {
    const resp = await fetch('/config.json');
    if (resp.ok) {
      cachedConfig = await resp.json() as Record<string, unknown>;
      return cachedConfig;
    }
  } catch (e) {
    console.warn('Could not load config.json, using defaults', e);
  }
  cachedConfig = {};
  return cachedConfig;
}

function applyColors(env: Record<string, unknown>): void {
  const root = document.documentElement;
  const presets: Record<string, string> = { blue: '#2563eb', green: '#16a34a', purple: '#7c3aed', rose: '#e11d48', teal: '#0d9488', orange: '#ea580c' };
  if (env.ACCENT_COLOR && presets[env.ACCENT_COLOR as string]) env.ACCENT_COLOR = presets[env.ACCENT_COLOR as string];
  const map: Record<string, string> = { PRIMARY_COLOR: '--primary', SECONDARY_COLOR: '--secondary', ACCENT_COLOR: '--accent', TEXT_COLOR: '--text', TEXT_LIGHT_COLOR: '--text-light', BG_BADGE_COLOR: '--bg-badge', SUCCESS_COLOR: '--success', ERROR_COLOR: '--error', WHITEXT_COLOR: '--whitetext' };
  Object.entries(map).forEach(([k, v]) => { if (env[k]) root.style.setProperty(v, env[k] as string); });
}

// ─── Panel Toggles ──────────────────────────────────────────────────
function toggleLeft(): void {
  document.body.classList.toggle('left-collapsed');
}

function openRight(): void {
  document.getElementById('right-panel')!.classList.add('open');
  document.body.classList.add('right-open');
}

function closeRight(): void {
  const panel = document.getElementById('right-panel')!;
  panel.classList.remove('open', 'expanded');
  document.getElementById('rp-expand-btn')!.classList.remove('active');
  document.body.classList.remove('right-open', 'right-expanded');
}

function expandRight(): void {
  const panel = document.getElementById('right-panel')!;
  const btn = document.getElementById('rp-expand-btn')!;
  if (panel.classList.contains('expanded')) {
    panel.classList.remove('expanded');
    btn.classList.remove('active');
    document.body.classList.remove('right-expanded');
    document.body.classList.add('right-open');
  } else {
    panel.classList.add('expanded');
    btn.classList.add('active');
    document.body.classList.remove('right-open');
    document.body.classList.add('right-expanded');
    document.body.classList.add('left-collapsed');
  }
}

// ─── Scan Results Persistence ───────────────────────────────────────
function saveScanResults(screening: Record<string, unknown>): void {
  try {
    sessionStorage.setItem('ats-scan-results', JSON.stringify(screening));
  } catch (e) {
    console.warn('Could not save scan results:', e);
  }
}

function loadScanResults(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem('ats-scan-results');
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.warn('Could not load scan results:', e);
    return null;
  }
}

function clearScanResults(): void {
  try {
    sessionStorage.removeItem('ats-scan-results');
  } catch {
    // ignore
  }
}

// ─── ATS Results UI ─────────────────────────────────────────────────
function applyScanResultsToUI(screening: Record<string, unknown>): void {
  const circle = document.getElementById('rp-score-circle')!;
  circle.textContent = String(screening.overall_score);

  let tierClass = 'low';
  if (screening.tier === 'STRONG_MATCH') tierClass = 'good';
  else if (screening.tier === 'GOOD_MATCH') tierClass = 'mid';
  circle.className = 'result-score-circle ' + tierClass;

  document.getElementById('rp-score-text')!.textContent = screening.tier as string;
  const feedbackEl = document.getElementById('rp-feedback')!;
  feedbackEl.textContent = (screening.feedback as string) || '\u2014';
  feedbackEl.style.color = '';

  const breakdown = screening.breakdown as Record<string, unknown>;
  const elSkills = document.getElementById('br-skills')!;
  const elExp = document.getElementById('br-experience')!;
  const elEdu = document.getElementById('br-education')!;

  elSkills.textContent = `${breakdown.skills_score}%`;
  elExp.textContent = `${breakdown.experience_years_score}%`;
  elEdu.textContent = breakdown.education_match ? 'PASS' : 'FAIL';

  elSkills.style.color = (breakdown.skills_score as number) >= 80 ? '#10b981' : (breakdown.skills_score as number) >= 60 ? '#f59e0b' : '#ef4444';
  elExp.style.color = (breakdown.experience_years_score as number) >= 80 ? '#10b981' : (breakdown.experience_years_score as number) >= 60 ? '#f59e0b' : '#ef4444';
  elEdu.style.color = breakdown.education_match ? '#10b981' : '#ef4444';

  const kwEl = document.getElementById('rp-keywords')!;
  const missingKeywords = screening.missingKeywords as string[] | undefined;
  if (missingKeywords && missingKeywords.length > 0) {
    kwEl.innerHTML = missingKeywords
      .map(k => `<span class="result-keyword">${k}</span>`)
      .join('');
  } else {
    kwEl.textContent = 'None detected \u2014 great match!';
    kwEl.style.color = '#86efac';
  }

  document.getElementById('scan-again-msg')!.style.display = 'none';
  document.getElementById('rp-breakdown-section')!.style.display = 'block';

  openRight();
}

// ─── JD Validation ──────────────────────────────────────────────────
function validateJDInput(): void {
  const btn = document.getElementById('btn-run-scan') as HTMLButtonElement;
  const jd = (document.getElementById('job-description') as HTMLTextAreaElement).value.trim();
  btn.disabled = !jd;
}

function handleScanButtonClick(): void {
  if (scanController) {
    scanController.abort();
    return;
  }
  runAtsScan();
}

async function runAtsScan(): Promise<void> {
  const jd = (document.getElementById('job-description') as HTMLTextAreaElement).value.trim();

  if (!jd) return alert('Please paste a Job Description.');

  const resumeEl = document.getElementById('resume-content');
  let resumeText = resumeEl ? resumeEl.innerText || resumeEl.textContent : '';
  resumeText = resumeText.replace(/\s+/g, ' ').trim();
  if (!resumeText) {
    return alert('No resume content found. Please load a resume first.');
  }

  scanController = new AbortController();
  const signal = scanController.signal;

  const btn = document.getElementById('btn-run-scan') as HTMLButtonElement;
  const textarea = document.getElementById('job-description') as HTMLTextAreaElement;
  const loadingDiv = document.getElementById('left-loading')!;

  clearScanResults();

  textarea.disabled = true;
  loadingDiv.style.display = 'block';

  btn.textContent = 'Cancel Scan';
  btn.style.color = '#ef4444';
  btn.style.borderColor = '#ffffff';
  btn.style.backgroundColor = 'transparent';

  let basePrompt: string;
  try {
    const promptResp = await fetch('/api/prompts/ats-scan.txt');
    basePrompt = await promptResp.text();
  } catch (e) {
    alert('Failed to load ATS prompt. Please refresh the page.');
    throw e;
  }

  const prompt = basePrompt
    .replace('{job_description}', jd)
    .replace('{resume_text}', resumeText);

  const modelErrorMsg = document.getElementById('rp-feedback')!;

  const selectedProvider = localStorage.getItem('selected-ai-provider') || null;

  try {
    const response = await fetch('/api/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: 'You are an ATS resume scorer. Return only valid JSON matching the requested schema.',
        prompt: prompt,
        provider: selectedProvider,
        temperature: 0,
        max_tokens: 2048,
        scope: 'ats',
      }),
      signal: signal,
    });

    if (!response.ok) {
      const errData = await response.json() as { error?: string; suggestion?: string };
      throw new Error(errData.error || errData.suggestion || `HTTP ${response.status}`);
    }

    const data = await response.json() as { text: string; error?: string };
    if (data.error) throw new Error(data.error);

    let raw = data.text;
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    // Extract first JSON object from response — handles preamble text before JSON (e.g. Groq)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      raw = jsonMatch[0];
    }

    const result = JSON.parse(raw) as { ai_screening: Record<string, unknown> };
    const screening = result.ai_screening;

    applyScanResultsToUI(screening);
    saveScanResults(screening);

  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      console.log('Scan cancelled by user.');
    } else {
      modelErrorMsg.textContent = 'API response: ' + (err as Error).message + '.';
      modelErrorMsg.style.color = 'var(--error)';
      openRight();
      console.error(err);
    }
  } finally {
    textarea.disabled = false;
    loadingDiv.style.display = 'none';

    btn.disabled = false;
    btn.textContent = 'ATS Score Check';
    btn.style.color = '#ffffff';
    btn.style.borderColor = 'rgba(255,255,255,0.12)';
    btn.style.backgroundColor = 'var(--static)';
    scanController = null;
  }
}

// ─── HTML Escaping ──────────────────────────────────────────────────
function escHtml(str: string | null | undefined): string {
  if (!str) return '';
  const m: Record<string, number> = { '&': 38, '<': 60, '>': 62, '"': 34, "'": 39 };
  return String(str).replace(/[&<>"']/g, function (c) { return '&#' + m[c] + ';'; });
}

// ─── Photo Path ─────────────────────────────────────────────────────
function getPhotoPath(resumeData: { basics?: { photo?: string } }): string {
  const uploadedPhoto = localStorage.getItem('uploaded-photo');
  if (uploadedPhoto) {
    return uploadedPhoto;
  }
  if (resumeData.basics && resumeData.basics.photo) {
    if (resumeData.basics.photo.includes('/')) {
      return resumeData.basics.photo;
    }
    return `public/assets/photos/${resumeData.basics.photo}`;
  }
  return '/demo/goat.jpg';
}

// ─── Placeholder Data ───────────────────────────────────────────────
const PLACEHOLDER_DATA: Record<string, unknown> = {
  basics: {
    name: 'Your Name',
    title: 'Professional Title',
    email: 'email@example.com',
    phone: '+1 234 567 890',
    location: 'City, Country',
    photo: 'photo.jpg',
    linkedin: '#',
    github: '#',
  },
  summary: 'Write a brief professional summary here. Highlight your years of experience, key skills, and most impressive achievements.',
  experience: [
    {
      title: 'Job Title',
      company: 'Company Name',
      date: 'Start \u2013 End',
      bullets: [
        'Describe your key achievement with measurable impact.',
        'Use action verbs and quantify results where possible.',
        'Focus on what you accomplished, not just what you did.',
      ],
    },
  ],
  skills: {
    'Skill Category': [
      { name: 'Skill Name', expert: true },
      { name: 'Another Skill', expert: false },
    ],
  },
  techStack: 'Describe your experience with the technologies you\'ve work with.',
  languages: [
    { name: 'Language', level: 'Proficiency' },
  ],
  'frameworks/tools': [
    { name: 'Name', level: 'Proficiency' },
  ],
  education: [
    { degree: 'Degree Name', institution: 'Institution', year: 'Year' },
  ],
  talks: [],
  certifications: [],
};

// ─── Resume Renderer ────────────────────────────────────────────────
function renderResume(data?: Record<string, unknown>): void {
  const container = document.getElementById('resume-content')!;
  const d = data || PLACEHOLDER_DATA;
  const b = d.basics as Record<string, string> || {};

  let html = '';

  // Header
  html += '<header class="resume-header">';
  html += '<div class="header-main">';
  html += '<h1>' + escHtml(b.name) + '</h1>';
  html += '<div class="subtitle">' + escHtml(b.title) + '</div>';
  html += '</div>';
  html += '<div class="profile-photo-container">';
  html += '<img src="' + escHtml(getPhotoPath(d as { basics?: { photo?: string } })) + '" alt="' + escHtml(b.name) + '" class="profile-photo" onerror="this.style.display=\'none\';">';
  html += '</div>';
  html += '<div class="contact-info">';
  html += '<p><strong>Email:</strong> ' + escHtml(b.email) + '</p>';
  html += '<p><strong>Phone:</strong> ' + escHtml(b.phone) + '</p>';
  html += '<p><strong>Location:</strong> ' + escHtml(b.location) + '</p>';
  if (b.linkedin && b.linkedin !== '#') {
    html += '<p style="margin-top: 6px;"><a class="cert-link" href="' + escHtml(b.linkedin) + '" target="_blank" rel="noopener noreferrer">LinkedIn profile</a></p>';
  }
  if (b.github && b.github !== '#') {
    html += '<p style="margin-top: 6px;"><a class="cert-link" href="' + escHtml(b.github) + '" target="_blank" rel="noopener noreferrer">GitHub profile</a></p>';
  }
  html += '</div>';
  html += '</header>';

  // Summary
  if (d.summary) {
    html += '<section>';
    html += '<h2 class="section-title">Professional Summary</h2>';
    html += '<p class="summary-text">' + escHtml(d.summary as string) + '</p>';
    html += '</section>';
  }

  // Columns
  html += '<div class="columns-container">';

  // Left Column: Experience
  html += '<main class="left-column">';
  const experience = d.experience as Array<Record<string, unknown>> | undefined;
  if (experience && experience.length > 0) {
    html += '<h2 class="section-title">Work Experience</h2>';
    for (let ei = 0; ei < experience.length; ei++) {
      const exp = experience[ei];
      html += '<div class="experience-item">';
      html += '<div class="exp-header">';
      html += '<div>';
      html += '<div class="exp-title">' + escHtml(exp.title as string) + '</div>';
      html += '<div class="exp-company">' + escHtml(exp.company as string) + '</div>';
      html += '</div>';
      html += '<div class="exp-date">' + escHtml(exp.date as string) + '</div>';
      html += '</div>';
      html += '<ul class="exp-bullets">';
      const bullets = exp.bullets as string[] | undefined;
      if (bullets) {
        for (let bi = 0; bi < bullets.length; bi++) {
          html += '<li>' + escHtml(bullets[bi]) + '</li>';
        }
      }
      html += '</ul>';
      html += '</div>';
    }
  }
  html += '</main>';

  // Right Column: Skills, etc.
  html += '<aside class="right-column">';

  const skills = d.skills as Record<string, Array<{ name: string; expert: boolean }>> | undefined;
  if (skills) {
    const cats = Object.keys(skills);
    for (let ci = 0; ci < cats.length; ci++) {
      const category = cats[ci];
      const skillList = skills[category];
      html += '<h2 class="section-title">' + category + '</h2>';
      html += '<div class="skills-grid">';
      for (let si = 0; si < skillList.length; si++) {
        const skill = skillList[si];
        const cls = skill.expert ? 'skill-badge expert' : 'skill-badge';
        html += '<span class="' + cls + '">' + escHtml(skill.name) + '</span>';
      }
      html += '</div>';
    }
  }

  if (d.techStack) {
    html += '<h2 class="section-title">Tech Stack</h2>';
    html += '<p style="font-size: 12.5px; color: var(--text); margin-bottom: 25px; text-align: justify;">' + (d.techStack as string) + '</p>';
  }

  const languages = d.languages as Array<{ name: string; level: string }> | undefined;
  if (languages && languages.length > 0) {
    html += '<h2 class="section-title">Languages</h2>';
    html += '<div class="meta-item">';
    for (let li = 0; li < languages.length; li++) {
      const lang = languages[li];
      html += '<p><span class="meta-label">' + escHtml(lang.name) + ':</span> ' + escHtml(lang.level) + '</p>';
    }
    html += '</div>';
  }

  const education = d.education as Array<{ degree: string; institution: string; year: string }> | undefined;
  if (education && education.length > 0) {
    html += '<h2 class="section-title">Education</h2>';
    for (let edi = 0; edi < education.length; edi++) {
      const edu = education[edi];
      html += '<div class="meta-item">';
      html += '<p style="font-weight: 700; color: var(--secondary);">' + escHtml(edu.degree) + '</p>';
      html += '<p style="font-size: 12.5px; color: var(--text-light);">' + escHtml(edu.institution) + ' (' + escHtml(edu.year) + ')</p>';
      html += '</div>';
    }
  }

  const talks = d.talks as Array<{ title: string; event: string; url?: string }> | undefined;
  if (talks && talks.length > 0) {
    html += '<h2 class="section-title">Tech Talks</h2>';
    for (let ti = 0; ti < talks.length; ti++) {
      const talk = talks[ti];
      html += '<div class="meta-item">';
      html += '<p style="font-weight: 700; color: var(--secondary); font-size: 13px;">' + escHtml(talk.title) + '</p>';
      html += '<p style="font-size: 12.5px; color: var(--text-light); margin-top: 4px;">' + escHtml(talk.event) + '</p>';
      if (talk.url) {
        html += '<p style="margin-top: 6px;"><a class="cert-link" href="' + escHtml(talk.url) + '" target="_blank" rel="noopener noreferrer">Watch recording</a></p>';
      }
      html += '</div>';
    }
  }

  const certifications = d.certifications as Array<{ title: string; issuer: string; date: string; duration?: string; url?: string }> | undefined;
  if (certifications && certifications.length > 0) {
    html += '<h2 class="section-title">Certifications</h2>';
    for (let ci2 = 0; ci2 < certifications.length; ci2++) {
      const cert = certifications[ci2];
      html += '<div class="meta-item">';
      html += '<p style="font-weight: 700; color: var(--secondary);">' + escHtml(cert.title) + '</p>';
      let certMeta = escHtml(cert.issuer) + ' \u00b7 ' + escHtml(cert.date);
      if (cert.duration) certMeta += ' \u00b7 ' + escHtml(cert.duration);
      html += '<p style="font-size: 12.5px; color: var(--text-light);">' + certMeta + '</p>';
      if (cert.url) {
        html += '<p style="margin-top: 4px;"><a class="cert-link" href="' + escHtml(cert.url) + '" target="_blank" rel="noopener noreferrer">Verify certificate</a></p>';
      }
      html += '</div>';
    }
  }

  html += '</aside>';
  html += '</div>';

  container.innerHTML = html;
}

// ─── Resume Data Loading ────────────────────────────────────────────
async function loadResumeData(): Promise<void> {
  const priorities = [
    '/src/resume/output/resume-data-AI-polished.json',
    '/src/resume/output/resume-data.json',
    '/demo/resume-demo-data.json',
  ];

  const hasGeneratedResume = localStorage.getItem('resume-data') !== null;

  for (const filePath of priorities) {
    try {
      const resp = await fetch(filePath);
      if (resp.ok) {
        const data = await resp.json() as Record<string, unknown>;
        renderResume(data);
        currentDataSource = (hasGeneratedResume && !filePath.includes('demo-data')) ? 'generated' : 'demo';
        updatePolishButton();
        return;
      }
    } catch {
      continue;
    }
  }

  currentDataSource = 'placeholder';
  renderResume(PLACEHOLDER_DATA);
  updatePolishButton();
}

// ─── Polish Button Management ───────────────────────────────────────
async function updatePolishButton(): Promise<void> {
  const dropdownBtn = document.getElementById('btn-polish-dropdown') as HTMLElement;
  const rollbackBtn = document.getElementById('btn-rollback-dropdown') as HTMLElement;
  const photoBtn = document.getElementById('btn-photo-upload-dropdown') as HTMLElement;
  const actionsTrigger = document.getElementById('actions-trigger') as HTMLElement;
  if (!dropdownBtn) return;

  if (photoBtn) {
    photoBtn.style.display = currentDataSource === 'placeholder' ? 'none' : 'block';
  }

  if (currentDataSource !== 'generated') {
    dropdownBtn.style.display = 'none';
    if (rollbackBtn) rollbackBtn.style.display = 'none';
    dropdownBtn.classList.remove('ai-available');
    if (actionsTrigger) actionsTrigger.classList.remove('ai-available');
    return;
  }

  try {
    const polishedResp = await fetch('/src/resume/output/resume-data-AI-polished.json');
    const hasPolished = polishedResp.ok;

    

    if (hasPolished) {
      dropdownBtn.style.display = 'none';
      if (rollbackBtn) rollbackBtn.style.display = 'block';
      dropdownBtn.classList.remove('ai-available');
      if (actionsTrigger) actionsTrigger.classList.remove('ai-available');
    } else {
      dropdownBtn.style.display = 'block';
      if (rollbackBtn) rollbackBtn.style.display = 'none';
      dropdownBtn.classList.add('ai-available');
      if (actionsTrigger) actionsTrigger.classList.add('ai-available');
    }
  } catch {
    dropdownBtn.style.display = 'block';
    if (rollbackBtn) rollbackBtn.style.display = 'none';
    dropdownBtn.classList.add('ai-available');
    if (actionsTrigger) actionsTrigger.classList.add('ai-available');
  }
}

function showRefreshMessage(): void {
  const msg = document.getElementById('refresh-message')!;
  msg.textContent = 'Applying changes . . .';
  msg.style.display = 'block';

  setTimeout(() => {
    msg.style.display = 'none';
  }, 2000);
}

// ─── Polish Resume ──────────────────────────────────────────────────
async function polishResume(): Promise<void> {
  const dropdownBtn = document.getElementById('btn-polish-dropdown') as HTMLButtonElement;
  if (dropdownBtn.disabled) return;

  dropdownBtn.disabled = true;
  document.getElementById('polish-overlay')!.style.display = 'flex';

  polishController = new AbortController();
  const signal = polishController.signal;

  try {
    const resp = await fetch('/src/resume/output/resume-data.json', { signal });
    if (!resp.ok) throw new Error('No resume data to polish');

    const resumeData = await resp.json() as Record<string, unknown>;

    const resumeDataForPolish = JSON.parse(JSON.stringify(resumeData)) as Record<string, unknown>;
    const basics = resumeDataForPolish.basics as Record<string, unknown> | undefined;
    if (basics) {
      basics.photo = '';
    }

    const selectedProvider = localStorage.getItem('selected-ai-provider') || null;

    const polishResp = await fetch('/api/polish-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeData: resumeDataForPolish,
        provider: selectedProvider,
        scope: 'polish',
      }),
      signal: signal,
    });

    if (!polishResp.ok) {
      const errorData = await polishResp.json().catch(() => ({ error: 'Polish API failed' }));
      throw new Error(errorData.error || 'Polish API failed');
    }

    const polishedData = await polishResp.json() as Record<string, unknown>;

    const origBasics = resumeData.basics as Record<string, unknown> | undefined;
    if (origBasics && origBasics.photo) {
      const pBasics = polishedData.basics as Record<string, unknown> || {};
      pBasics.photo = origBasics.photo;
      polishedData.basics = pBasics;
    }

    await fetch('/api/save-polished', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(polishedData),
    });

    

    showRefreshMessage();
    document.getElementById('polish-overlay')!.style.display = 'none';
    setTimeout(async () => {
      await loadResumeData();
      updatePolishButton();
    }, 1000);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      console.log('Polish cancelled by user.');
    } else {
      document.getElementById('polish-overlay')!.style.display = 'none';
      alert('Polish failed: ' + (err as Error).message);
    }
    updatePolishButton();
    const dropdownBtnAfter = document.getElementById('btn-polish-dropdown') as HTMLButtonElement;
    dropdownBtnAfter.disabled = false;
  } finally {
    polishController = null;
  }
}

function cancelPolish(): void {
  if (polishController) {
    polishController.abort();
    polishController = null;
  }
  document.getElementById('polish-overlay')!.style.display = 'none';
  const dropdownBtn = document.getElementById('btn-polish-dropdown') as HTMLButtonElement;
  dropdownBtn.disabled = false;
  updatePolishButton();
}

async function rollbackPolish(): Promise<void> {
  try {
    await fetch('/api/rollback', { method: 'POST' });
    showRefreshMessage();
    setTimeout(async () => {
      const dropdownBtn = document.getElementById('btn-polish-dropdown') as HTMLButtonElement;
      dropdownBtn.disabled = false;
      await loadResumeData();
    }, 1000);
  } catch (err: unknown) {
    alert('Rollback failed: ' + (err as Error).message);
  }
}

// ─── Actions Dropdown ───────────────────────────────────────────────
function toggleActions(): void {
  const dropdown = document.getElementById('actions-dropdown')!;
  const trigger = document.getElementById('actions-trigger')!;
  if (!dropdown || !trigger) return;

  const isHidden = dropdown.classList.contains('hidden');
  dropdown.classList.toggle('hidden', !isHidden);
  trigger.setAttribute('aria-expanded', String(isHidden));

  const label = trigger.querySelector('.actions-label');
  if (label) label.textContent = isHidden ? 'Actions \u25B4' : 'Actions \u25BE';
}

document.addEventListener('click', (e: MouseEvent) => {
  const dropdown = document.getElementById('actions-dropdown')!;
  const trigger = document.getElementById('actions-trigger')!;
  if (!dropdown || !trigger || dropdown.classList.contains('hidden')) return;

  if (!dropdown.contains(e.target as Node) && !trigger.contains(e.target as Node)) {
    dropdown.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    // Check all modals/overlays first — highest z-index elements should close first
    const providersModal = document.getElementById('providers-modal');
    if (providersModal && providersModal.style.display === 'flex') {
      closeProvidersModal();
      return;
    }
    const polishOverlay = document.getElementById('polish-overlay');
    if (polishOverlay && polishOverlay.style.display === 'flex') {
      cancelPolish();
      return;
    }
    const photoModal = document.getElementById('photo-upload-modal');
    if (photoModal && photoModal.style.display === 'flex') {
      closePhotoUploadModal();
      return;
    }
    const modal = document.getElementById('ai-modal');
    if (modal && modal.style.display === 'flex') {
      closeAIModal();
      return;
    }
    // Only close the actions dropdown if no modal/overlay is open
    const dropdown = document.getElementById('actions-dropdown')!;
    const trigger = document.getElementById('actions-trigger')!;
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  }
});

// ─── AI Modal Functions ─────────────────────────────────────────────
function openAIModal(): void {
  document.getElementById('ai-modal')!.style.display = 'flex';
  document.getElementById('modal-upload-section')!.style.display = 'block';
  document.getElementById('modal-error-section')!.style.display = 'none';
  document.getElementById('modal-file-name')!.style.display = 'none';
  document.getElementById('modal-actions')!.style.display = 'none';
  document.getElementById('modal-loading')!.style.display = 'none';
  (document.getElementById('btn-generate') as HTMLElement).style.display = 'none';
  currentPDFText = '';
  currentPDFFileName = '';
  
}

function closeAIModal(): void {
  if (generationController) {
    generationController.abort();
    generationController = null;
  }
  document.getElementById('ai-modal')!.style.display = 'none';
  (document.getElementById('pdf-input') as HTMLInputElement).value = '';
}

async function handlePDFUpload(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (!file) {
    showModalError('Please select a PDF file to upload.');
    return;
  }
  currentPDFFileName = file.name;

  if (file.type !== 'application/pdf') {
    showModalError('Please upload a PDF file');
    return;
  }

  document.getElementById('modal-upload-section')!.style.display = 'none';
  document.getElementById('modal-loading')!.style.display = 'block';
  document.getElementById('modal-actions')!.style.display = 'none';

  const formData = new FormData();
  formData.append('pdf', file);

  try {
    const response = await fetch('/api/parse-resume-pdf', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json() as { error?: string; textPreview?: string; text?: string; message?: string };

    if (data.error === 'PDF_TOO_LARGE') {
      
      currentPDFText = data.textPreview || '';

      document.getElementById('modal-loading')!.style.display = 'none';
      document.getElementById('modal-error-section')!.style.display = 'block';
      document.getElementById('modal-error-text')!.textContent = data.message || '';
      (document.getElementById('btn-continue-anyway') as HTMLElement).style.display = 'block';
      (document.getElementById('btn-generate') as HTMLElement).style.display = 'none';
      document.getElementById('modal-file-name')!.textContent = 'File: ' + currentPDFFileName;
      document.getElementById('modal-file-name')!.style.display = 'block';
      document.getElementById('modal-actions')!.style.display = 'flex';
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || 'Failed to parse PDF');
    }

    currentPDFText = data.text || '';

    document.getElementById('modal-loading')!.style.display = 'none';
    (document.getElementById('btn-generate') as HTMLElement).style.display = 'block';
    document.getElementById('modal-file-name')!.textContent = 'File: ' + currentPDFFileName;
    document.getElementById('modal-file-name')!.style.display = 'block';
    document.getElementById('modal-actions')!.style.display = 'flex';
  } catch (err: unknown) {
    document.getElementById('modal-loading')!.style.display = 'none';
    showModalError('Error: ' + (err as Error).message);
  }
}

function showModalError(message: string): void {
  document.getElementById('modal-upload-section')!.style.display = 'none';
  document.getElementById('modal-loading')!.style.display = 'none';
  document.getElementById('modal-error-section')!.style.display = 'block';
  document.getElementById('modal-error-text')!.textContent = message;
  (document.getElementById('btn-continue-anyway') as HTMLElement).style.display = 'none';
  (document.getElementById('btn-generate') as HTMLElement).style.display = 'none';
  document.getElementById('modal-file-name')!.style.display = 'none';
  document.getElementById('modal-actions')!.style.display = 'flex';
}

// function extractNameFromPDFText(text: string): string | null {
//   if (!text) return null;
//   const lines = text.split('\n');
//   for (let i = 0; i < lines.length; i++) {
//     const line = lines[i].trim();
//     if (!line || line.length < 3 || line.length > 60) continue;
//     if (/^(email|phone|location|linkedin|github|http|www|@)/i.test(line)) continue;
//     const words = line.split(/\s+/);
//     if (words.length >= 2 && words.length <= 4) {
//       if (/^[a-zA-ZÀ-ÿñÑ'. -]+$/.test(line) && !/\d/.test(line)) {
//         return line;
//       }
//     }
//   }
//   return null;
// }

function extractNameFromPDFText(text: string): string | null {
  if (!text) return null;
  
  const lines = text.split('\n');
  const headerBlacklist = /^(summary|professional summary|profile|experience|work experience|education|skills|certifications|contact|about|objective|languages)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line.length < 3 || line.length > 60) continue;
    if (/^(email|phone|location|linkedin|github|http|www|@)/i.test(line)) continue;
    if (headerBlacklist.test(line)) continue;
    if (line === line.toUpperCase() && /[A-Z]/.test(line)) continue;

    const words = line.split(/\s+/);

    if (words.length >= 2 && words.length <= 4) {
      if (/^[a-zA-ZÀ-ÿñÑ'. -]+$/.test(line) && !/\d/.test(line)) {
        const isLikelyName = words.every(word => {
          const firstChar = word.charAt(0);
          return (
            firstChar === firstChar.toUpperCase() || 
            /^(de|del|la|las|los|y)$/i.test(word)
          );
        });

        if (isLikelyName) {
          return line;
        }
      }
    }
  }
  return null;
}

async function confirmGeneration(): Promise<void> {
  document.getElementById('modal-error-section')!.style.display = 'none';
  document.getElementById('modal-actions')!.style.display = 'none';
  document.getElementById('modal-loading')!.style.display = 'block';

  generationController = new AbortController();
  const signal = generationController.signal;

  let extractionPrompt: string;
  try {
    const promptResp = await fetch('/api/prompts/extraction.txt');
    extractionPrompt = await promptResp.text();
  } catch (e) {
    alert('Failed to load extraction prompt. Please refresh the page.');
    throw e;
  }
  extractionPrompt = extractionPrompt.replace('{extracted_text}', currentPDFText);

  const selectedProvider = localStorage.getItem('selected-ai-provider') || null;

  try {
    const response = await fetch('/api/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: 'You are a resume generation assistant. Return only valid JSON matching the resume schema.',
        prompt: extractionPrompt,
        provider: selectedProvider,
        scope: 'generate',
      }),
      signal: signal,
    });

    if (!response.ok) {
      const errData = await response.json() as { error?: string; suggestion?: string };
      throw new Error(errData.error || errData.suggestion || `HTTP ${response.status}`);
    }

    const data = await response.json() as { text: string; error?: string };
    if (data.error) throw new Error(data.error);

    let raw = data.text;
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    const resumeData = JSON.parse(raw) as Record<string, unknown>;

    const hallucinatedNames = ['john doe', 'jane doe', 'alex johnson', 'your name', 'candidate', 'todo'];

    const expectedName = extractNameFromPDFText(currentPDFText);
    const basics = resumeData.basics as Record<string, unknown> | undefined;
    const outputNameRaw = (basics && basics.name) as string || '';

    if (outputNameRaw) {
      const outputLower = outputNameRaw.toLowerCase().trim();

      const isHallucinated = hallucinatedNames.some(function (p) {
        return outputLower === p || outputLower.includes(p);
      });
      if (isHallucinated) {
        const errMsg = 'AI returned hallucinated name "' + outputNameRaw + '". Generation aborted.';
        console.error(errMsg);
        alert(errMsg);
        closeAIModal();
        return;
      }

      if (expectedName) {
        const expectedLower = expectedName.toLowerCase().trim();
        if (!outputLower.includes(expectedLower) && !expectedLower.includes(outputLower)) {
          const expectedWords = expectedLower.split(/\s+/).filter(function (w) { return w.length > 2; });
          const outputWords = outputLower.split(/\s+/);
          const hasOverlap = expectedWords.some(function (w) {
            return outputWords.indexOf(w) > -1;
          });
          if (!hasOverlap) {
            const errMsg = 'AI generated resume for wrong person: "' + outputNameRaw + '" instead of "' + expectedName + '". Generation aborted.';
            console.error(errMsg);
            alert(errMsg);
            closeAIModal();
            return;
          }
        }
      }
    } else if (expectedName) {
      console.warn('AI returned empty name. Using expected name "' + expectedName + '".');
      if (!basics) {
        (resumeData as Record<string, unknown>).basics = {};
      }
      ((resumeData as Record<string, unknown>).basics as Record<string, unknown>).name = expectedName;
    }

    try {
      await fetch('/api/save-resume-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resumeData),
      });
    } catch (saveErr) {
      console.warn('Could not save resume to server:', saveErr);
    }

    renderResume(resumeData);
    closeAIModal();
    openPhotoUploadModal();
    localStorage.setItem('resume-data', JSON.stringify(resumeData));
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      console.log('Generation cancelled by user.');
    } else {
      alert('Error generating resume: ' + (err as Error).message);
      console.error(err);
    }
    closeAIModal();
  }
}

// ─── Photo Upload Modal Functions ───────────────────────────────────
function openPhotoUploadModal(): void {
  document.getElementById('photo-upload-modal')!.style.display = 'flex';
  document.getElementById('photo-upload-section')!.style.display = 'block';
  document.getElementById('photo-upload-error')!.style.display = 'none';
  document.getElementById('photo-upload-file-name')!.style.display = 'none';
  document.getElementById('photo-upload-actions')!.style.display = 'none';
  document.getElementById('photo-upload-loading')!.style.display = 'none';
  (document.getElementById('photo-upload-confirm') as HTMLElement).style.display = 'none';
  currentPhotoDataURL = null;
}

function closePhotoUploadModal(): void {
  document.getElementById('photo-upload-modal')!.style.display = 'none';
  (document.getElementById('photo-input') as HTMLInputElement).value = '';
}

function showPhotoModalError(message: string): void {
  document.getElementById('photo-upload-section')!.style.display = 'block';
  document.getElementById('photo-upload-error')!.style.display = 'block';
  document.getElementById('photo-upload-error-text')!.textContent = message;
  (document.getElementById('photo-upload-confirm') as HTMLElement).style.display = 'none';
  document.getElementById('photo-upload-file-name')!.style.display = 'none';
  document.getElementById('photo-upload-actions')!.style.display = 'none';
  document.getElementById('photo-upload-loading')!.style.display = 'none';
}

function handlePhotoUpload(input: HTMLInputElement): void {
  const file = input.files?.[0];
  if (!file) {
    showPhotoModalError('Please select an image file to upload. Please try again with a different photo.');
    return;
  }

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!validTypes.includes(file.type)) {
    showPhotoModalError('Invalid file type. Please upload a JPEG, JPG or PNG image. Please try again with a different photo.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e: ProgressEvent<FileReader>) {
    const img = new Image();
    img.onload = function () {
      currentPhotoDataURL = e.target?.result as string;

      document.getElementById('photo-upload-section')!.style.display = 'none';
      document.getElementById('photo-upload-file-name')!.textContent = 'File: ' + file.name;
      document.getElementById('photo-upload-file-name')!.style.display = 'block';
      document.getElementById('photo-upload-actions')!.style.display = 'flex';
      (document.getElementById('photo-upload-confirm') as HTMLElement).style.display = 'block';
      document.getElementById('photo-upload-error')!.style.display = 'none';
    };
    img.onerror = function () {
      showPhotoModalError('Failed to load image. The file may be corrupted. Please try again with a different photo.');
    };
    img.src = e.target?.result as string;
  };
  reader.onerror = function () {
    showPhotoModalError('Error reading file. Please try again with a different photo.');
  };
  reader.readAsDataURL(file);
}

function confirmPhotoUpload(): void {
  if (!currentPhotoDataURL) return;

  const resumeDataStr = localStorage.getItem('resume-data');
  if (resumeDataStr) {
    try {
      const resumeData = JSON.parse(resumeDataStr) as Record<string, unknown>;
      if (!resumeData.basics) resumeData.basics = {};
      (resumeData.basics as Record<string, unknown>).photo = currentPhotoDataURL;
      localStorage.setItem('resume-data', JSON.stringify(resumeData));
      localStorage.setItem('uploaded-photo', currentPhotoDataURL);
      renderResume(resumeData);

      fetch('/api/save-resume-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resumeData),
      }).catch(saveErr => {
        console.warn('Could not save resume to server:', saveErr);
      });
    } catch (e) {
      console.error('Error updating resume with photo:', e);
    }
  }

  closePhotoUploadModal();
}

// ─── AI Providers Modal Functions ───────────────────────────────────
async function openProvidersModal(): Promise<void> {
  const modal = document.getElementById('providers-modal');
  if (!modal) return;

  const env = await loadEnv();
  const currentSelected = localStorage.getItem('selected-ai-provider') || (env.primaryProvider as string) || null;
  selectedProviderForModal = currentSelected;
  renderProvidersList((env.availableProviders as string[]) || [], (env.primaryProvider as string) || null);

  modal.style.display = 'flex';
  document.getElementById('providers-modal-actions')!.style.display = 'flex';
}

function closeProvidersModal(): void {
  const modal = document.getElementById('providers-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function renderProvidersList(providers: string[], selectedProvider: string | null): void {
  const listEl = document.getElementById('providers-list');
  if (!listEl) return;

  const providerIcons: Record<string, string> = {
    cohere: '/public/assets/cohere_icon.png',
    mistral: '/public/assets/mistral_icon.png',
    gemini: '/public/assets/gemini_icon.png',
    groq: '/public/assets/groq_icon.png',
    default: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ctext y="1em" font-size="20"%3E\uD83E\uDD16%3C/text%3E%3C/svg%3E',
  };

  const providerModels: Record<string, string> = {
    cohere: 'command-a-reasoning-08-2025-08-2024',
    mistral: 'codestral-2508',
    gemini: 'gemini-3.6-flash',
    groq: 'openai/gpt-oss-120b',
    default: 'Unknown model',
  };

  const providerDescriptions: Record<string, string> = {
    cohere: 'Balanced performance, strong for general tasks',
    mistral: 'Fast, multilingual, great for reasoning',
    gemini: 'Google\'s latest model, vision capable',
    groq: 'Ultra-fast inference, Llama architecture',
    default: 'AI provider for resume generation',
  };

  const currentSelected = localStorage.getItem('selected-ai-provider') || selectedProvider;

  listEl.innerHTML = providers.map(provider => {
    const isSelected = provider === currentSelected;
    const icon = escHtml(providerIcons[provider] || providerIcons.default);
    const model = escHtml(providerModels[provider] || providerModels.default);
    const desc = escHtml(providerDescriptions[provider] || providerDescriptions.default);
    const displayName = escHtml(provider.charAt(0).toUpperCase() + provider.slice(1));
    const escapedProvider = escHtml(provider);
    return '<div class="provider-item" data-provider="' + escapedProvider + '" onclick="selectProviderInModal(\'' + escapedProvider + '\')">' +
      '<input type="checkbox" class="provider-checkbox" ' + (isSelected ? 'checked' : '') + ' onclick="handleProviderCheckboxClick(event, \'' + escapedProvider + '\')">' +
      '<div class="provider-header">' +
      '<img src="' + icon + '" alt="' + escapedProvider + '" class="provider-img" onerror="this.style.display=\'none\'">' +
      '<span class="provider-name">' + displayName + '</span>' +
      '</div>' +
      '<div class="provider-model">' + model + '</div>' +
      '<div class="provider-description">' + desc + '</div>' +
      '</div>';
  }).join('');

  setTimeout(() => {
    document.querySelectorAll('.provider-item').forEach(item => {
      if ((item as HTMLElement).dataset.provider === currentSelected) {
        item.classList.add('selected');
      }
    });
  }, 0);
}

function handleProviderCheckboxClick(event: Event, provider: string): void {
  event.stopPropagation();
  selectProviderInModal(provider);
}

function selectProviderInModal(provider: string): void {
  selectedProviderForModal = provider;
  const items = document.querySelectorAll('.provider-item');
  items.forEach(item => {
    item.classList.remove('selected');
    const checkbox = item.querySelector('.provider-checkbox') as HTMLInputElement;
    if (checkbox) checkbox.checked = false;
  });
  const selected = document.querySelector('.provider-item[data-provider="' + provider + '"]') as HTMLElement;
  if (selected) {
    selected.classList.add('selected');
    const checkbox = selected.querySelector('.provider-checkbox') as HTMLInputElement;
    if (checkbox) checkbox.checked = true;
  }
}

function confirmProvidersSelection(): void {
  if (selectedProviderForModal) {
    localStorage.setItem('selected-ai-provider', selectedProviderForModal);
  }
  closeProvidersModal();
}

function cancelProvidersSelection(): void {
  closeProvidersModal();
}

// ─── Drag & Drop Handlers ───────────────────────────────────────────
const modal = document.getElementById('ai-modal');
if (modal) {
  modal.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  });

  modal.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type === 'application/pdf') {
      const input = document.getElementById('pdf-input') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handlePDFUpload(input);
    }
  });
}

const photoModal = document.getElementById('photo-upload-modal');
if (photoModal) {
  photoModal.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  });

  photoModal.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/jpg' || file.type === 'image/png')) {
      const input = document.getElementById('photo-input') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handlePhotoUpload(input);
    } else {
      showPhotoModalError('Please upload a JPEG, JPG or PNG image file.');
    }
  });
}

// ─── Init ───────────────────────────────────────────────────────────
(async function () {
  const env = await loadEnv();
  applyColors(env);

  const storedData = localStorage.getItem('resume-data');
  if (storedData) {
    try {
      const data = JSON.parse(storedData) as Record<string, unknown>;
      renderResume(data);
      currentDataSource = 'generated';
      updatePolishButton();
    } catch {
      await loadResumeData();
    }
  } else {
    await loadResumeData();
  }

  const savedScan = loadScanResults();
  if (savedScan) {
    applyScanResultsToUI(savedScan);
  }

  await refreshScrapingResultsButton();
})();

// ─── Job Scraper UI Logic ───────────────────────────────────────────
async function openJobScraperModal(): Promise<void> {
  const dropdown = document.getElementById('actions-dropdown');
  if (dropdown) dropdown.classList.add('hidden');

  const modal = document.getElementById('job-scraper-modal');
  if (modal) modal.style.display = 'flex';

  switchScraperPlatform('linkedin');
  updateQueryPreview();
  await refreshScrapingResultsButton();
}

function closeJobScraperModal(): void {
  const modal = document.getElementById('job-scraper-modal');
  if (modal) modal.style.display = 'none';
}

function switchScraperPlatform(platform: 'linkedin' | 'google'): void {
  currentScraperPlatform = platform;
  const btnLinkedin = document.getElementById('toggle-platform-linkedin');
  const btnGoogle = document.getElementById('toggle-platform-google');
  const googleSection = document.getElementById('google-domains-section');

  if (platform === 'linkedin') {
    if (btnLinkedin) {
      btnLinkedin.style.background = 'var(--accent)';
      btnLinkedin.style.color = '#fff';
    }
    if (btnGoogle) {
      btnGoogle.style.background = 'transparent';
      btnGoogle.style.color = 'rgba(255,255,255,0.7)';
    }
    if (googleSection) googleSection.style.display = 'none';
  } else {
    if (btnGoogle) {
      btnGoogle.style.background = 'var(--accent)';
      btnGoogle.style.color = '#fff';
    }
    if (btnLinkedin) {
      btnLinkedin.style.background = 'transparent';
      btnLinkedin.style.color = 'rgba(255,255,255,0.7)';
    }
    if (googleSection) googleSection.style.display = 'block';
  }

  updateQueryPreview();
}

function updateQueryPreview(): string {
  const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
  const seniority = (document.getElementById('scraper-seniority') as HTMLInputElement)?.value.trim() || '';
  const stack = (document.getElementById('scraper-stack') as HTMLInputElement)?.value.trim() || '';
  const employment = (document.getElementById('scraper-employment') as HTMLSelectElement)?.value || '';
  const country = (document.getElementById('scraper-country') as HTMLInputElement)?.value.trim() || '';
  const region = (document.getElementById('scraper-region') as HTMLSelectElement)?.value || '';
  const currency = (document.getElementById('scraper-currency') as HTMLSelectElement)?.value || '';

  let generatedUrl = '';

  if (currentScraperPlatform === 'linkedin') {
    const parts: string[] = [];
    if (role) parts.push(role);
    if (seniority) parts.push(seniority);
    if (stack) parts.push(stack);
    if (employment) parts.push(employment);
    if (country) parts.push(country);
    if (region) parts.push(region);
    if (currency) parts.push(currency);

    const q = parts.join(' ');
    generatedUrl = `https://www.linkedin.com/jobs/search-results/?keywords=${encodeURIComponent(q)}`;
  } else {
    const parts: string[] = [];
    if (role) parts.push(`"${role}"`);
    if (seniority) parts.push(seniority);
    if (stack) parts.push(stack);
    if (employment) parts.push(employment);

    const checkedBoxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:checked')) as HTMLInputElement[];
    const domains = checkedBoxes.map(cb => cb.value.trim()).filter(Boolean);

    if (domains.length > 0) {
      const siteQuery = domains.map(d => `site:${d}`).join(' OR ');
      parts.push(`(${siteQuery})`);
      parts.push('("careers" OR "jobs" OR "open positions" OR "hiring")');
    }

    // Combine country and region into a single quoted group for Google
    const locationParts: string[] = [];
    if (region) locationParts.push(region);
    if (country) locationParts.push(country);
    if (locationParts.length > 0) {
      parts.push(`("${locationParts.join('" OR "')}")`);
    }

    if (currency) parts.push(currency);

    const q = parts.join(' ');
    generatedUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  const previewElem = document.getElementById('query-url-preview');
  if (previewElem) {
    previewElem.textContent = generatedUrl;
  }

  return generatedUrl;
}

function toggleAllDomains(master: HTMLInputElement): void {
  const checkboxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:not(#select-all-domains)')) as HTMLInputElement[];
  checkboxes.forEach(cb => { cb.checked = master.checked; });
  updateQueryPreview();
}

function addCustomDomain(): void {
  const input = document.getElementById('custom-domain-input') as HTMLInputElement;
  if (!input) return;
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!val) return;

  const checklist = document.getElementById('domains-checklist');
  if (checklist) {
    const label = document.createElement('label');
    label.style.fontSize = '12px';
    label.style.color = '#ddd';
    label.style.cursor = 'pointer';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = val;
    cb.checked = true;
    cb.onchange = () => updateQueryPreview();

    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${val}`));
    checklist.appendChild(label);
  }

  input.value = '';
  updateQueryPreview();
}

function copyQueryToClipboard(): void {
  const url = updateQueryPreview();
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('btn-try-yourself');
    if (btn) {
      const origText = btn.innerHTML;
      btn.innerHTML = '✓ Copied!';
      setTimeout(() => {
        btn.innerHTML = origText;
      }, 2000);
    }
  });
}

async function startScraping(): Promise<void> {
  const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
  const seniority = (document.getElementById('scraper-seniority') as HTMLInputElement)?.value.trim() || '';
  const stack = (document.getElementById('scraper-stack') as HTMLInputElement)?.value.trim() || '';
  const employmentType = (document.getElementById('scraper-employment') as HTMLSelectElement)?.value || '';
  const country = (document.getElementById('scraper-country') as HTMLInputElement)?.value.trim() || '';
  const region = (document.getElementById('scraper-region') as HTMLSelectElement)?.value || '';
  const currency = (document.getElementById('scraper-currency') as HTMLSelectElement)?.value || '';

  const checkedBoxes = Array.from(document.querySelectorAll('#domains-checklist input[type="checkbox"]:checked')) as HTMLInputElement[];
  const customDomains = currentScraperPlatform === 'google' ? checkedBoxes.map(cb => cb.value.trim()).filter(Boolean) : undefined;

  const queryPayload = {
    source: currentScraperPlatform,
    role,
    seniority,
    stack,
    employmentType,
    country,
    region,
    currency,
    customDomains,
  };

  closeJobScraperModal();

  const targetUrl = `/public/results.html?source=${currentScraperPlatform}&loading=true`;
  scraperResultsWindow = window.open(targetUrl, '_blank');

  const overlay = document.getElementById('scraper-overlay');
  const label = document.getElementById('scraper-source-label');
  const fallbackBtn = document.getElementById('btn-open-results-fallback');
  if (label) label.textContent = currentScraperPlatform === 'linkedin' ? 'LinkedIn' : 'Google';
  if (fallbackBtn) fallbackBtn.style.display = 'none';
  if (overlay) overlay.style.display = 'flex';

  scraperController = new AbortController();

  try {
    const resp = await fetch('/api/scraper/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryPayload),
      signal: scraperController.signal,
    });

    if (!resp.ok) {
      if (overlay) overlay.style.display = 'none';
      const err = await resp.json();
      alert(`Scraper error: ${err.error || 'Failed to execute scraper'}`);
      return;
    }

    const data = await resp.json();
    sessionStorage.setItem('scraper-results', JSON.stringify(data));
    localStorage.setItem(getScraperResultsStorageKey(currentScraperPlatform), JSON.stringify(data));
    refreshScrapingResultsButton();

    if (scraperResultsWindow && !scraperResultsWindow.closed) {
      scraperResultsWindow.location.href = `/public/results.html?source=${currentScraperPlatform}`;
      if (overlay) overlay.style.display = 'none';
    } else {
      if (fallbackBtn) fallbackBtn.style.display = 'inline-block';
    }
  } catch (err: unknown) {
    if (overlay) overlay.style.display = 'none';
    if ((err as Error).name !== 'AbortError') {
      alert(`Scraping error: ${(err as Error).message}`);
    }
  }
}

function openResultsTabFromOverlay(): void {
  const overlay = document.getElementById('scraper-overlay');
  if (overlay) overlay.style.display = 'none';
  scraperResultsWindow = window.open(`/public/results.html?source=${currentScraperPlatform}`, '_blank');
}

async function refreshScrapingResultsButton(): Promise<void> {
  const btn = document.getElementById('btn-open-scraping-results');
  if (!btn) return;

  const hasResults = await hasSavedScraperResults();
  btn.style.display = hasResults ? 'block' : 'none';
}

async function hasSavedScraperResults(): Promise<boolean> {
  const sources: Array<'linkedin' | 'google'> = ['linkedin', 'google'];
  // First check localStorage (results from current session)
  for (const source of sources) {
    const savedRaw = localStorage.getItem(getScraperResultsStorageKey(source));
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw);
        if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
          return true;
        }
      } catch {
        // ignore malformed local cache values
      }
    }
  }
  // Then check server for existing result files on disk
  for (const source of sources) {
    try {
      const resp = await fetch(`/api/scraper/results?source=${source}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          // Cache in localStorage for future checks
          localStorage.setItem(getScraperResultsStorageKey(source), JSON.stringify(data));
          return true;
        }
      }
    } catch {
      // ignore network errors
    }
  }
  return false;
}

function openLatestScrapingResults(): void {
  const sources: Array<'linkedin' | 'google'> = ['linkedin', 'google'];
  for (const source of sources) {
    const savedRaw = localStorage.getItem(getScraperResultsStorageKey(source));
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw);
        if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
          const target = `/public/results.html?source=${source}`;
          scraperResultsWindow = window.open(target, '_blank');
          if (scraperResultsWindow && !scraperResultsWindow.closed) {
            return;
          }
        }
      } catch {
        // ignore malformed local cache values
      }
    }
  }

  const fallbackTarget = '/public/results.html?source=linkedin';
  scraperResultsWindow = window.open(fallbackTarget, '_blank');
}

function cancelScraping(): void {
  if (scraperController) {
    scraperController.abort();
    scraperController = null;
  }
  const overlay = document.getElementById('scraper-overlay');
  if (overlay) overlay.style.display = 'none';
}

// Global Escape Key Listener for Modals & Overlays
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    const scraperModal = document.getElementById('job-scraper-modal');
    if (scraperModal && scraperModal.style.display !== 'none') {
      closeJobScraperModal();
      return;
    }

    const scraperOverlay = document.getElementById('scraper-overlay');
    if (scraperOverlay && scraperOverlay.style.display !== 'none') {
      cancelScraping();
      return;
    }

    const jdEditModal = document.getElementById('jd-edit-modal');
    if (jdEditModal && jdEditModal.classList.contains('show')) {
      closeJdEditModal();
      return;
    }
  }
});

// Expose functions globally for inline onclick handlers in main.html
(window as unknown as Record<string, unknown>).toggleLeft = toggleLeft;
(window as unknown as Record<string, unknown>).openRight = openRight;
(window as unknown as Record<string, unknown>).closeRight = closeRight;
(window as unknown as Record<string, unknown>).expandRight = expandRight;
(window as unknown as Record<string, unknown>).validateJDInput = validateJDInput;
(window as unknown as Record<string, unknown>).handleScanButtonClick = handleScanButtonClick;
(window as unknown as Record<string, unknown>).openAIModal = openAIModal;
(window as unknown as Record<string, unknown>).closeAIModal = closeAIModal;
(window as unknown as Record<string, unknown>).handlePDFUpload = handlePDFUpload;
(window as unknown as Record<string, unknown>).confirmGeneration = confirmGeneration;
(window as unknown as Record<string, unknown>).polishResume = polishResume;
(window as unknown as Record<string, unknown>).cancelPolish = cancelPolish;
(window as unknown as Record<string, unknown>).rollbackPolish = rollbackPolish;
(window as unknown as Record<string, unknown>).toggleActions = toggleActions;
(window as unknown as Record<string, unknown>).openPhotoUploadModal = openPhotoUploadModal;
(window as unknown as Record<string, unknown>).closePhotoUploadModal = closePhotoUploadModal;
(window as unknown as Record<string, unknown>).handlePhotoUpload = handlePhotoUpload;
(window as unknown as Record<string, unknown>).confirmPhotoUpload = confirmPhotoUpload;
(window as unknown as Record<string, unknown>).openProvidersModal = openProvidersModal;
(window as unknown as Record<string, unknown>).closeProvidersModal = closeProvidersModal;
(window as unknown as Record<string, unknown>).selectProviderInModal = selectProviderInModal;
(window as unknown as Record<string, unknown>).handleProviderCheckboxClick = handleProviderCheckboxClick;
(window as unknown as Record<string, unknown>).confirmProvidersSelection = confirmProvidersSelection;
(window as unknown as Record<string, unknown>).cancelProvidersSelection = cancelProvidersSelection;
(window as unknown as Record<string, unknown>).renderResume = renderResume;
(window as unknown as Record<string, unknown>).loadResumeData = loadResumeData;
(window as unknown as Record<string, unknown>).updatePolishButton = updatePolishButton;
(window as unknown as Record<string, unknown>).openJobScraperModal = openJobScraperModal;
(window as unknown as Record<string, unknown>).closeJobScraperModal = closeJobScraperModal;
(window as unknown as Record<string, unknown>).switchScraperPlatform = switchScraperPlatform;
(window as unknown as Record<string, unknown>).openLatestScrapingResults = openLatestScrapingResults;
(window as unknown as Record<string, unknown>).updateQueryPreview = updateQueryPreview;
(window as unknown as Record<string, unknown>).addCustomDomain = addCustomDomain;
(window as unknown as Record<string, unknown>).toggleAllDomains = toggleAllDomains;
(window as unknown as Record<string, unknown>).copyQueryToClipboard = copyQueryToClipboard;
(window as unknown as Record<string, unknown>).startScraping = startScraping;
(window as unknown as Record<string, unknown>).cancelScraping = cancelScraping;
(window as unknown as Record<string, unknown>).refreshScrapingResultsButton = refreshScrapingResultsButton;
(window as unknown as Record<string, unknown>).openResultsTabFromOverlay = openResultsTabFromOverlay;
