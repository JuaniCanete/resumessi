import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, cpSync, rmSync } from 'node:fs';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'jobdata.db');
const WAL_PATH = `${DB_PATH}-wal`;
const SHM_PATH = `${DB_PATH}-shm`;

function attemptWALRecovery(): Promise<boolean> {
	console.info('[Recovery] Attempting WAL recovery...');

	if (!existsSync(WAL_PATH)) {
		console.info('[Recovery] No WAL file found');
		return Promise.resolve(false);
	}

	// Create a copy of the database to attempt recovery
	const recoveryDir = join(DATA_DIR, 'recovery');
	if (existsSync(recoveryDir)) {
		rmSync(recoveryDir, { recursive: true, force: true });
	}
	cpSync(DB_PATH, join(recoveryDir, 'jobdata.db'));
	cpSync(WAL_PATH, join(recoveryDir, 'jobdata.db-wal'));
	if (existsSync(SHM_PATH)) {
		cpSync(SHM_PATH, join(recoveryDir, 'jobdata.db-shm'));
	}

	try {
		const db = new Database(join(recoveryDir, 'jobdata.db'));

		// Force checkpoint
		db.pragma('wal_checkpoint(TRUNCATE)');

		// Check tables
		const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
		console.info('[Recovery] Tables found:', tables.map(t => t.name).join(', '));

		const dashboard = db.prepare('SELECT * FROM job_dashboard').all();
		const saved = db.prepare('SELECT * FROM saved_jobs').all();
		const scraped = db.prepare('SELECT * FROM scraping_results').all();
		const runs = db.prepare('SELECT * FROM scraper_runs').all();

		console.info('[Recovery] job_dashboard:', dashboard.length);
		console.info('[Recovery] saved_jobs:', saved.length);
		console.info('[Recovery] scraping_results:', scraped.length);
		console.info('[Recovery] scraper_runs:', runs.length);

		if (dashboard.length > 0 || saved.length > 0 || scraped.length > 0 || runs.length > 0) {
			console.info('[Recovery] Data recovered! Copying back to main database...');
			db.close();

			// Copy recovered database back
			cpSync(join(recoveryDir, 'jobdata.db'), DB_PATH);
			if (existsSync(join(recoveryDir, 'jobdata.db-wal'))) {
				cpSync(join(recoveryDir, 'jobdata.db-wal'), WAL_PATH);
			}
			if (existsSync(join(recoveryDir, 'jobdata.db-shm'))) {
				cpSync(join(recoveryDir, 'jobdata.db-shm'), SHM_PATH);
			}

			console.info('[Recovery] Recovery complete!');
			return Promise.resolve(true);
		}

		db.close();
		console.info('[Recovery] No data recovered from WAL');
		return Promise.resolve(false);
	} catch (err: unknown) {
		console.error('[Recovery] Error:', (err as Error).message);
		return Promise.resolve(false);
	}
}

function listBackupTimestamps(): Promise<string[]> {
	const BACKUP_DIR = join(DATA_DIR, 'backups');
	if (!existsSync(BACKUP_DIR)) return Promise.resolve([]);

	const files = require('node:fs').readdirSync(BACKUP_DIR);
	const timestamps = new Set<string>();

	for (const file of files) {
		const match = file.match(/^jobdata\.db(-wal|-shm)?\.(.+)$/);
		if (match) {
			timestamps.add(match[2]);
		}
	}

	return Promise.resolve(Array.from(timestamps).sort().reverse());
}

function restoreFromBackup(timestamp: string): Promise<boolean> {
	const BACKUP_DIR = join(DATA_DIR, 'backups');

	for (const file of ['jobdata.db', 'jobdata.db-wal', 'jobdata.db-shm']) {
		const src = join(BACKUP_DIR, `${file}.${timestamp}`);
		const dest = join(DATA_DIR, file);
		if (existsSync(src)) {
			cpSync(src, dest);
			console.info(`[Recovery] Restored ${file} from ${timestamp}`);
		}
	}
	return Promise.resolve(true);
}

// CLI
async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const command = args[0];

	switch (command) {
		case 'wal': {
			await attemptWALRecovery();
			break;
		}
		case 'list-backups': {
			const backupsList = await listBackupTimestamps();
			if (backupsList.length === 0) {
				console.info('No backups found');
			} else {
				console.info('Available backups:');
				for (const ts of backupsList) {
					console.info(`  ${ts}`);
				}
			}
			break;
		}
		case 'restore': {
			const ts = args[1];
			if (!ts) {
				console.error('Usage: tsx scripts/recover-db.ts restore <timestamp>');
				process.exit(1);
			}
			const backups = await listBackupTimestamps();
			if (!backups.includes(ts)) {
				console.error(`Backup not found: ${ts}`);
				process.exit(1);
			}
			await restoreFromBackup(ts);
			console.info('Restore complete');
			break;
		}
		default: {
			console.info('Usage: tsx scripts/recover-db.ts <wal|list-backups|restore> [timestamp]');
		}
	}
}

main().catch(err => {
	console.error('[Recovery] Fatal error:', err);
	process.exit(1);
});
