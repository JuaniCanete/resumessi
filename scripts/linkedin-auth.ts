import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { launchStealthBrowser } from '../src/scraper/browser';

const STORAGE_DIR = path.join(process.cwd(), 'data', 'storage-state');
const STORAGE_FILE = path.join(STORAGE_DIR, 'linkedin.json');

export async function generateLinkedInStorageState(): Promise<boolean> {
	if (!fs.existsSync(STORAGE_DIR)) {
		fs.mkdirSync(STORAGE_DIR, { recursive: true });
	}

	// Codegen mode (interactive manual login)
	console.info('[LinkedIn Auth] Opening browser for manual login...');
	console.info('[LinkedIn Auth] Please log in to LinkedIn in the browser window.');

	const { browser, context } = await launchStealthBrowser({ headless: false });
	const page = await context.newPage();
	await page.goto('https://www.linkedin.com/login');

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	await new Promise<void>(resolve => {
		rl.question('Press ENTER after you have logged in successfully to save session state...', () => {
			rl.close();
			resolve();
		});
	});

	await context.storageState({ path: STORAGE_FILE });
	console.info(`[LinkedIn Auth] Saved storage state to ${STORAGE_FILE} ✅`);
	await browser.close();
	return true;
}

// CLI entry point if executed directly via npm run scraper:auth / tsx scripts/linkedin-auth.ts
if (require.main === module) {
	const dotenv = require('dotenv');
	dotenv.config();

	generateLinkedInStorageState()
		.then(success => {
			process.exit(success ? 0 : 1);
		})
		.catch(err => {
			console.error(err);
			process.exit(1);
		});
}
