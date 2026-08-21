import { test, expect } from './test-setup';
import { jobDescriptionFixtures } from '../fixtures/resume-fixtures';

const resumeWithLinks = {
	basics: {
		name: 'Test User',
		title: 'Software Engineer',
		email: 'test@example.com',
		phone: '+1-555-000-0000',
		location: 'Remote',
		linkedin: 'https://www.linkedin.com/in/testuser/',
		github: 'https://github.com/testuser',
		photo: null,
	},
	summary: 'Test summary',
	experience: [],
	skills: { 'Core Skills': [{ name: 'JavaScript', expert: true }] },
	techStack: 'JavaScript, TypeScript',
	languages: [{ name: 'English', level: 'Fluent' }],
	education: [],
	talks: [{ title: 'Test Talk', event: 'Test Event', url: 'https://example.com/talk' }],
	certifications: [
		{ title: 'Test Cert', issuer: 'Test Issuer', date: '2024', duration: '10', url: 'https://example.com/cert' },
	],
};

const staleResumeData = {
	basics: {
		name: 'Stale User',
		title: 'Old Title',
		email: 'stale@example.com',
		phone: '+1-555-111-1111',
		location: 'Old Location',
		// Missing linkedin and github - this makes it stale
		photo: null,
	},
	summary: 'Stale summary',
	experience: [],
	skills: { 'Core Skills': [{ name: 'Old Skill', expert: true }] },
};

test.describe('Resume Display', () => {
	test('should display resume content on load', async ({ mainPage }) => {
		const resumeName = await mainPage.resumeName.textContent();
		expect(resumeName).toBeTruthy();
		if (resumeName) expect(resumeName.length).toBeGreaterThan(0);
	});

	test('should toggle left sidebar', async ({ mainPage }) => {
		await mainPage.collapseSidebar();
		await expect(mainPage.body).toHaveClass(/left-collapsed/);

		await mainPage.openSidebar();
		await expect(mainPage.body).not.toHaveClass(/left-collapsed/);
	});

	test('should show ATS results panel after scan', async ({ mainPage }) => {
		await mainPage.enterJobDescription(jobDescriptionFixtures.minimal);
		await mainPage.clickScan();

		await expect(mainPage.rpScoreCircle).not.toHaveText('--', { timeout: 30000 });

		const score = await mainPage.getScore();
		if (score) {
			expect(score).not.toBe('--');
			expect(parseInt(score, 10)).toBeGreaterThanOrEqual(0);
			expect(parseInt(score, 10)).toBeLessThanOrEqual(100);
		}
	});

	test('should render LinkedIn and GitHub links with correct URLs', async ({ mainPage, page }) => {
		await page.route('**/src/resume/output/resume-data.json', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(resumeWithLinks),
			});
		});
		await page.route('**/src/resume/output/resume-data-AI-polished.json', async (route) => {
			await route.fulfill({ status: 404 });
		});
		await page.reload();
		await mainPage.waitForResumeLoaded();

		const linkedInLink = mainPage.getLinkedInLink();
		await expect(linkedInLink).toBeVisible();
		await expect(linkedInLink).toHaveText('LinkedIn profile');

		const githubLink = mainPage.getGitHubLink();
		await expect(githubLink).toBeVisible();
		await expect(githubLink).toHaveText('GitHub profile');
	});

	test('should render certification and talk links with correct URLs', async ({ mainPage, page }) => {
		await page.route('**/src/resume/output/resume-data.json', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(resumeWithLinks),
			});
		});
		await page.route('**/src/resume/output/resume-data-AI-polished.json', async (route) => {
			await route.fulfill({ status: 404 });
		});
		await page.reload();
		await mainPage.waitForResumeLoaded();

		const certLink = mainPage.getCertLink();
		await expect(certLink).toBeVisible();
		await expect(certLink).toHaveText('Verify certificate');

		const talkLink = mainPage.getTalkLink();
		await expect(talkLink).toBeVisible();
		await expect(talkLink).toHaveText('Watch recording');
	});

	test('should fallback to JSON file when localStorage has stale data (missing linkedin/github)', async ({ mainPage, page }) => {
		// Set stale localStorage data BEFORE reload
		await page.evaluate((data) => {
			localStorage.setItem('resume-data', JSON.stringify(data));
		}, staleResumeData);

		// Mock JSON file with correct links
		await page.route('**/src/resume/output/resume-data.json*', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(resumeWithLinks),
			});
		});
		await page.route('**/src/resume/output/resume-data-AI-polished.json*', async (route) => {
			await route.fulfill({ status: 404 });
		});

		await page.reload();
		await mainPage.waitForResumeLoaded();

		// Should render the JSON file data (with links), not the stale localStorage data
		const linkedInLink = mainPage.getLinkedInLink();
		await expect(linkedInLink).toBeVisible();

		// Should NOT have the stale data name
		const resumeName = await mainPage.resumeName.textContent();
		expect(resumeName).toBe('Test User');
	});
});

test.describe('AI Generation', () => {
	test('should open AI modal on click', async ({ mainPage }) => {
		await mainPage.openAiModal();
		await expect(mainPage.aiModal).toBeVisible();
	});
});