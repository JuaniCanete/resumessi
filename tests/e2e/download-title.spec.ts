import { test, expect } from '@playwright/test';

test('downloadResume sets document.title to the resume owner before printing', async ({ page }) => {
	// Isolate from any real resume data on disk: force loadResumeData() to fall
	// through to /demo/resume-demo-data.json (Lionel Messi) by 404-ing the
	// generated-output paths that take priority.
	await page.route('**/src/resume/output/resume-data-AI-polished.json', r => r.fulfill({ status: 404 }));
	await page.route('**/src/resume/output/resume-data.json', r => r.fulfill({ status: 404 }));

	await page.addInitScript(() => {
		(window as unknown as { print: () => string }).print = () => document.title;
	});

	await page.goto('/public/main.html');
	await page.waitForFunction(() => (window as unknown as { print: () => string }).print);

	const debug = await page.evaluate(() => {
		const btn = document.getElementById('btn-download') as HTMLButtonElement;
		btn.click();
		return {
			titleAfterClick: document.title,
			titleAtPrint: (window.print as unknown as () => string)(),
		};
	});

	expect(debug.titleAtPrint).toBe('Lionel Messi - Resume');
});
