import * as fs from 'fs';
import { execSync } from 'child_process';

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

let errors = 0;
let warnings = 0;

console.info(`${GREEN}Running PII and AI sloopy gate checks...${NC}\n`);

// Get staged files from git
let stagedFiles: string[] = [];
try {
	const output = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
	stagedFiles = output
		.split('\n')
		.map(f => f.trim())
		.filter(Boolean);
} catch {
	stagedFiles = [];
}

// 1. Forbidden files
console.info(`${CYAN}[*] Checking for forbidden patterns & PII files...${NC}`);
const forbiddenPatterns = [
	/\.env$/,
	/\.env\.local$/,
	/\.env\..+\.local$/,
	/storage\.state$/,
	/resume-data\.json$/,
	/resume-data-AI-polished\.json$/,
	/src\/resume\/output\/resume-data/,
	/src\/resume\/output\/photo/,
	/src\/resume\/prompt\.txt$/,
	/jobdata\.db$/,
	/jobdata\.db-wal$/,
	/jobdata\.db-shm$/,
];

for (const file of stagedFiles) {
	for (const pattern of forbiddenPatterns) {
		if (pattern.test(file)) {
			console.error(`${RED}[x] FATAL: Attempting to commit forbidden file: ${file}${NC}`);
			errors++;
		}
	}
}

// 2. Hardcoded secrets
console.info(`${CYAN}[*] Scanning for hardcoded secrets...${NC}`);
const secretPatterns = [
	/api[_-]?key\s*[=:]\s*["'][A-Za-z0-9_-]{20,}["']/i,
	/secret[_-]?key\s*[=:]\s*["'][A-Za-z0-9_-]{20,}["']/i,
	/password\s*[=:]\s*["'][^"']{8,}["']/i,
	/token\s*[=:]\s*["'][A-Za-z0-9_-]{20,}["']/i,
	/bearer\s+[A-Za-z0-9_-]{20,}/i,
	/sk_live_[A-Za-z0-9]{24,}/,
	/ghp_[A-Za-z0-9]{36,}/,
	/AKIA[0-9A-Z]{16}/,
];

const ignoreSecretFiles = /\.(png|jpg|jpeg|gif|svg|pdf|zip|bin|whl|md|example)$|(\.env\.example)$/i;
const placeholderTerms = ['your_', 'placeholder', 'example', 'xxx', '<your', 'test_key', 'mock_key', 'dummy'];

for (const file of stagedFiles) {
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
	if (ignoreSecretFiles.test(file)) continue;

	const content = fs.readFileSync(file, 'utf-8');
	for (const pattern of secretPatterns) {
		const match = content.match(pattern);
		if (match) {
			const matchedStr = match[0].toLowerCase();
			const isPlaceholder = placeholderTerms.some(term => matchedStr.includes(term));
			if (!isPlaceholder) {
				console.error(`${RED}[x] FATAL: Potential secret found in ${file}${NC}`);
				errors++;
			}
		}
	}
}

// 3. PII patterns (strict, excluding test/doc/mock/demo files)
console.info(`${CYAN}[*] Scanning for PII patterns...${NC}`);
const piiPatterns = [
	/\b\d{3}-\d{2}-\d{4}\b/, // SSN
	/\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/, // Credit Card
];

const excludePiiFiles = /(test|spec|example|fixture|mock|stub|placeholder|demo|\.md|\.html|\.txt)/i;

for (const file of stagedFiles) {
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
	if (ignoreSecretFiles.test(file) || excludePiiFiles.test(file)) continue;

	const content = fs.readFileSync(file, 'utf-8');
	for (const pattern of piiPatterns) {
		if (pattern.test(content)) {
			console.warn(`${YELLOW}[!] WARNING: Potential PII found in ${file}${NC}`);
			warnings++;
		}
	}
}

// 4. Personal resume data in source code
console.info(`${CYAN}[*] Scanning for personal resume data...${NC}`);
const personalDataPatterns = [
	/"name":\s*"Juan Ignacio/i,
	/"email":\s*"juanignaciocanete@/i,
	/"phone":\s*"\+54/i,
];

for (const file of stagedFiles) {
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
	if (!/\.(ts|js|json|tsx|jsx)$/i.test(file)) continue;
	if (/(test|spec|fixture|demo|plans)/i.test(file)) continue;

	const content = fs.readFileSync(file, 'utf-8');
	for (const pattern of personalDataPatterns) {
		if (pattern.test(content)) {
			console.error(`${RED}[x] FATAL: Personal resume data found in ${file}${NC}`);
			errors++;
		}
	}
}

// 5. Exposed environment variable values
console.info(`${CYAN}[*] Scanning for exposed env var values...${NC}`);
const exposedEnvPatterns = [
	/API_KEY\s*=\s*["'][a-zA-Z0-9_-]{20,}["']/i,
	/DATABASE_URL\s*=\s*["']postgres/i,
];

for (const file of stagedFiles) {
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
	if (!/\.(ts|js|tsx|jsx)$/i.test(file)) continue;
	if (/(test|spec|fixture|\.env\.example)/i.test(file)) continue;

	const content = fs.readFileSync(file, 'utf-8');
	for (const pattern of exposedEnvPatterns) {
		const match = content.match(pattern);
		if (match) {
			const matchedStr = match[0].toLowerCase();
			const isPlaceholder = placeholderTerms.some(term => matchedStr.includes(term));
			if (!isPlaceholder) {
				console.warn(`${YELLOW}[!] WARNING: Exposed env var in ${file}${NC}`);
				warnings++;
			}
		}
	}
}

// 6. Security anti-patterns
console.info(`${CYAN}[*] Checking for security anti-patterns...${NC}`);
const antiPatterns = [
	/\beval\(/,
	/(?<!\.)\bexec\(["'`]/,
];

for (const file of stagedFiles) {
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
	if (!/\.(ts|js|tsx|jsx)$/i.test(file)) continue;
	if (/(test|spec|scripts)/i.test(file)) continue;

	const content = fs.readFileSync(file, 'utf-8');
	for (const pattern of antiPatterns) {
		if (pattern.test(content)) {
			console.warn(`${YELLOW}[!] WARNING: Security anti-pattern in ${file}: ${pattern}${NC}`);
			warnings++;
		}
	}
}

// Summary
console.info('\n============================================');
if (errors > 0) {
	console.error(`${RED}[x] SECURITY & PII SCAN FAILED: ${errors} error(s)${NC}`);
	process.exit(1);
}

if (warnings > 0) {
	console.warn(`${YELLOW}[!] SECURITY & PII SCAN: ${warnings} warning(s)${NC}`);
}

if (errors === 0 && warnings === 0) {
	console.info(`${GREEN}[✓] SECURITY & PII SCAN PASSED${NC}`);
}

console.info('============================================\n');
process.exit(0);
