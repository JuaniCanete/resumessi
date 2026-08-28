import { join } from 'node:path';
import { existsSync, mkdirSync, cpSync, readdirSync, unlinkSync } from 'node:fs';

const DATA_DIR = join(process.cwd(), 'data');
const BACKUP_DIR = join(DATA_DIR, 'backups');
const DB_FILES = ['jobdata.db', 'jobdata.db-wal', 'jobdata.db-shm'];
const MAX_BACKUPS = 5;

function ensureBackupDir(): void {
	if (!existsSync(BACKUP_DIR)) {
		mkdirSync(BACKUP_DIR, { recursive: true });
	}
}

function getTimestamp(): string {
	const now = new Date();
	return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function createBackup(): string | null {
	ensureBackupDir();
	const timestamp = getTimestamp();
	let copied = false;

	for (const file of DB_FILES) {
		const src = join(DATA_DIR, file);
		if (existsSync(src)) {
			const dest = join(BACKUP_DIR, `${file}.${timestamp}`);
			cpSync(src, dest);
			copied = true;
		}
	}

	if (!copied) {
		console.warn('[Backup] No database files found to backup');
		return null;
	}

	console.info(`[Backup] Created backup: ${timestamp}`);
	return timestamp;
}

function cleanupOldBackups(): void {
	if (!existsSync(BACKUP_DIR)) return;

	const files = readdirSync(BACKUP_DIR);
	const backups = new Map<string, { timestamp: string; files: string[] }>();

	for (const file of files) {
		const match = file.match(/^(jobdata\.db(-wal|-shm)?)\.(.+)$/);
		if (match) {
			const timestamp = match[3];
			if (!backups.has(timestamp)) {
				backups.set(timestamp, { timestamp, files: [] });
			}
			backups.get(timestamp)!.files.push(file);
		}
	}

	const sorted = Array.from(backups.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

	if (sorted.length > MAX_BACKUPS) {
		for (let i = MAX_BACKUPS; i < sorted.length; i++) {
			for (const file of sorted[i].files) {
				try {
					unlinkSync(join(BACKUP_DIR, file));
					console.info(`[Backup] Removed old backup: ${file}`);
				} catch {
					// Ignore
				}
			}
		}
	}
}

function listBackups(): string[] {
	if (!existsSync(BACKUP_DIR)) return [];
	const files = readdirSync(BACKUP_DIR);
	const timestamps = new Set<string>();

	for (const file of files) {
		const match = file.match(/^jobdata\.db(-wal|-shm)?\.(.+)$/);
		if (match) {
			timestamps.add(match[2]);
		}
	}

	return Array.from(timestamps).sort().reverse();
}

function restoreBackup(timestamp: string): boolean {
	for (const file of DB_FILES) {
		const src = join(BACKUP_DIR, `${file}.${timestamp}`);
		const dest = join(DATA_DIR, file);
		if (existsSync(src)) {
			cpSync(src, dest);
			console.info(`[Backup] Restored ${file} from ${timestamp}`);
		} else {
			console.warn(`[Backup] Backup file not found: ${src}`);
			return false;
		}
	}
	return true;
}

export { createBackup, cleanupOldBackups, listBackups, restoreBackup };

// CLI interface - only run when executed directly
// Using __filename comparison with process.argv[1] (works with tsx ESM and CommonJS)
const isMainModule = __filename === process.argv[1];

if (isMainModule) {
	const args = process.argv.slice(2);
	const command = args[0];

	switch (command) {
		case 'create': {
			createBackup();
			cleanupOldBackups();
			break;
		}
		case 'list': {
			const backups = listBackups();
			if (backups.length === 0) {
				console.info('No backups found');
			} else {
				console.info('Available backups:');
				for (const ts of backups) {
					console.info(`  ${ts}`);
				}
			}
			break;
		}
		case 'restore': {
			const ts = args[1];
			if (!ts) {
				console.error('Usage: tsx scripts/backup-db.ts restore <timestamp>');
				process.exit(1);
			}
			if (!listBackups().includes(ts)) {
				console.error(`Backup not found: ${ts}`);
				process.exit(1);
			}
			if (restoreBackup(ts)) {
				console.info('Restore successful');
			} else {
				console.error('Restore failed');
				process.exit(1);
			}
			break;
		}
		default: {
			console.info('Usage: tsx scripts/backup-db.ts <create|list|restore> [timestamp]');
		}
	}
}
