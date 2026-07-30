import fs from 'fs';
import path from 'path';
import readline from 'readline';
import authenticator from 'authenticator';
import { launchStealthBrowser, randomDelay } from '../src/scraper/browser';

const STORAGE_DIR = path.join(process.cwd(), 'data', 'storage-state');
const STORAGE_FILE = path.join(STORAGE_DIR, 'linkedin.json');

export async function generateLinkedInStorageState(env: Record<string, string | undefined>): Promise<boolean> {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  const authMode = (env.LINKEDIN_AUTH || 'codegen').toLowerCase();
  console.log(`[LinkedIn Auth] Starting authentication in mode: '${authMode}'`);

  if (authMode === 'ai') {
    const email = env.LINKEDIN_EMAIL;
    const password = env.LINKEDIN_PASSWORD;
    const otpSecret = env.LINKEDIN_OTP_SECRET;

    if (!email || !password) {
      console.error('[LinkedIn Auth] LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set in .env for automated mode.');
      return false;
    }

    try {
      const { browser, context } = await launchStealthBrowser({ headless: false });
      const page = await context.newPage();

      console.log('[LinkedIn Auth] Navigating to LinkedIn login...');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
      await randomDelay(1500, 3000);

      console.log('[LinkedIn Auth] Filling credentials...');
      await page.fill('#username', email);
      await page.fill('#password', password);
      await randomDelay(1000, 2000);

      await page.click('button[type="submit"]');
      await page.waitForNavigation({ timeout: 15000 }).catch(() => {});

      const currentUrl = page.url();
      console.log(`[LinkedIn Auth] Landed on: ${currentUrl}`);

      // Check if 2FA/OTP prompt is present
      if (currentUrl.includes('checkpoint') || (await page.$('input[name="pin"]')) || (await page.$('#input__email_verification_pin'))) {
        console.log('[LinkedIn Auth] 2FA Checkpoint detected.');
        if (otpSecret) {
          try {
            const token = authenticator.generateToken(otpSecret);
            console.log(`[LinkedIn Auth] Generated TOTP token via authenticator: ${token}`);
            const pinInput = (await page.$('input[name="pin"]')) || (await page.$('#input__email_verification_pin')) || (await page.$('input[type="text"]'));
            if (pinInput) {
              await pinInput.fill(token);
              await randomDelay(500, 1500);
              await page.click('button[type="submit"]').catch(() => {});
              await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
            }
          } catch (err: unknown) {
            console.error('[LinkedIn Auth] Failed to generate/fill TOTP token:', (err as Error).message);
          }
        } else {
          console.log('[LinkedIn Auth] No LINKEDIN_OTP_SECRET in .env. Please complete 2FA manually in the open browser.');
          await randomDelay(15000, 30000);
        }
      }

      // Check if logged in
      const finalUrl = page.url();
      if (finalUrl.includes('/feed') || finalUrl.includes('/in/') || finalUrl.includes('/search') || !finalUrl.includes('login')) {
        await context.storageState({ path: STORAGE_FILE });
        console.log(`[LinkedIn Auth] Successfully saved storage state to ${STORAGE_FILE} ✅`);
        await browser.close();
        return true;
      } else {
        console.warn(`[LinkedIn Auth] Could not confirm successful login (URL: ${finalUrl}). Saving state anyway...`);
        await context.storageState({ path: STORAGE_FILE });
        await browser.close();
        return fs.existsSync(STORAGE_FILE);
      }
    } catch (err: unknown) {
      console.error('[LinkedIn Auth] Automated auth failed:', (err as Error).message);
      return false;
    }
  } else {
    // Codegen mode (interactive manual login)
    console.log('[LinkedIn Auth] Codegen mode: Opening browser for manual login...');
    console.log('[LinkedIn Auth] Please log in to LinkedIn in the browser window.');

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
    console.log(`[LinkedIn Auth] Saved storage state to ${STORAGE_FILE} ✅`);
    await browser.close();
    return true;
  }
}

// CLI entry point if executed directly via npm run scraper:auth / tsx scripts/linkedin-auth.ts
if (require.main === module) {
  const dotenv = require('dotenv');
  dotenv.config();

  generateLinkedInStorageState(process.env as Record<string, string | undefined>)
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
