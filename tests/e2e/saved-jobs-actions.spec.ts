import { test, expect } from './test-setup';

const SAVED_JOB = {
	title: 'Saved Job Result',
	url: 'https://example.com/job/saved',
	snippet: 'A saved job',
	source: 'linkedin' as const,
	company: 'Example Corp',
	postedDate: '2 days ago',
	saved: true,
};

test.describe('saved jobs card actions', () => {
	test('Run ATS opens the JD review modal with the saved description', async ({ findJobPage }) => {
		await findJobPage.mockSavedJobs([SAVED_JOB]);
		await findJobPage.mockJd('Mocked saved job description');

		await findJobPage.goto();
		await findJobPage.gotoSaved();

		await findJobPage.getSavedCardAction(0, 'runATS').click();

		await expect(findJobPage.jdEditModal).toBeVisible();
		await expect(findJobPage.jdEditTextarea).toBeEnabled();
		await expect(findJobPage.jdEditTextarea).toHaveValue(/Mocked saved job description/);
	});

	test('Show JD opens the JD view modal with the saved description', async ({ findJobPage }) => {
		await findJobPage.mockSavedJobs([SAVED_JOB]);
		await findJobPage.mockJd('Saved JD from database');

		await findJobPage.goto();
		await findJobPage.gotoSaved();

		await findJobPage.getSavedCardAction(0, 'showJD').click();

		await expect(findJobPage.jdViewModal).toBeVisible();
		await expect(findJobPage.jdViewBody).toContainText('Saved JD from database');
	});

	test('Run ATS is rendered but disabled for collection-page saved jobs', async ({ findJobPage }) => {
		const collectionJob = { ...SAVED_JOB, url: 'https://www.linkedin.com/jobs/collections/123' };
		await findJobPage.mockSavedJobs([collectionJob]);

		await findJobPage.goto();
		await findJobPage.gotoSaved();

		await expect(findJobPage.getSavedCardAction(0, 'runATS')).toBeDisabled();
		await expect(findJobPage.getSavedCardAction(0, 'showJD')).toBeVisible();
	});

	test('Other saved actions (Unsave, Applied?) remain alongside Run ATS and Show JD', async ({ findJobPage }) => {
		await findJobPage.mockSavedJobs([SAVED_JOB]);

		await findJobPage.goto();
		await findJobPage.gotoSaved();

		await expect(findJobPage.getSavedCardAction(0, 'runATS')).toBeVisible();
		await expect(findJobPage.getSavedCardAction(0, 'showJD')).toBeVisible();
		await expect(findJobPage.getSavedCardAction(0, 'unsave')).toBeVisible();
		await expect(findJobPage.getSavedCardAction(0, 'apply')).toBeVisible();
	});
});
