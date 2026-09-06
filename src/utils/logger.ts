import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = process.cwd();
const DEBUG_DIR = path.join(ROOT_DIR, 'debugging');
const LOGS_DIR = path.join(DEBUG_DIR, 'logs');
const SCRAPER_DEBUG_DIR = path.join(DEBUG_DIR, 'scraper');

function getSafeTimestamp(): string {
	return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
}

export function isVerboseDebugEnabled(): boolean {
	return process.env.VERBOSE_DEBUG === 'true';
}

export function isScraperDebugEnabled(): boolean {
	return isVerboseDebugEnabled() || process.env.SCRAPER_DEBUG === 'true';
}

function ensureDir(dirPath: string): void {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

let sessionLogStream: fs.WriteStream | null = null;
let originalInfo: typeof console.info | null = null;
let originalWarn: typeof console.warn | null = null;
let originalError: typeof console.error | null = null;

export function initSessionLogger(): void {
	if (!isVerboseDebugEnabled() || sessionLogStream) {
		return;
	}

	ensureDir(LOGS_DIR);
	const timestamp = getSafeTimestamp();
	const sessionLogPath = path.join(LOGS_DIR, `session-${timestamp}.log`);
	sessionLogStream = fs.createWriteStream(sessionLogPath, { flags: 'a' });

	originalInfo = console.info.bind(console);
	originalWarn = console.warn.bind(console);
	originalError = console.error.bind(console);

	const writeLog = (level: string, args: unknown[]): void => {
		if (!sessionLogStream) return;
		const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
		sessionLogStream.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`);
	};

	console.info = (...args: unknown[]) => {
		writeLog('INFO', args);
		if (originalInfo) originalInfo(...args);
	};

	console.warn = (...args: unknown[]) => {
		writeLog('WARN', args);
		if (originalWarn) originalWarn(...args);
	};

	console.error = (...args: unknown[]) => {
		writeLog('ERROR', args);
		if (originalError) originalError(...args);
	};

	console.info(`[Logger] [✓] Session debug logging active: ${sessionLogPath}`);
}

export interface ScraperDebugSession {
	dir: string;
	log: (message: string, level?: 'INFO' | 'WARN' | 'ERROR') => void;
	saveArtifact: (filename: string, content: string | Buffer) => void;
}

export function createScraperDebugSession(source: string): ScraperDebugSession {
	if (!isScraperDebugEnabled()) {
		return {
			dir: '',
			log: () => {},
			saveArtifact: () => {},
		};
	}

	const timestamp = getSafeTimestamp();
	const sessionDir = path.join(SCRAPER_DEBUG_DIR, `${source}-${timestamp}`);
	ensureDir(sessionDir);
	const logFilePath = path.join(sessionDir, `${source}.log`);

	const logToFile = (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void => {
		try {
			const entry = `[${new Date().toISOString()}] [${level}] ${message}\n`;
			fs.appendFileSync(logFilePath, entry, 'utf-8');
		} catch (err: unknown) {
			console.warn('[Logger] [⚠] Failed to write scraper log:', (err as Error).message);
		}
	};

	const saveArtifact = (filename: string, content: string | Buffer): void => {
		try {
			const filePath = path.join(sessionDir, filename);
			fs.writeFileSync(filePath, content);
			logToFile(`Saved artifact: ${filename}`);
		} catch (err: unknown) {
			console.warn(`[Logger] [⚠] Failed to save artifact ${filename}:`, (err as Error).message);
		}
	};

	logToFile(`Started scrape session for source: ${source}`);

	return {
		dir: sessionDir,
		log: logToFile,
		saveArtifact,
	};
}

export function logInferenceCall(callData: Record<string, unknown>): void {
	if (!isVerboseDebugEnabled()) {
		return;
	}

	try {
		ensureDir(LOGS_DIR);
		const timestamp = getSafeTimestamp();
		const randomSuffix = Math.random().toString(36).substring(2, 7);
		const logFilePath = path.join(LOGS_DIR, `inference-${timestamp}-${randomSuffix}.log`);
		fs.writeFileSync(logFilePath, JSON.stringify(callData, null, 2), 'utf-8');
	} catch (err: unknown) {
		console.warn('[Logger] [⚠] Failed to write inference call log:', (err as Error).message);
	}
}
