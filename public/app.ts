/**
 * resumessi — Frontend Application Logic
 * Extracted from public/main.html inline script
 */

import { getScraperResultsStorageKey } from '../src/scraper/runtime-utils';
import { safeJsonParse } from '../src/providers';
import { buildQueryUrl, resizeImage, showToast } from './utils';

// Declare global function for TypeScript benefit
declare function closeJdEditModal(): void;

// ─── State ──────────────────────────────────────────────────────────
let scanController: AbortController | null = null;
let cachedConfig: Record<string, unknown> | null = null;
let generationController: AbortController | null = null;
let polishController: AbortController | null = null;
let currentDataSource: string = 'none';
let currentResumeData: Record<string, unknown> | null = null;
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
			cachedConfig = (await resp.json()) as Record<string, unknown>;
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
	const presets: Record<string, string> = {
		blue: '#2563eb',
		green: '#16a34a',
		purple: '#7c3aed',
		rose: '#e11d48',
		teal: '#0d9488',
		orange: '#ea580c',
	};
	if (env.ACCENT_COLOR && presets[env.ACCENT_COLOR as string]) env.ACCENT_COLOR = presets[env.ACCENT_COLOR as string];
	const map: Record<string, string> = {
		PRIMARY_COLOR: '--primary',
		SECONDARY_COLOR: '--secondary',
		ACCENT_COLOR: '--accent',
		TEXT_COLOR: '--text',
		TEXT_LIGHT_COLOR: '--text-light',
		BG_BADGE_COLOR: '--bg-badge',
		SUCCESS_COLOR: '--success',
		ERROR_COLOR: '--error',
		WHITEXT_COLOR: '--whitetext',
	};
	Object.entries(map).forEach(([k, v]) => {
		if (env[k]) root.style.setProperty(v, env[k] as string);
	});
}

// ─── Panel Toggles ──────────────────────────────────────────────────
function toggleLeft(): void {
	document.body.classList.toggle('left-collapsed');
}

function openAtsSidebar(): void {
	document.getElementById('right-panel')!.classList.add('open');
	document.body.classList.add('right-open');
}

function closeAtsSidebar(): void {
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
		import('./utils/storage.js').then(m => m.saveAtsScanResults(screening, 'resume'));
	} catch (e) {
		console.warn('Could not save scan results:', e);
	}
}

function loadScanResults(): Record<string, unknown> | null {
	try {
		// Use synchronous localStorage for now (will be async after import)
		if (typeof window !== 'undefined') {
			const raw = localStorage.getItem('ats:scanResults:resume');
			if (raw) return JSON.parse(raw) as Record<string, unknown>;
		}
		return null;
	} catch (e) {
		console.warn('Could not load scan results:', e);
		return null;
	}
}

function clearScanResults(): void {
	try {
		if (typeof window !== 'undefined') {
			localStorage.removeItem('ats:scanResults:resume');
		}
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
	circle.className = `result-score-circle ${tierClass}`;

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

	elSkills.style.color =
		(breakdown.skills_score as number) >= 80
			? '#10b981'
			: (breakdown.skills_score as number) >= 60
				? '#f59e0b'
				: '#ef4444';
	elExp.style.color =
		(breakdown.experience_years_score as number) >= 80
			? '#10b981'
			: (breakdown.experience_years_score as number) >= 60
				? '#f59e0b'
				: '#ef4444';
	elEdu.style.color = breakdown.education_match ? '#10b981' : '#ef4444';

	const kwEl = document.getElementById('rp-keywords')!;
	const missingKeywords = screening.missingKeywords as string[] | undefined;
	const feedbackStr = (screening.feedback as string) || '';
	const isNoFurtherScoring = feedbackStr.toLowerCase().includes('no further scoring') || screening.overall_score === 0;

	if (missingKeywords && missingKeywords.length > 0) {
		kwEl.textContent = '';
		kwEl.style.color = '';
		for (const k of missingKeywords) {
			const span = document.createElement('span');
			span.className = 'result-keyword';
			span.textContent = k;
			kwEl.appendChild(span);
		}
	} else if (isNoFurtherScoring) {
		kwEl.textContent = 'N/A';
		kwEl.style.color = 'rgba(255,255,255,0.7)';
	} else {
		kwEl.textContent = 'None detected \u2014 great match!';
		kwEl.style.color = '#86efac';
	}

	const poweredByContainer = document.getElementById('rp-poweredBy');
	if (poweredByContainer) {
		const provider = (screening.provider as string) || '';
		const model = (screening.model as string) || '';
		const span = poweredByContainer.querySelector('.ai-powered');
		if (span) {
			span.textContent = provider && model ? `${provider}/${model}` : provider || model || '\u2014';
		} else {
			poweredByContainer.textContent = provider && model ? `${provider}/${model}` : provider || model || '\u2014';
		}
	}

	document.getElementById('scan-again-msg')!.style.display = 'none';
	document.getElementById('rp-breakdown-section')!.style.display = 'block';

	openAtsSidebar();
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

	if (!jd) return showToast({ message: 'Please paste a Job Description.', type: 'error' });

	const resumeEl = document.getElementById('resume-content');
	let resumeText = resumeEl ? resumeEl.innerText || resumeEl.textContent : '';
	resumeText = resumeText.replace(/\s+/g, ' ').trim();
	if (!resumeText) {
		return showToast({ message: 'No resume content found. Please load a resume first.', type: 'error' });
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
		showToast({ message: 'Failed to load ATS prompt. Please refresh the page.', type: 'error' });
		throw e;
	}

	const prompt = basePrompt.replace('{job_description}', jd).replace('{resume_text}', resumeText);

	const modelErrorMsg = document.getElementById('rp-feedback')!;

	const selectedProvider = localStorage.getItem('selected-ai-provider') || null;

	try {
		const response = await fetch('/api/infer', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				system: 'You are an ATS resume scorer. Return only valid JSON matching the requested schema.',
				prompt,
				provider: selectedProvider,
				temperature: 0,
				max_tokens: 2048,
				scope: 'ats',
			}),
			signal,
		});

		if (!response.ok) {
			const errData = (await response.json()) as { error?: string; suggestion?: string };
			throw new Error(errData.error || errData.suggestion || `HTTP ${response.status}`);
		}

		const data = (await response.json()) as { text: string; error?: string };
		if (data.error) throw new Error(data.error);

		const raw = data.text;

		const parsed = safeJsonParse(raw);
		if (!parsed.data) {
			throw new Error(parsed.error || 'AI returned invalid JSON. Please try again.');
		}

		const screening =
			(parsed.data as { ai_screening?: Record<string, unknown> }).ai_screening ||
			(parsed.data as Record<string, unknown>);

		applyScanResultsToUI(screening);
		saveScanResults(screening);
	} catch (err: unknown) {
		if ((err as Error).name === 'AbortError') {
			console.warn('Scan cancelled by user.');
		} else {
			modelErrorMsg.textContent = `API response: ${(err as Error).message}.`;
			modelErrorMsg.style.color = 'var(--error)';
			openAtsSidebar();
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
	return String(str).replace(/[&<>"']/g, c => `&#${m[c]};`);
}

// ─── Photo Path ─────────────────────────────────────────────────────
function getPhotoPath(resumeData: { basics?: { photo?: string } }): string {
	const uploadedPhoto = localStorage.getItem('uploaded-photo');
	if (uploadedPhoto) {
		return uploadedPhoto;
	}
	if (resumeData.basics && resumeData.basics.photo) {
		const photo = resumeData.basics.photo;
		if (photo.includes('/')) {
			return photo;
		}
		// If loading from demo/JSON file and photo is the default placeholder, use demo image
		if (currentDataSource === 'demo' && photo === 'photo.jpg') {
			return '/demo/goat.jpg';
		}
		return `public/assets/photos/${photo}`;
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
	summary:
		'Write a brief professional summary here. Highlight your years of experience, key skills, and most impressive achievements.',
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
	techStack: "Describe your experience with the technologies you've work with.",
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
	currentResumeData = d;
	const b = (d.basics as Record<string, string>) || {};

	let html = '';

	// Header
	html += '<header class="resume-header">';
	html += '<div class="header-main">';
	html += `<h1 data-testid="resume-name">${escHtml(b.name)}</h1>`;
	html += `<div class="subtitle">${escHtml(b.title)}</div>`;
	html += '</div>';
	html += '<div class="profile-photo-container">';
	html += `<img src="${escHtml(getPhotoPath(d as { basics?: { photo?: string } }))}" alt="${escHtml(
		b.name
	)}" class="profile-photo" data-testid="profile-photo" onerror="this.style.display='none';">`;
	html += '</div>';
	html += '<div class="contact-info">';
	html += `<p><strong>Email:</strong> ${escHtml(b.email)}</p>`;
	html += `<p><strong>Phone:</strong> ${escHtml(b.phone)}</p>`;
	html += `<p><strong>Location:</strong> ${escHtml(b.location)}</p>`;
	if (b.linkedin && b.linkedin !== '#') {
		html += `<p style="margin-top: 6px;"><a class="cert-link" href="${escHtml(
			b.linkedin
		)}" target="_blank" rel="noopener noreferrer" data-testid="linkedin-link">LinkedIn profile</a></p>`;
	}
	if (b.github && b.github !== '#') {
		html += `<p style="margin-top: 6px;"><a class="cert-link" href="${escHtml(
			b.github
		)}" target="_blank" rel="noopener noreferrer" data-testid="github-link">GitHub profile</a></p>`;
	}
	html += '</div>';
	html += '</header>';

	// Summary
	if (d.summary) {
		html += '<section>';
		html += '<h2 class="section-title">Professional Summary</h2>';
		html += `<p class="summary-text">${escHtml(d.summary as string)}</p>`;
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
			html += `<div class="exp-title">${escHtml(exp.title as string)}</div>`;
			html += `<div class="exp-company">${escHtml(exp.company as string)}</div>`;
			html += '</div>';
			html += `<div class="exp-date">${escHtml(exp.date as string)}</div>`;
			html += '</div>';
			html += '<ul class="exp-bullets">';
			const bullets = exp.bullets as string[] | undefined;
			if (bullets) {
				for (let bi = 0; bi < bullets.length; bi++) {
					html += `<li>${escHtml(bullets[bi])}</li>`;
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
			html += `<h2 class="section-title">${escHtml(category)}</h2>`;
			html += '<div class="skills-grid">';
			for (let si = 0; si < skillList.length; si++) {
				const skill = skillList[si];
				const cls = skill.expert ? 'skill-badge expert' : 'skill-badge';
				html += `<span class="${cls}">${escHtml(skill.name)}</span>`;
			}
			html += '</div>';
		}
	}

	if (d.techStack) {
		html += '<h2 class="section-title">Tech Stack</h2>';
		html += `<p style="font-size: 12.5px; color: var(--text); margin-bottom: 25px; text-align: justify;">${escHtml(
			d.techStack as string
		)}</p>`;
	}

	const languages = d.languages as Array<{ name: string; level: string }> | undefined;
	if (languages && languages.length > 0) {
		html += '<h2 class="section-title">Languages</h2>';
		html += '<div class="meta-item">';
		for (let li = 0; li < languages.length; li++) {
			const lang = languages[li];
			html += `<p><span class="meta-label">${escHtml(lang.name)}:</span> ${escHtml(lang.level)}</p>`;
		}
		html += '</div>';
	}

	const education = d.education as Array<{ degree: string; institution: string; year: string }> | undefined;
	if (education && education.length > 0) {
		html += '<h2 class="section-title">Education</h2>';
		for (let edi = 0; edi < education.length; edi++) {
			const edu = education[edi];
			html += '<div class="meta-item">';
			html += `<p style="font-weight: 700; color: var(--secondary);">${escHtml(edu.degree)}</p>`;
			html += `<p style="font-size: 12.5px; color: var(--text-light);">${escHtml(edu.institution)} (${escHtml(
				edu.year
			)})</p>`;
			html += '</div>';
		}
	}

	const talks = d.talks as Array<{ title: string; event: string; url?: string }> | undefined;
	if (talks && talks.length > 0) {
		html += '<h2 class="section-title">Tech Talks</h2>';
		for (let ti = 0; ti < talks.length; ti++) {
			const talk = talks[ti];
			html += '<div class="meta-item">';
			html += `<p style="font-weight: 700; color: var(--secondary); font-size: 13px;">${escHtml(talk.title)}</p>`;
			html += `<p style="font-size: 12.5px; color: var(--text-light); margin-top: 4px;">${escHtml(talk.event)}</p>`;
			if (talk.url) {
				html += `<p style="margin-top: 6px;"><a class="cert-link" href="${escHtml(
					talk.url
				)}" target="_blank" rel="noopener noreferrer" data-testid="talk-link">Watch recording</a></p>`;
			}
			html += '</div>';
		}
	}

	const certifications = d.certifications as
		Array<{ title: string; issuer: string; date: string; duration?: string; url?: string }> | undefined;
	if (certifications && certifications.length > 0) {
		html += '<h2 class="section-title">Certifications</h2>';
		for (let ci2 = 0; ci2 < certifications.length; ci2++) {
			const cert = certifications[ci2];
			html += '<div class="meta-item">';
			html += `<p style="font-weight: 700; color: var(--secondary);">${escHtml(cert.title)}</p>`;
			let certMeta = `${escHtml(cert.issuer)} \u00b7 ${escHtml(cert.date)}`;
			if (cert.duration) certMeta += ` \u00b7 ${escHtml(cert.duration)}`;
			html += `<p style="font-size: 12.5px; color: var(--text-light);">${certMeta}</p>`;
			if (cert.url) {
				html += `<p style="margin-top: 4px;"><a class="cert-link" href="${escHtml(
					cert.url
				)}" target="_blank" rel="noopener noreferrer" data-testid="cert-link">Verify certificate</a></p>`;
			}
			html += '</div>';
		}
	}

	html += '</aside>';
	html += '</div>';

	const refreshBtn = container.querySelector('#btn-refresh-resume');
	container.innerHTML = html;
	if (refreshBtn) {
		container.appendChild(refreshBtn);
	}
}

// ─── Resume Data Loading ────────────────────────────────────────────
async function loadResumeData(): Promise<void> {
	const priorities = [
		'/src/resume/output/resume-data-AI-polished.json',
		'/src/resume/output/resume-data.json',
		'/demo/resume-demo-data.json',
	];

	for (const filePath of priorities) {
		try {
			const resp = await fetch(filePath);
			if (resp.ok) {
				const data = (await resp.json()) as Record<string, unknown>;
				renderResume(data);
				currentDataSource = filePath.includes('demo-data') ? 'demo' : 'generated';
				updatePolishButton();
				return;
			}
		} catch {
			continue;
		}
	}

	// Fallback to localStorage if no file found
	const local = localStorage.getItem('resume-data');
	if (local) {
		try {
			const data = JSON.parse(local) as Record<string, unknown>;
			renderResume(data);
			currentDataSource = 'generated';
			updatePolishButton();
			return;
		} catch {
			// Invalid localStorage data, fall through to placeholder
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
	const coverLetterBtn = document.getElementById('btn-cover-letter-dropdown') as HTMLElement;
	if (!dropdownBtn) return;

	if (photoBtn) {
		photoBtn.style.display = currentDataSource === 'placeholder' ? 'none' : 'block';
	}

	// Show cover letter button when ATS results exist
	const hasAtsResults = loadScanResults() !== null;
	if (coverLetterBtn) {
		coverLetterBtn.style.display = hasAtsResults ? 'flex' : 'none';
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

// Set demo JD in textarea only when resume is the demo one (Messi)
function maybeSetDemoJobDescription(): void {
	if (currentDataSource !== 'demo') return;
	const jdTextarea = document.getElementById('job-description') as HTMLTextAreaElement;
	if (!jdTextarea) return;
	const demoJd = `# Legendary Football Forward - GOAT

## Company: Global Football Legacy Inc.
**Location:** Rosario, Argentina → Worldwide  
**Period:** 2004 – Present

## Key Achievements
- All-time top scorer in professional football history with 850+ career goals
- Won 8 Ballon d'Or awards (most in history)
- Led Argentina to FIFA World Cup 2022 victory
- Scored 778 goals in 778 games for FC Barcelona
- 10x La Liga champion, 4x UEFA Champions League winner
- Transformed Inter Miami CF, leading to first playoff appearance

## Core Skills
- Elite dribbling and ball control
- Exceptional vision and playmaking
- Clutch performance under pressure
- Global brand ambassador

## Looking For
A forward position requiring world-class goal-scoring ability, leadership, and proven track record at the highest level of professional football.`;
	jdTextarea.value = demoJd;
	validateJDInput();
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
	console.info('[polishResume] START - called from click');
	const dropdownBtn = document.getElementById('btn-polish-dropdown') as HTMLButtonElement;
	if (dropdownBtn.disabled) return;

	dropdownBtn.disabled = true;
	console.info('[polishResume] Setting overlay display to flex');
	const overlay = document.getElementById('polish-overlay');
	if (overlay) {
		overlay.style.display = 'flex';
		console.info('[polishResume] Overlay display set to:', overlay.style.display);
	} else {
		console.error('[polishResume] ERROR: Overlay element not found!');
	}

	polishController = new AbortController();
	const signal = polishController.signal;

	try {
		const resp = await fetch('/src/resume/output/resume-data.json', { signal });
		if (!resp.ok) throw new Error('No resume data to polish');

		const resumeData = (await resp.json()) as Record<string, unknown>;

		const resumeDataForPolish = JSON.parse(JSON.stringify(resumeData)) as Record<string, unknown>;
		const origBasics = resumeData.basics as Record<string, unknown> | undefined;
		const basics = resumeDataForPolish.basics as Record<string, unknown> | undefined;
		if (origBasics && basics) {
			// Preserve all original basics fields that shouldn't be changed by polish
			const preservedFields = ['photo', 'linkedin', 'github', 'website', 'profiles'];
			preservedFields.forEach(field => {
				if (origBasics[field] !== undefined) {
					basics[field] = origBasics[field];
				}
			});
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
			signal,
		});

		if (!polishResp.ok) {
			const errorData = await polishResp.json().catch(() => ({ error: 'Polish API failed' }));
			throw new Error(errorData.error || 'Polish API failed');
		}

		const polishedData = (await polishResp.json()) as Record<string, unknown>;

		// Restore all preserved fields after polish
		if (origBasics) {
			const preservedFields = ['photo', 'linkedin', 'github', 'website', 'profiles'];
			const pBasics = (polishedData.basics as Record<string, unknown> | null) || {};
			let modified = false;
			preservedFields.forEach(field => {
				if (origBasics[field] !== undefined) {
					pBasics[field] = origBasics[field];
					modified = true;
				}
			});
			if (modified) {
				polishedData.basics = pBasics;
			}
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
			console.warn('Polish cancelled by user.');
		} else {
			document.getElementById('polish-overlay')!.style.display = 'none';
			showToast({ message: `Polish failed: ${(err as Error).message}`, type: 'error' });
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

// Expose functions to global scope for inline event handlers (onclick)
const win = window as Window &
	typeof globalThis & {
		polishResume: typeof polishResume;
		cancelPolish: typeof cancelPolish;
		rollbackPolish: typeof rollbackPolish;
	};
win.polishResume = polishResume;
win.cancelPolish = cancelPolish;
win.rollbackPolish = rollbackPolish;

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
		showToast({ message: `Rollback failed: ${(err as Error).message}`, type: 'error' });
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
		const coverLetterModal = document.getElementById('cover-letter-modal');
		if (coverLetterModal && coverLetterModal.style.display === 'flex') {
			closeCoverLetterModal();
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

		const data = (await response.json()) as { error?: string; textPreview?: string; text?: string; message?: string };

		if (data.error === 'PDF_TOO_LARGE') {
			currentPDFText = data.textPreview || '';

			document.getElementById('modal-loading')!.style.display = 'none';
			document.getElementById('modal-error-section')!.style.display = 'block';
			document.getElementById('modal-error-text')!.textContent = data.message || '';
			(document.getElementById('btn-continue-anyway') as HTMLElement).style.display = 'block';
			(document.getElementById('btn-generate') as HTMLElement).style.display = 'none';
			document.getElementById('modal-file-name')!.textContent = `File: ${currentPDFFileName}`;
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
		document.getElementById('modal-file-name')!.textContent = `File: ${currentPDFFileName}`;
		document.getElementById('modal-file-name')!.style.display = 'block';
		document.getElementById('modal-actions')!.style.display = 'flex';
	} catch (err: unknown) {
		document.getElementById('modal-loading')!.style.display = 'none';
		showModalError(`Error: ${(err as Error).message}`);
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

function extractNameFromPDFText(text: string): string | null {
	if (!text) return null;

	const lines = text.split('\n');
	const headerBlacklist =
		/^(summary|professional summary|profile|experience|work experience|education|skills|certifications|contact|about|objective|languages)/i;
	// Common job-title / role words that should never be treated as a person's name
	const jobTitleBlacklistTerms = [
		'senior',
		'junior',
		'lead',
		'staff',
		'principal',
		'mid',
		'mid-level',
		'entry',
		'entry-level',
		'software',
		'frontend',
		'front-end',
		'backend',
		'back-end',
		'fullstack',
		'full-stack',
		'devops',
		'sdet',
		'qa',
		'quality',
		'automation',
		'engineer',
		'developer',
		'manager',
		'director',
		'architect',
		'analyst',
		'consultant',
		'specialist',
		'designer',
		'product',
		'project',
		'program',
		'scrum',
		'agile',
		'data',
		'cloud',
		'platform',
		'infrastructure',
		'network',
		'security',
		'test',
		'testing',
		'tester',
		'intern',
		'internship',
		'contractor',
		'freelance',
		'remote',
		'head',
		'chief',
		'cto',
		'ceo',
		'coo',
		'cfo',
		'vp',
		'vice',
		'president',
		'founder',
		'owner',
		'recruiter',
		'talent',
		'people',
		'hr',
		'human',
		'resources',
		'marketing',
		'sales',
		'finance',
		'legal',
		'operations',
		'support',
		'success',
		'account',
		'business',
		'strategy',
		'growth',
		'content',
		'writer',
		'copywriter',
		'editor',
		'teacher',
		'professor',
		'nurse',
		'doctor',
		'lawyer',
		'accountant',
		'architect',
		'scientist',
		'researcher',
		'technician',
		'coordinator',
		'assistant',
		'associate',
		'representative',
		'officer',
		'leadership',
		'lead',
	];
	const jobTitleBlacklist = new RegExp(`^(${jobTitleBlacklistTerms.join('|')})`, 'i');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		if (!line || line.length < 3 || line.length > 60) continue;
		if (/^(email|phone|location|linkedin|github|http|www|@)/i.test(line)) continue;
		if (headerBlacklist.test(line)) continue;
		if (line === line.toUpperCase() && /[A-Z]/.test(line)) continue;
		if (jobTitleBlacklist.test(line)) continue;

		const words = line.split(/\s+/);

		if (words.length >= 2 && words.length <= 4) {
			if (/^[a-zA-ZÀ-ÿñÑ'. -]+$/.test(line) && !/\d/.test(line)) {
				const isLikelyName = words.every(word => {
					const firstChar = word.charAt(0);
					return firstChar === firstChar.toUpperCase() || /^(de|del|la|las|los|y)$/i.test(word);
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
		showToast({ message: 'Failed to load extraction prompt. Please refresh the page.', type: 'error' });
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
			signal,
		});

		if (!response.ok) {
			const errData = (await response.json()) as { error?: string; suggestion?: string };
			throw new Error(errData.error || errData.suggestion || `HTTP ${response.status}`);
		}

		const data = (await response.json()) as { text: string; error?: string };
		if (data.error) throw new Error(data.error);

		const raw = data.text;

		const parsed = safeJsonParse(raw);
		if (!parsed.data) {
			throw new Error(parsed.error || 'AI returned invalid JSON. Please try again.');
		}

		const resumeData = parsed.data as { basics?: Record<string, unknown> };

		const hallucinatedNames = ['john doe', 'jane doe', 'alex johnson', 'your name', 'candidate', 'todo'];

		const expectedName = extractNameFromPDFText(currentPDFText);
		const basics = resumeData.basics as Record<string, unknown> | undefined;
		const outputNameRaw = ((basics && basics.name) as string) || '';

		if (outputNameRaw) {
			const outputLower = outputNameRaw.toLowerCase().trim();

			const isHallucinated = hallucinatedNames.some(p => outputLower === p || outputLower.includes(p));
			if (isHallucinated) {
				const errMsg = `AI returned hallucinated name "${outputNameRaw}". Generation aborted.`;
				console.error(errMsg);
				showToast({ message: errMsg, type: 'error' });
				closeAIModal();
				return;
			}

			if (expectedName) {
				const expectedLower = expectedName.toLowerCase().trim();
				if (!outputLower.includes(expectedLower) && !expectedLower.includes(outputLower)) {
					const expectedWords = expectedLower.split(/\s+/).filter(w => w.length > 2);
					const outputWords = outputLower.split(/\s+/);
					const hasOverlap = expectedWords.some(w => outputWords.indexOf(w) > -1);
					if (!hasOverlap) {
						const errMsg = `AI generated resume for wrong person: "${outputNameRaw}" instead of "${
							expectedName
						}". Generation aborted.`;
						console.error(errMsg);
						showToast({ message: errMsg, type: 'error' });
						closeAIModal();
						return;
					}
				}
			}
		} else if (expectedName) {
			console.warn(`AI returned empty name. Using expected name "${expectedName}".`);
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
			console.warn('Generation cancelled by user.');
		} else {
			showToast({ message: `Error generating resume: ${(err as Error).message}`, type: 'error' });
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
		showPhotoModalError(
			'Invalid file type. Please upload a JPEG, JPG or PNG image. Please try again with a different photo.'
		);
		return;
	}

	const reader = new FileReader();
	reader.onload = function (e: ProgressEvent<FileReader>) {
		const img = new Image();
		img.onload = function () {
			currentPhotoDataURL = e.target?.result as string;

			document.getElementById('photo-upload-section')!.style.display = 'none';
			document.getElementById('photo-upload-file-name')!.textContent = `File: ${file.name}`;
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

async function confirmPhotoUpload(): Promise<void> {
	if (!currentPhotoDataURL) return;

	// Use localStorage data if available, otherwise fall back to currentResumeData (loaded from JSON)
	const resumeDataStr = localStorage.getItem('resume-data');
	let resumeData: Record<string, unknown>;

	if (resumeDataStr) {
		try {
			resumeData = JSON.parse(resumeDataStr) as Record<string, unknown>;
		} catch {
			resumeData = currentResumeData || {};
		}
	} else if (currentResumeData) {
		resumeData = { ...currentResumeData }; // Clone to avoid mutating the original
	} else {
		resumeData = {};
	}

	if (!resumeData.basics) resumeData.basics = {};

	// Resize/compress photo to avoid localStorage quota issues
	let photoToStore = currentPhotoDataURL;
	let resizeFailed = false;
	try {
		photoToStore = await resizeImage(currentPhotoDataURL, 400, 400, 0.7);
	} catch (resizeErr) {
		resizeFailed = true;
		console.warn('Failed to resize photo, using original:', resizeErr);
	}

	(resumeData.basics as Record<string, unknown>).photo = photoToStore;
	localStorage.setItem('resume-data', JSON.stringify(resumeData));
	localStorage.setItem('uploaded-photo', photoToStore);
	renderResume(resumeData);

	fetch('/api/save-resume-data', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(resumeData),
	}).catch(saveErr => {
		console.warn('Could not save resume to server:', saveErr);
	});

	if (resizeFailed) {
		showToast({
			message: 'Photo was not optimized. If you experience storage issues, try a smaller image.',
			type: 'warning',
		});
	}

	closePhotoUploadModal();
}

// ─── AI Providers Modal Functions ───────────────────────────────────
async function openProvidersModal(): Promise<void> {
	const modal = document.getElementById('providers-modal');
	if (!modal) return;

	const env = await loadEnv();
	const availableProviders = (env.availableProviders as string[]) || [];
	const currentSelected = localStorage.getItem('selected-ai-provider') || (env.primaryProvider as string) || null;
	selectedProviderForModal = currentSelected;

	const subtitleEl = document.getElementById('providers-modal-subtitle');
	const listEl = document.getElementById('providers-list');
	const emptyMsgEl = document.getElementById('providers-empty-message');
	const actionsEl = document.getElementById('providers-modal-actions');
	const cancelBtn = document.getElementById('providers-cancel-btn');
	const confirmBtn = document.getElementById('providers-confirm-btn');

	if (availableProviders.length === 0) {
		if (subtitleEl) subtitleEl.style.display = 'none';
		if (listEl) listEl.style.display = 'none';
		if (emptyMsgEl) emptyMsgEl.style.display = 'block';
		if (cancelBtn) cancelBtn.style.display = 'none';
		if (confirmBtn) {
			confirmBtn.style.display = 'inline-block';
			confirmBtn.style.flex = '0 0 auto';
			confirmBtn.style.alignSelf = 'center';
			confirmBtn.style.width = 'auto';
		}
		if (actionsEl) {
			actionsEl.style.flexDirection = 'row';
			actionsEl.style.justifyContent = 'center';
		}
	} else {
		if (subtitleEl) subtitleEl.style.display = 'block';
		if (listEl) listEl.style.display = 'grid';
		if (emptyMsgEl) emptyMsgEl.style.display = 'none';
		if (cancelBtn) cancelBtn.style.display = 'inline-block';
		if (confirmBtn) {
			confirmBtn.style.display = 'inline-block';
			confirmBtn.style.flex = '1';
			confirmBtn.style.alignSelf = '';
			confirmBtn.style.width = '';
		}
		if (actionsEl) {
			actionsEl.style.flexDirection = 'row';
			actionsEl.style.justifyContent = 'stretch';
		}
		renderProvidersList(availableProviders, (env.primaryProvider as string) || null);
	}

	modal.style.display = 'flex';
	actionsEl!.style.display = 'flex';
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
		default:
			'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ctext y="1em" font-size="20"%3E\uD83E\uDD16%3C/text%3E%3C/svg%3E',
	};

	const providerModels: Record<string, string> = {
		cohere: 'command-a-reasoning-08-2025',
		mistral: 'codestral-2508',
		gemini: 'gemini-3.6-flash',
		groq: 'openai/gpt-oss-120b',
		default: 'Unknown model',
	};

	const providerDescriptions: Record<string, string> = {
		cohere: 'Balanced performance, strong for general tasks',
		mistral: 'Fast, multilingual, great for reasoning',
		gemini: "Google's latest model, vision capable",
		groq: 'Ultra-fast inference, Llama architecture',
		default: 'AI provider for resume generation',
	};

	const currentSelected = localStorage.getItem('selected-ai-provider') || selectedProvider;

	listEl.textContent = '';

	for (const provider of providers) {
		const isSelected = provider === currentSelected;
		const icon = providerIcons[provider] || providerIcons.default;
		const model = providerModels[provider] || providerModels.default;
		const desc = providerDescriptions[provider] || providerDescriptions.default;
		const displayName = provider.charAt(0).toUpperCase() + provider.slice(1);

		const item = document.createElement('div');
		item.className = 'provider-item';
		item.dataset.provider = provider;
		item.addEventListener('click', () => selectProviderInModal(provider));

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'provider-checkbox';
		checkbox.checked = isSelected;
		checkbox.addEventListener('click', (event: Event) => {
			event.stopPropagation();
			selectProviderInModal(provider);
		});

		const header = document.createElement('div');
		header.className = 'provider-header';

		const img = document.createElement('img');
		img.src = icon;
		img.alt = provider;
		img.className = 'provider-img';
		img.addEventListener('error', () => {
			img.style.display = 'none';
		});

		const nameSpan = document.createElement('span');
		nameSpan.className = 'provider-name';
		nameSpan.textContent = displayName;

		header.appendChild(img);
		header.appendChild(nameSpan);

		const modelDiv = document.createElement('div');
		modelDiv.className = 'provider-model';
		modelDiv.textContent = model;

		const descDiv = document.createElement('div');
		descDiv.className = 'provider-description';
		descDiv.textContent = desc;

		item.appendChild(checkbox);
		item.appendChild(header);
		item.appendChild(modelDiv);
		item.appendChild(descDiv);

		listEl.appendChild(item);
	}

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
	document.querySelectorAll('.provider-item').forEach(item => {
		const el = item as HTMLElement;
		if (el.dataset.provider === provider) {
			el.classList.add('selected');
			const checkbox = el.querySelector('.provider-checkbox') as HTMLInputElement;
			if (checkbox) checkbox.checked = true;
		}
	});
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

	await loadResumeData();
	maybeSetDemoJobDescription();

	const savedScan = loadScanResults();
	if (savedScan) {
		applyScanResultsToUI(savedScan);
	}

	updatePolishButton();
})();

async function handleRefreshResume(): Promise<void> {
	await loadResumeData();
	showRefreshMessage();
}

// ─── Job Scraper UI Logic ───────────────────────────────────────────
async function openJobScraperModal(): Promise<void> {
	const dropdown = document.getElementById('actions-dropdown');
	if (dropdown) dropdown.classList.add('hidden');

	// Reset form fields
	const roleInput = document.getElementById('scraper-role') as HTMLInputElement;
	if (roleInput) roleInput.value = '';
	const keywordsInput = document.getElementById('scraper-keywords') as HTMLInputElement;
	if (keywordsInput) keywordsInput.value = '';
	const senioritySelect = document.getElementById('scraper-seniority') as HTMLSelectElement;
	if (senioritySelect) senioritySelect.value = '';
	const datePostedSelect = document.getElementById('scraper-date-posted') as HTMLSelectElement;
	if (datePostedSelect) datePostedSelect.value = 'week';
	const workTypeSelect = document.getElementById('scraper-work-type') as HTMLSelectElement;
	if (workTypeSelect) workTypeSelect.value = '';
	const employmentSelect = document.getElementById('scraper-employment') as HTMLSelectElement;
	if (employmentSelect) employmentSelect.value = '';
	const googleSeniorityInput = document.getElementById('scraper-seniority-google') as HTMLInputElement;
	if (googleSeniorityInput) googleSeniorityInput.value = '';
	const googleEmploymentInput = document.getElementById('scraper-employment-google') as HTMLInputElement;
	if (googleEmploymentInput) googleEmploymentInput.value = '';
	const countryInput = document.getElementById('scraper-country') as HTMLInputElement;
	if (countryInput) countryInput.value = '';
	const regionSelect = document.getElementById('scraper-region') as HTMLSelectElement;
	if (regionSelect) regionSelect.value = '';
	const currencySelect = document.getElementById('scraper-currency') as HTMLSelectElement;
	if (currencySelect) currencySelect.value = '';
	const pageCountSelect = document.getElementById('scraper-page-count') as HTMLSelectElement;
	if (pageCountSelect) pageCountSelect.value = '1';
	const startPageSelect = document.getElementById('scraper-start-page') as HTMLSelectElement;
	if (startPageSelect) startPageSelect.value = '1';

	// Reset domain checkboxes: all default sites checked by default (so the
	// initial query includes them), and the master select-all checkbox too
	const domainBoxes = Array.from(
		document.querySelectorAll('#domains-checklist input[type="checkbox"]:not(#select-all-domains)')
	) as HTMLInputElement[];
	domainBoxes.forEach(cb => {
		cb.checked = true;
	});
	const selectAllCb = document.getElementById('select-all-domains') as HTMLInputElement | null;
	if (selectAllCb) selectAllCb.checked = true;

	clearRoleError();

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

function clearRoleError(): void {
	const errSpan = document.getElementById('scraper-role-error');
	if (errSpan) errSpan.style.display = 'none';
	const roleInput = document.getElementById('scraper-role');
	if (roleInput) roleInput.style.border = '1px solid rgba(255,255,255,0.15)';
}

function switchScraperPlatform(platform: 'linkedin' | 'google'): void {
	currentScraperPlatform = platform;
	const btnLinkedin = document.getElementById('toggle-platform-linkedin');
	const btnGoogle = document.getElementById('toggle-platform-google');
	const linkedinRow1 = document.getElementById('scraper-row-linkedin-1');
	const linkedinRow2 = document.getElementById('scraper-row-linkedin-2');
	const googleSeniorityField = document.getElementById('scraper-field-seniority-google');
	const googleEmploymentField = document.getElementById('scraper-field-employment-google');
	const googleSection = document.getElementById('google-domains-section');
	const countryField = document.getElementById('scraper-field-country');
	const regionField = document.getElementById('scraper-field-region');
	const currencyField = document.getElementById('scraper-field-currency');
	const linkedinPageLimitNote = document.getElementById('linkedin-page-limit-note');

	if (platform === 'linkedin') {
		if (btnLinkedin) {
			btnLinkedin.style.background = 'var(--accent)';
			btnLinkedin.style.color = '#fff';
		}
		if (btnGoogle) {
			btnGoogle.style.background = 'transparent';
			btnGoogle.style.color = 'rgba(255,255,255,0.7)';
		}
		if (linkedinPageLimitNote) linkedinPageLimitNote.style.display = 'block';
		// LinkedIn: show LinkedIn rows (seniority, date posted, work type, employment, country, region, currency); hide Google fields
		if (linkedinRow1) linkedinRow1.style.display = 'grid';
		if (linkedinRow2) linkedinRow2.style.display = 'grid';
		if (countryField) countryField.style.display = 'block';
		if (regionField) regionField.style.display = 'block';
		if (currencyField) currencyField.style.display = 'block';
		if (googleSeniorityField) googleSeniorityField.style.display = 'none';
		if (googleEmploymentField) googleEmploymentField.style.display = 'none';
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
		if (linkedinPageLimitNote) linkedinPageLimitNote.style.display = 'none';
		// Google: show Google fields (seniority, employment, country, region, currency, domains); hide LinkedIn rows
		if (linkedinRow1) linkedinRow1.style.display = 'none';
		if (linkedinRow2) linkedinRow2.style.display = 'none';
		if (countryField) countryField.style.display = 'block';
		if (regionField) regionField.style.display = 'block';
		if (currencyField) currencyField.style.display = 'block';
		if (googleSeniorityField) googleSeniorityField.style.display = 'block';
		if (googleEmploymentField) googleEmploymentField.style.display = 'block';
		if (googleSection) googleSection.style.display = 'block';
	}

	updateQueryPreview();
}

function updateQueryPreview(): string {
	const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
	const seniority =
		currentScraperPlatform === 'google'
			? (document.getElementById('scraper-seniority-google') as HTMLInputElement)?.value.trim() || ''
			: (document.getElementById('scraper-seniority') as HTMLSelectElement)?.value || '';
	const employmentType =
		currentScraperPlatform === 'google'
			? (document.getElementById('scraper-employment-google') as HTMLInputElement)?.value.trim() || ''
			: (document.getElementById('scraper-employment') as HTMLSelectElement)?.value || '';
	const country = (document.getElementById('scraper-country') as HTMLInputElement)?.value.trim() || '';
	const region = (document.getElementById('scraper-region') as HTMLSelectElement)?.value || '';
	const currency = (document.getElementById('scraper-currency') as HTMLSelectElement)?.value || '';
	const datePosted = (document.getElementById('scraper-date-posted') as HTMLSelectElement)?.value || '';
	const workType = (document.getElementById('scraper-work-type') as HTMLSelectElement)?.value || '';
	const keywords = (document.getElementById('scraper-keywords') as HTMLInputElement)?.value.trim() || '';

	const checkedBoxes = Array.from(
		document.querySelectorAll('#domains-checklist input[type="checkbox"]:checked:not(#select-all-domains)')
	) as HTMLInputElement[];
	const customDomains =
		currentScraperPlatform === 'google' ? checkedBoxes.map(cb => cb.value.trim()).filter(Boolean) : undefined;

	// Sync the master "Select All" checkbox with the individual domain checkboxes
	if (currentScraperPlatform === 'google') {
		const selectAll = document.getElementById('select-all-domains') as HTMLInputElement | null;
		if (selectAll) {
			const allDomainBoxes = Array.from(
				document.querySelectorAll('#domains-checklist input[type="checkbox"]:not(#select-all-domains)')
			) as HTMLInputElement[];
			const allChecked = allDomainBoxes.length > 0 && allDomainBoxes.every(cb => cb.checked);
			selectAll.checked = allChecked;
		}
	}

	// Delegate to the shared URL builder (single source of truth)
	const generatedUrl = buildQueryUrl(currentScraperPlatform, {
		source: currentScraperPlatform,
		role,
		seniority,
		employmentType,
		country,
		region,
		currency,
		datePosted,
		workType,
		keywords,
		customDomains,
	});

	const previewElem = document.getElementById('query-url-preview');
	if (previewElem) {
		previewElem.textContent = decodeURIComponent(generatedUrl);
	}
	return generatedUrl;
}

function toggleAllDomains(master: HTMLInputElement): void {
	const checkboxes = Array.from(
		document.querySelectorAll('#domains-checklist input[type="checkbox"]:not(#select-all-domains)')
	) as HTMLInputElement[];
	checkboxes.forEach(cb => {
		cb.checked = master.checked;
	});
	updateQueryPreview();
}

function addCustomDomain(): void {
	const input = document.getElementById('custom-domain-input') as HTMLInputElement;
	if (!input) return;
	const val = input.value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/\/.*$/, '');
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

function openQueryInBrowser(): void {
	// Validate first
	const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
	if (!role) {
		const errSpan = document.getElementById('scraper-role-error');
		if (errSpan) errSpan.style.display = 'block';
		const roleInput = document.getElementById('scraper-role');
		if (roleInput) roleInput.style.border = '1px solid #ef4444';
		return;
	}

	const url = updateQueryPreview();
	window.open(url, '_blank');
}

async function startScraping(): Promise<void> {
	const role = (document.getElementById('scraper-role') as HTMLInputElement)?.value.trim() || '';
	if (!role) {
		const errSpan = document.getElementById('scraper-role-error');
		if (errSpan) errSpan.style.display = 'block';
		const roleInput = document.getElementById('scraper-role');
		if (roleInput) roleInput.style.border = '1px solid #ef4444';
		return;
	}

	const seniority =
		currentScraperPlatform === 'google'
			? (document.getElementById('scraper-seniority-google') as HTMLInputElement)?.value.trim() || ''
			: (document.getElementById('scraper-seniority') as HTMLSelectElement)?.value || '';
	const employmentType =
		currentScraperPlatform === 'google'
			? (document.getElementById('scraper-employment-google') as HTMLInputElement)?.value.trim() || ''
			: (document.getElementById('scraper-employment') as HTMLSelectElement)?.value || '';
	const country = (document.getElementById('scraper-country') as HTMLInputElement)?.value.trim() || '';
	const region = (document.getElementById('scraper-region') as HTMLSelectElement)?.value || '';
	const currency = (document.getElementById('scraper-currency') as HTMLSelectElement)?.value || '';
	const datePosted = (document.getElementById('scraper-date-posted') as HTMLSelectElement)?.value || '';
	const workType = (document.getElementById('scraper-work-type') as HTMLSelectElement)?.value || '';
	const keywords = (document.getElementById('scraper-keywords') as HTMLInputElement)?.value.trim() || '';

	const checkedBoxes = Array.from(
		document.querySelectorAll('#domains-checklist input[type="checkbox"]:checked:not(#select-all-domains)')
	) as HTMLInputElement[];
	const customDomains =
		currentScraperPlatform === 'google' ? checkedBoxes.map(cb => cb.value.trim()).filter(Boolean) : undefined;

	const pageCount = parseInt((document.getElementById('scraper-page-count') as HTMLSelectElement)?.value || '1', 10);
	const startPage = parseInt((document.getElementById('scraper-start-page') as HTMLSelectElement)?.value || '1', 10);

	const queryPayload = {
		source: currentScraperPlatform,
		role,
		seniority,
		employmentType,
		country,
		region,
		currency,
		datePosted,
		workType,
		keywords,
		customDomains,
		pageCount,
		startPage,
	};

	closeJobScraperModal();

	// Open results tab with loading state immediately
	const targetUrl = `/public/findJob.html?source=${currentScraperPlatform}&loading=true`;
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
			const errMsg = err.error || 'Failed to execute scraper';
			// Signal failure to the results tab so it stops polling and shows an error
			if (scraperResultsWindow && !scraperResultsWindow.closed) {
				scraperResultsWindow.postMessage({ type: 'scrapeFailed', error: errMsg }, window.location.origin);
			}
			showToast({ message: `Scraper error: ${errMsg}`, type: 'error' });
			return;
		}

		const data = await resp.json();
		const runId = data.runId || '';
		sessionStorage.setItem('scraper-results', JSON.stringify(data));
		localStorage.setItem(getScraperResultsStorageKey(currentScraperPlatform), JSON.stringify(data));
		refreshScrapingResultsButton();

		if (scraperResultsWindow && !scraperResultsWindow.closed) {
			scraperResultsWindow.location.href = `/public/findJob.html?source=${currentScraperPlatform}${runId ? `&runId=${runId}` : ''}`;
			if (overlay) overlay.style.display = 'none';
		} else {
			if (fallbackBtn) fallbackBtn.style.display = 'inline-block';
		}
	} catch (err: unknown) {
		if (overlay) overlay.style.display = 'none';
		if ((err as Error).name === 'AbortError') {
			// User cancelled the scrape — the results tab would otherwise poll forever,
			// so signal it to stop and show a cancellation message
			if (scraperResultsWindow && !scraperResultsWindow.closed) {
				scraperResultsWindow.postMessage(
					{ type: 'scrapeFailed', error: 'Scraping was cancelled.' },
					window.location.origin
				);
			}
		} else {
			const errMsg = (err as Error).message;
			// Signal failure to the results tab so it stops polling and shows an error
			if (scraperResultsWindow && !scraperResultsWindow.closed) {
				scraperResultsWindow.postMessage({ type: 'scrapeFailed', error: errMsg }, window.location.origin);
			}
			showToast({ message: `Scraping error: ${errMsg}`, type: 'error' });
		}
	}
}

function openResultsTabFromOverlay(): void {
	const overlay = document.getElementById('scraper-overlay');
	if (overlay) overlay.style.display = 'none';
	const savedRaw = sessionStorage.getItem('scraper-results');
	let runId = '';
	if (savedRaw) {
		try {
			const parsed = JSON.parse(savedRaw);
			runId = parsed.runId || '';
		} catch {
			/* ignore */
		}
	}
	const url = `/public/findJob.html?source=${currentScraperPlatform}${runId ? `&runId=${runId}` : ''}`;
	scraperResultsWindow = window.open(url, '_blank');
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
					const target = `/public/findJob.html?source=${source}`;
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

	const fallbackTarget = '/public/findJob.html?source=linkedin';
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

// ─── Cover Letter Modal Functions ─────────────────────────────────────
function openCoverLetterModal(): void {
	const modal = document.getElementById('cover-letter-modal');
	if (!modal) return;

	// Reset modal state
	document.getElementById('cover-letter-settings')!.style.display = 'flex';
	document.getElementById('cover-letter-loading')!.style.display = 'none';
	document.getElementById('cover-letter-error')!.style.display = 'none';
	document.getElementById('cover-letter-result')!.style.display = 'none';
	document.getElementById('cover-letter-actions')!.style.display = 'flex';
	document.getElementById('cover-letter-result-actions')!.style.display = 'none';

	// Set defaults
	(document.getElementById('cl-tone') as HTMLSelectElement).value = 'Formal';
	(document.getElementById('cl-english-level') as HTMLSelectElement).value = 'C1';
	(document.getElementById('cl-focus') as HTMLInputElement).value = '';
	(document.getElementById('cl-char-limit') as HTMLInputElement).value = '';

	modal.style.display = 'flex';
}

function closeCoverLetterModal(): void {
	const modal = document.getElementById('cover-letter-modal');
	if (modal) modal.style.display = 'none';
}

async function generateCoverLetter(): Promise<void> {
	const jd = (document.getElementById('job-description') as HTMLTextAreaElement).value.trim();
	if (!jd) {
		showToast({ message: 'Please paste a Job Description in JD Validation first.', type: 'error' });
		return;
	}

	const tone = (document.getElementById('cl-tone') as HTMLSelectElement).value;
	const englishLevel = (document.getElementById('cl-english-level') as HTMLSelectElement).value;
	const focusAreas = (document.getElementById('cl-focus') as HTMLInputElement).value.trim();
	const charLimitInput = (document.getElementById('cl-char-limit') as HTMLInputElement).value.trim();
	const charLimit = charLimitInput === '' ? undefined : parseInt(charLimitInput, 10);
	const includeSalutationSignOff =
		(document.getElementById('cl-salutation-signoff') as HTMLSelectElement).value === 'true';

	// Show loading, hide other sections
	document.getElementById('cover-letter-settings')!.style.display = 'none';
	document.getElementById('cover-letter-actions')!.style.display = 'none';
	document.getElementById('cover-letter-loading')!.style.display = 'block';
	document.getElementById('cover-letter-error')!.style.display = 'none';

	const selectedProvider = localStorage.getItem('selected-ai-provider') || null;

	// Load ATS scan results from sessionStorage
	const atsResults = loadScanResults();
	const atsScore = atsResults ? String(atsResults.overall_score || 'N/A') : 'N/A';
	const atsTier = atsResults ? String(atsResults.tier || 'N/A') : 'N/A';
	const atsMissingKeywords =
		atsResults && Array.isArray(atsResults.missingKeywords)
			? (atsResults.missingKeywords as string[]).join(', ') || 'None'
			: 'None';
	const atsFeedback = atsResults ? String(atsResults.feedback || 'No feedback available') : 'No ATS scan performed';

	try {
		const response = await fetch('/api/generate-cover-letter', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jobDescription: jd,
				tone,
				englishLevel,
				focusAreas,
				charLimit,
				provider: selectedProvider,
				atsScore,
				atsTier,
				atsMissingKeywords,
				atsFeedback,
				includeSalutationSignOff,
			}),
		});

		if (!response.ok) {
			const errData = await response.json().catch(() => ({ error: 'Failed to generate cover letter' }));
			throw new Error(errData.error || errData.suggestion || `HTTP ${response.status}`);
		}

		const coverLetterText = await response.text();

		// Show result
		document.getElementById('cover-letter-loading')!.style.display = 'none';
		document.getElementById('cover-letter-result')!.style.display = 'block';
		document.getElementById('cover-letter-result-actions')!.style.display = 'flex';
		(document.getElementById('cover-letter-text') as HTMLTextAreaElement).value = coverLetterText;
	} catch (err: unknown) {
		document.getElementById('cover-letter-loading')!.style.display = 'none';
		document.getElementById('cover-letter-error')!.style.display = 'block';
		document.getElementById('cover-letter-error-text')!.textContent = `Error: ${(err as Error).message}`;
		document.getElementById('cover-letter-actions')!.style.display = 'flex';
	}
}

function copyCoverLetter(): void {
	const text = (document.getElementById('cover-letter-text') as HTMLTextAreaElement).value;
	if (!text) return;

	navigator.clipboard
		.writeText(text)
		.then(() => {
			showToast({ message: 'Cover letter copied to clipboard!', type: 'success' });
		})
		.catch(() => {
			showToast({ message: 'Failed to copy. Please select and copy manually.', type: 'error' });
		});
}

/**
 * Opens the browser print dialog to export the resume as PDF.
 * Sets the document title to the applicant's name so exported PDFs carry
 * "Name - Resume" instead of the app's default "<title>".
 */
function downloadResume(): void {
	const originalTitle = document.title;

	// Prefer the freshest data: localStorage mirrors the current resume on disk.
	let name = '';
	try {
		const stored = localStorage.getItem('resume-data');
		if (stored) {
			const parsed = JSON.parse(stored) as { basics?: Record<string, string> };
			if (parsed.basics?.name) name = parsed.basics.name;
		}
	} catch {
		// fall through to in-memory state
	}
	if (!name) {
		const b = (currentResumeData?.basics as Record<string, string>) || {};
		if (b.name) name = b.name;
	}
	if (!name) return window.print();

	// Set the title BEFORE printing so Chrome embeds it in the PDF /Title
	// metadata and prefixes the suggested filename. Chrome only snapshots the
	// title into the PDF when printing completes, so restore it on "afterprint"
	// instead of right after the (blocking) call to window.print().
	const printTitle = `${name} - Resume`;
	document.title = printTitle;

	const restore = () => {
		document.title = originalTitle;
		window.removeEventListener('afterprint', restore);
	};
	window.addEventListener('afterprint', restore);

	window.print();
}

function downloadCoverLetter(): void {
	const text = (document.getElementById('cover-letter-text') as HTMLTextAreaElement).value;
	if (!text) return;

	// Extract company and role from JD
	const jd = (document.getElementById('job-description') as HTMLTextAreaElement).value;
	let company = 'company';
	let role = 'role';

	// Try to extract company
	const companyPatterns = [
		/company[:\s]+([^\n]+)/i,
		/at\s+([A-Z][A-Za-z\s&]+?)(?:\s*[-–]|\s*\(|\s*in|\s*,|\s*\.)/i,
		/([A-Z][A-Za-z\s&]+?)\s+is\s+(?:looking|seeking|hiring)/i,
	];

	for (const pattern of companyPatterns) {
		const match = jd.match(pattern);
		if (match && match[1]) {
			company = match[1]
				.trim()
				.replace(/[^a-zA-Z0-9\s]/g, '')
				.replace(/\s+/g, '-')
				.toLowerCase();
			break;
		}
	}

	// Try to extract role
	const rolePatterns = [
		/(?:position|role|title|job)[:\s]+([^\n]+)/i,
		/(?:hiring|looking for|seeking)\s+(?:a\s+)?([A-Z][A-Za-z\s]+?)(?:\s+to|\s+who|\s+with)/i,
		/([A-Z][A-Za-z\s]+?)\s+position/i,
	];

	for (const pattern of rolePatterns) {
		const match = jd.match(pattern);
		if (match && match[1]) {
			role = match[1]
				.trim()
				.replace(/[^a-zA-Z0-9\s]/g, '')
				.replace(/\s+/g, '-')
				.toLowerCase();
			break;
		}
	}

	const filename = `${company}-${role}-cover-letter.txt`;

	const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
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
(window as unknown as Record<string, unknown>).openAtsSidebar = openAtsSidebar;
(window as unknown as Record<string, unknown>).closeAtsSidebar = closeAtsSidebar;
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
(window as unknown as Record<string, unknown>).handleRefreshResume = handleRefreshResume;
(window as unknown as Record<string, unknown>).updatePolishButton = updatePolishButton;
(window as unknown as Record<string, unknown>).openJobScraperModal = openJobScraperModal;
(window as unknown as Record<string, unknown>).closeJobScraperModal = closeJobScraperModal;
(window as unknown as Record<string, unknown>).switchScraperPlatform = switchScraperPlatform;
(window as unknown as Record<string, unknown>).openLatestScrapingResults = openLatestScrapingResults;
(window as unknown as Record<string, unknown>).updateQueryPreview = updateQueryPreview;
(window as unknown as Record<string, unknown>).addCustomDomain = addCustomDomain;
(window as unknown as Record<string, unknown>).toggleAllDomains = toggleAllDomains;
(window as unknown as Record<string, unknown>).openQueryInBrowser = openQueryInBrowser;
(window as unknown as Record<string, unknown>).clearRoleError = clearRoleError;
(window as unknown as Record<string, unknown>).startScraping = startScraping;
(window as unknown as Record<string, unknown>).cancelScraping = cancelScraping;
(window as unknown as Record<string, unknown>).refreshScrapingResultsButton = refreshScrapingResultsButton;
(window as unknown as Record<string, unknown>).openResultsTabFromOverlay = openResultsTabFromOverlay;
(window as unknown as Record<string, unknown>).openCoverLetterModal = openCoverLetterModal;
(window as unknown as Record<string, unknown>).closeCoverLetterModal = closeCoverLetterModal;
(window as unknown as Record<string, unknown>).generateCoverLetter = generateCoverLetter;
(window as unknown as Record<string, unknown>).copyCoverLetter = copyCoverLetter;
(window as unknown as Record<string, unknown>).downloadCoverLetter = downloadCoverLetter;
(window as unknown as Record<string, unknown>).downloadResume = downloadResume;
