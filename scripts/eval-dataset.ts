import { join, extname, basename } from 'node:path';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

export interface Golden<TInput, TExpected> {
	id: string;
	name: string;
	input: TInput;
	expected: TExpected;
	metadata?: {
		difficulty?: 'easy' | 'hard' | 'edge';
		tags?: string[];
	};
}

export interface GoldenDataset<TInput, TExpected> {
	promptType: string;
	goldens: Golden<TInput, TExpected>[];
}

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function readText(path: string): string {
	return readFileSync(path, 'utf-8');
}

function loadGoldenFromDir<TInput, TExpected>(dir: string): Golden<TInput, TExpected>[] {
	const goldens: Golden<TInput, TExpected>[] = [];
	const files = readdirSync(dir);

	const inputFiles = files.filter(
		f =>
			f.startsWith('input-') ||
			f.startsWith('jd-') ||
			f.startsWith('resume-') ||
			f.startsWith('pdf-') ||
			f.startsWith('raw-') ||
			f.startsWith('query-')
	);

	for (const inputFile of inputFiles) {
		const id = basename(inputFile, extname(inputFile));
		const expectedFile = files.find(f => f.startsWith(`expected-${id}.`) || f === 'expected-output.json');

		if (!expectedFile) {
			console.warn(`  ⚠ No expected output for ${inputFile} in ${dir}`);
			continue;
		}

		const inputPath = join(dir, inputFile);
		const expectedPath = join(dir, expectedFile);

		let input: TInput;
		if (extname(inputFile) === '.json') {
			input = readJson<TInput>(inputPath);
		} else {
			input = readText(inputPath) as unknown as TInput;
		}

		const expected = readJson<TExpected>(expectedPath);

		goldens.push({
			id,
			name: id,
			input,
			expected,
			metadata: { difficulty: 'easy', tags: [] },
		});
	}

	return goldens;
}

export function loadGoldens<TInput, TExpected>(promptType: string): Golden<TInput, TExpected>[] {
	const baseDir = join(process.cwd(), 'tests', 'evals', 'goldens', promptType);

	if (!existsSync(baseDir)) {
		console.warn(`  ⚠ Golden directory not found: ${baseDir}`);
		return [];
	}

	return loadGoldenFromDir<TInput, TExpected>(baseDir);
}

export function loadAllGoldens(): Map<string, Golden<unknown, unknown>[]> {
	const goldensMap = new Map<string, Golden<unknown, unknown>[]>();
	const goldensDir = join(process.cwd(), 'tests', 'evals', 'goldens');

	if (!existsSync(goldensDir)) {
		return goldensMap;
	}

	const promptTypes = readdirSync(goldensDir, { withFileTypes: true })
		.filter(d => d.isDirectory())
		.map(d => d.name);

	for (const promptType of promptTypes) {
		const goldens = loadGoldens<unknown, unknown>(promptType);
		if (goldens.length > 0) {
			goldensMap.set(promptType, goldens);
			console.info(`  ✓ Loaded ${goldens.length} goldens for ${promptType}`);
		}
	}

	return goldensMap;
}

export function listAvailablePromptTypes(): string[] {
	const goldensDir = join(process.cwd(), 'tests', 'evals', 'goldens');

	if (!existsSync(goldensDir)) {
		return [];
	}

	return readdirSync(goldensDir, { withFileTypes: true })
		.filter(d => d.isDirectory())
		.map(d => d.name);
}
